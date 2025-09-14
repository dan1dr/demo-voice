import json
import random
import time
import gevent
import locust
import os
from pathlib import Path
from locust import User, task, events, constant_throughput
import websocket
from dotenv import load_dotenv

# Load .env from repo root (adjust if your .env lives elsewhere)
load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")

# Averages up to 10 seconds of audio when played, depends on the voice speed
DEFAULT_TEXT = (
    "Hello, this is a test message. I am testing if a long input will cause issues for the model "
    "like this sentence. "
)

TEXT_ARRAY = [
    "Hello.",
    "Hello, this is a test message.",
    DEFAULT_TEXT,
    DEFAULT_TEXT * 2,
    DEFAULT_TEXT * 3,
]

# Custom command line arguments
@events.init_command_line_parser.add_listener
def on_parser_init(parser):
    parser.add_argument("--api-key", default=os.getenv("ELEVENLABS_API_KEY"), help="API key for authentication")
    parser.add_argument("--encoding", default="mp3_22050_32", help="Encoding")
    parser.add_argument("--text", default=DEFAULT_TEXT, help="Text to use")
    parser.add_argument("--use-text-array", default="false", help="Use random text from TEXT_ARRAY (true/false)")
    # 👉 Use a real voice id (replace with one from your account if you prefer)
    parser.add_argument("--voice-id", default="JBFqnCBsd6RMkjVDRZzb", help="Voice ID")

class WebSocketTTSUser(User):
    # Each user will send a request every 20 seconds, regardless of how long each request takes
    wait_time = constant_throughput(0.05)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        opts = self.environment.parsed_options
        self.api_key = opts.api_key
        self.voice_id = opts.voice_id
        self.text = opts.text
        self.encoding = opts.encoding
        self.use_text_array = str(opts.use_text_array).lower() == "true"  # parse bool
        if self.use_text_array:
            self.text = random.choice(TEXT_ARRAY)
        self.all_recieved = False

        if not self.api_key:
            raise RuntimeError("ELEVENLABS_API_KEY not found. Load .env or pass --api-key.")

    @task
    def tts_task(self):
        # Do jitter waiting of up to 1 second
        # Users appear to be spawned every second so this ensures requests are not aligned
        gevent.sleep(random.random())
        max_wait_time = 10

        # Connection details
        uri = f"{self.environment.host}/v1/text-to-speech/{self.voice_id}/stream-input?auto_mode=true&output_format={self.encoding}"
        headers = [f"xi-api-key: {self.api_key}"] 

        ws = None
        self.all_recieved = False
        try:
            init_msg = {"text": " "}
            # Use proper header format for websocket - this is case sensitive!
            ws = websocket.create_connection(uri, header=headers)
            ws.settimeout(max_wait_time)
            ws.send(json.dumps(init_msg))
            # Start measuring after websocket initiated but before any messages are sent
            send_request_time = time.perf_counter()
            ws.send(json.dumps({"text": self.text}))
            # Send to flush and receive the audio
            ws.send(json.dumps({"text": ""}))

            def _receive():
                t_first_response = None
                audio_size = 0
                try:
                    while True:
                        # Wait up to 10 seconds for a response
                        raw = ws.recv()

                        # Helpful guard: if server returned HTML (e.g., 401), show it
                        if isinstance(raw, str) and raw.lstrip().startswith("<"):
                            raise Exception(f"Non-JSON response (likely HTTP/HTML error). First 200 chars:\n{raw[:200]}")

                        # Parse JSON
                        try:
                            response_data = json.loads(raw)
                        except json.JSONDecodeError:
                            # If server sent non-JSON, surface first chars for debugging
                            snippet = raw[:200] if isinstance(raw, str) else f"<{len(raw)} bytes>"
                            raise Exception(f"Non-JSON frame received. First 200 chars: {snippet}")

                        if response_data.get("audio"):
                            audio_size += len(response_data["audio"])

                        if t_first_response is None:
                            t_first_response = time.perf_counter()
                            first_byte_ms = (t_first_response - send_request_time) * 1000
                            if audio_size == 0:  # ✅ was 'is None' before; use == 0
                                # The first response should always have audio
                                locust.events.request.fire(
                                    request_type="websocket",
                                    name="Bad Response (no audio)",
                                    response_time=first_byte_ms,
                                    response_length=audio_size,
                                    exception=Exception("Response has no audio"),
                                )
                                break

                        if response_data.get("isFinal"):
                            # Fire this event once finished streaming, but report the important TTFB metric
                            locust.events.request.fire(
                                request_type="websocket",
                                name="TTS Stream Success (First Byte)",
                                response_time=first_byte_ms,
                                response_length=audio_size,
                                exception=None,
                            )
                            break

                except websocket.WebSocketTimeoutException:
                    locust.events.request.fire(
                        request_type="websocket",
                        name="TTS Stream Timeout",
                        response_time=max_wait_time * 1000,
                        response_length=audio_size,
                        exception=Exception("Timeout waiting for response"),
                    )
                except Exception as e:
                    # Typically JSON decode error if the server returns HTTP backoff error
                    locust.events.request.fire(
                        request_type="websocket",
                        name="TTS Stream Failure",
                        response_time=0,
                        response_length=audio_size,
                        exception=e,
                    )
                finally:
                    self.all_recieved = True

            gevent.spawn(_receive)
            # Sleep until recieved so new tasks aren't spawned
            while not self.all_recieved:
                gevent.sleep(0.2)

        finally:
            # Try and close the websocket gracefully
            try:
                if ws:
                    ws.close()
            except Exception:
                pass
