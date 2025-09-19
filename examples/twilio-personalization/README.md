# ElevenLabs Twilio Personalization Webhook

This example demonstrates how to create a webhook for ElevenLabs Twilio personalization following the [official documentation](https://elevenlabs.io/docs/agents-platform/phone-numbers/twilio-integration/customising-calls).

## Features

- Fastify server with personalization webhook endpoint
- Mock customer database for demonstration
- Dynamic response based on caller ID
- Configurable prompts and voice selection based on customer tier
- Error handling with fallback responses

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The server will start on port 5050 by default.

## Exposing with ngrok

1. Install ngrok if you haven't already
2. Run ngrok to expose your local server:
```bash
ngrok http 5050
```

3. Copy the ngrok HTTPS URL (e.g., `https://abc123.ngrok.io`)
4. In the ElevenLabs dashboard, configure the webhook URL as:
   ```
   https://abc123.ngrok.io/get-personal
   ```

## Webhook Endpoint

**POST** `/get-personal`

Receives Twilio call data and returns personalization configuration.

### Request Parameters

- `caller_id`: Phone number of the caller
- `agent_id`: ID of the ElevenLabs agent
- `called_number`: Twilio number that was called
- `call_sid`: Unique Twilio call identifier

### Response Format

Returns a JSON object with:
- `type`: Always "conversation_initiation_client_data"
- `dynamic_variables`: Customer-specific data
- `conversation_config_override`: Agent configuration overrides

### Example Response

```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": {
    "customer_name": "John Doe",
    "account_status": "premium",
    "last_interaction": "2024-01-15",
    "customer_balance": "$1,250.00",
    "customer_location": "San Francisco"
  },
  "conversation_config_override": {
    "agent": {
      "prompt": {
        "prompt": "You are a helpful customer service representative. The customer's name is John Doe..."
      },
      "first_message": "Hi John Doe! Thank you for calling. I see you're one of our premium customers. How can I help you today?",
      "language": "en"
    },
    "tts": {
      "voice_id": "21m00Tcm4TlvDq8ikWAM"
    }
  }
}
```

## Customer Database

The example includes a mock customer database with sample data:
- Premium customers get a different voice and personalized greeting
- Standard customers get the default experience
- Unknown callers get a generic but friendly response

## Testing

You can test the webhook locally by sending a POST request:

```bash
curl -X POST http://localhost:5050/get-personal \
  -H "Content-Type: application/json" \
  -d '{
    "caller_id": "+1234567890",
    "agent_id": "your-agent-id",
    "called_number": "+1555000000",
    "call_sid": "test-call-sid"
  }'
```

## Configuration in ElevenLabs Dashboard

1. Go to your agent settings in the ElevenLabs dashboard
2. Navigate to the "Security" tab
3. Enable "Fetch conversation initiation data for inbound Twilio calls"
4. Configure the webhook URL with your ngrok URL + `/get-personal`
5. Add any required authentication headers if needed
