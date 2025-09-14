import os
from io import BytesIO
from elevenlabs.client import ElevenLabs
from elevenlabs import play
from dotenv import load_dotenv
from collections import deque

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
elevenlabs = ElevenLabs(
    api_key=ELEVENLABS_API_KEY
)

paragraphs = [
    "El Siglo de Oro español, que abarcó desde finales del siglo XV hasta mediados del XVII, ",
    "representa uno de los períodos más brillantes y extraordinarios de la cultura occidental.",
    "Durante esta época dorada, España no solo dominó los mares y conquistó vastos territorios, ",
    "sino que también alumbró una constelación de genios literarios que transformaron para siempre las letras universales.",
    "Cervantes inmortalizó la condición humana con su Don Quijote, ",
    "mientras que Lope de Vega y Calderón de la Barca revolucionaron el teatro europeo ",
    "con su creatividad desbordante y su profunda comprensión del alma española."
]


request_ids = deque(maxlen=3) # max 3 previous request ids since v2 allows only 3 max previous request ids
audio_buffers = []

for paragraph in paragraphs:
    with elevenlabs.text_to_speech.with_raw_response.convert(
        text=paragraph,
        voice_id="sDuUJMeNJR828mXTRrDh",
        model_id="eleven_multilingual_v2",
        previous_request_ids=list(request_ids),  # send <=3
    ) as response:
        # prefer history-item-id, fallback to request-id
        rid = response._response.headers.get("history-item-id") or response._response.headers.get("request-id")
        if rid:
            request_ids.append(rid)

        audio_data = b"".join(chunk for chunk in response.data)
        audio_buffers.append(BytesIO(audio_data))

combined_stream = BytesIO(b''.join(buffer.getvalue() for buffer in audio_buffers))
play.play(combined_stream)