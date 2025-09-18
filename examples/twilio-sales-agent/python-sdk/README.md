Twilio ↔ ElevenLabs (Python SDK)

Prerequisites
- Python 3.10+
- Twilio account, phone number, Account SID and Auth Token
- ElevenLabs API key and Agent ID
- ngrok installed

Environment
Create `.env` at repo root:
ELEVENLABS_API_KEY=... 
ELEVENLABS_AGENT_ID=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+15551234567

Install
Using Poetry (recommended):
poetry install

Or pip:
pip install -r ../../../../requirements.txt

Inbound (receive calls)
1) Start server:
uvicorn examples/twilio-sales-agent/python-sdk/main:app --host 0.0.0.0 --port 8000 --workers 1
2) Tunnel:
ngrok http 8000
3) Configure Twilio number webhook (Voice > A Call Comes In) to:
https://<ngrok-host>/twilio/inbound_call
4) Call your Twilio number. You should hear the agent and see transcripts in logs.

Outbound (place calls)
1) Start server:
uvicorn examples/twilio-sales-agent/python-sdk/outbound:app --host 0.0.0.0 --port 8000 --workers 1
2) Tunnel:
ngrok http 8000
3) Trigger a call:
curl -X POST https://<ngrok-host>/outbound-call \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "number=+15551234567"

Optional overrides:
--data-urlencode "prompt=You are Eric..." \
--data-urlencode "first_message=Hola..."

Notes
- Audio: inbound Twilio 8 kHz µ-law is decoded and upsampled to 16 kHz PCM for ElevenLabs; agent audio is forwarded back to Twilio. 
- Set DEBUG_LOGS=true to enable verbose logging.

