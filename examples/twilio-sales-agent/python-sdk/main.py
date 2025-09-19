import os
import json
import traceback
from dotenv import load_dotenv

from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import HTMLResponse
from twilio.twiml.voice_response import VoiceResponse, Connect
from elevenlabs import ElevenLabs
from elevenlabs.conversational_ai.conversation import Conversation
from twilio_audio import TwilioAudioInterface
from starlette.websockets import WebSocketDisconnect

load_dotenv("../../../.env")

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID")

app = FastAPI()

# Health check endpoint
@app.get("/")
async def root():
    return {"message": "Twilio-ElevenLabs Server is running"}

# Handle incoming call
@app.post("/twilio/inbound_call")
async def handle_incoming_call(request: Request):
    form_data = await request.form()
    call_sid = form_data.get("CallSid", "Unknown")
    from_number = form_data.get("From", "Unknown")
    print(f"Incoming call from {from_number} with call SID {call_sid}")

    response = VoiceResponse()
    connect = Connect()
    connect.stream(url=f"wss://{request.url.hostname}/media-stream")
    response.append(connect)
    return HTMLResponse(content=str(response), media_type="application/xml")

# Handle media stream
@app.websocket("/media-stream")
async def handle_media_stream(websocket: WebSocket):
    await websocket.accept()
    print(f"WebSocket connection established for call {websocket.client}")

    audio_interface = TwilioAudioInterface(websocket)
    elevenlabs_client = ElevenLabs(api_key=ELEVENLABS_API_KEY)

    try:
        conversation = Conversation(
            client=elevenlabs_client,
            agent_id=ELEVENLABS_AGENT_ID,
            requires_auth=True,
            audio_interface=audio_interface,
            callback_agent_response=lambda text: print(f"Agent response: {text}"),
            callback_user_transcript=lambda text: print(f"User transcript: {text}")
        )

        conversation.start_session()
        print(f"Conversation started for call {websocket.client}")

        async for message in websocket.iter_text():
            if not message:
                continue
            await audio_interface.handle_twilio_message(json.loads(message))

    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"Error in media stream: {e}")
        traceback.print_exc()
    finally:
        try:
            conversation.end_session()
            conversation.wait_for_session_end()
            print(f"Conversation ended for call {websocket.client}")
        except Exception as e:
            print(f"Error ending conversation: {e}")
            traceback.print_exc()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
