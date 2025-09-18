Twilio ↔ ElevenLabs (JavaScript)

Prerequisites
- Node 18+
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
cd examples/twilio-sales-agent/javascript
npm install

Inbound (receive calls)
1) Start server:
node index.js
2) Tunnel:
ngrok http 8000
3) Configure Twilio number webhook (Voice > A Call Comes In) to:
https://<ngrok-host>/twilio/inbound_call

Outbound (place calls)
1) Start server:
node outbound.js
2) Tunnel:
ngrok http 8000
3) Trigger a call (just number):
curl -X POST https://<ngrok-host>/outbound-call \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "number=+15551234567"

Optional overrides:
--data-urlencode "prompt=You are Eric..." \
--data-urlencode "first_message=Hola..."

Notes
- Audio: Twilio 8 kHz µ-law is decoded and upsampled to 16 kHz PCM before sending to ElevenLabs; ElevenLabs audio is forwarded to Twilio.
- Ensure your ngrok host matches server port and Twilio webhooks.

