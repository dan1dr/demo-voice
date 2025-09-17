# ElevenLabs Twilio Personalization Webhook (Python Implementation)

This is the Python implementation of the interactive name-based personalization webhook, complementing the TypeScript version in the parent directory.

## Features

- 🐍 **FastAPI** server with automatic OpenAPI documentation  
- 🔄 **Interactive personalization** - asks for caller's name first
- 📊 **Mock customer database** with different customer tiers
- 🎯 **Dynamic responses** based on customer status (premium/standard/new)
- 🛡️ **Error handling** with graceful fallbacks
- 📝 **Comprehensive logging** for debugging
- 🔧 **Pydantic models** for type safety and validation
- 📦 **Poetry** for dependency management

## Quick Start

### Prerequisites
- Python 3.9 or higher
- Poetry (recommended) or pip

### Option 1: Using Poetry (Recommended)
```bash
# Install dependencies
poetry install

# Start the server
poetry run python app.py
```

### Option 2: Using pip
```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies  
pip install fastapi uvicorn[standard] pydantic python-dotenv

# Start the server
python app.py
```

The server will start on port **5051** by default.

## API Documentation

Once running, visit:
- **Health Check**: http://localhost:5051/
- **Swagger UI**: http://localhost:5051/docs
- **ReDoc**: http://localhost:5051/redoc

## Exposing with ngrok

```bash
# Expose the server
ngrok http 5051

# Use the HTTPS URL in ElevenLabs dashboard
# Example: https://abc123.ngrok.io/get-personal
```

## How It Works

### 1. **Initial Contact**
When someone calls, the agent greets:
> *"Hello! Thank you for calling our customer service. May I please have your name?"*

### 2. **Name Recognition & Database Lookup**
The agent listens for the name and looks it up in the embedded customer database:

- **john doe** → Premium customer, $1,250 balance, San Francisco (since 2020)
- **jane smith** → Standard customer, $500 balance, New York (since 2022)  
- **maria garcia** → Premium customer, $2,500 balance, Madrid (since 2019)
- **carlos rodriguez** → Premium customer, $5,000 balance, Barcelona (since 2018)
- **Any other name** → New customer welcome

### 3. **Personalized Responses**

**Premium Customer Example:**
> *"Hello John! Great to hear from you. I see you're one of our valued premium customers from San Francisco since 2020. Your current balance is $1,250.00. How can I help you today?"*

**New Customer Example:**
> *"Hello Sarah! I don't see you in our system yet - welcome! I'd be happy to help you set up a new account or answer any questions about our services."*

## Configuration

### Environment Variables
The app loads environment variables from `../../../.env` (project root):
- `PORT`: Server port (default: 5051)

### Customer Database
Edit the `CUSTOMER_DATABASE` dictionary in `app.py` to modify customer data:

```python
CUSTOMER_DATABASE = {
    "john doe": {
        "name": "John Doe",
        "status": "premium",  # or "standard"
        "balance": "$1,250.00",
        "location": "San Francisco",
        "member_since": "2020"
    },
    # Add more customers...
}
```

## Testing

### Local Test
```bash
curl -X POST http://localhost:5051/get-personal \
  -H "Content-Type: application/json" \
  -d '{
    "caller_id": "+1234567890",
    "agent_id": "test-agent",
    "called_number": "+1555000000",
    "call_sid": "test-call-123"
  }'
```

### Health Check
```bash
curl http://localhost:5051/
```

## Comparison with TypeScript Version

| Feature | TypeScript (Fastify) | Python (FastAPI) |
|---------|----------------------|-------------------|
| **Port** | 5050 | 5051 |
| **Framework** | Fastify | FastAPI |
| **Type Safety** | TypeScript interfaces | Pydantic models |
| **Auto Docs** | Manual | Automatic OpenAPI |
| **Dependency Mgmt** | npm/package.json | Poetry/pyproject.toml |
| **Hot Reload** | tsx watch | uvicorn --reload |

Both implementations provide identical functionality - choose based on your team's preferences and existing tech stack.

## ElevenLabs Dashboard Configuration

1. Go to your agent settings in ElevenLabs dashboard
2. Navigate to "Security" tab  
3. Enable "Fetch conversation initiation data for inbound Twilio calls"
4. Set webhook URL: `https://your-ngrok-url.ngrok.io/get-personal`
5. Add authentication headers if needed

## Development

### Project Structure
```
python-implementation/
├── app.py              # Main FastAPI application
├── pyproject.toml     # Poetry configuration & dependencies
├── poetry.lock        # Locked dependency versions
└── README.md          # This file
```

### Adding New Customers
Simply add entries to the `CUSTOMER_DATABASE` dictionary:

```python
"new customer": {
    "name": "New Customer Name",
    "status": "premium",        # or "standard"  
    "last_interaction": "2025-01-15",
    "balance": "$10,000.00",
    "location": "Your City",
    "member_since": "2025"
}
```

### Production Deployment
For production:
1. Use a production ASGI server (Gunicorn + Uvicorn workers)
2. Set up proper environment variables
3. Connect to a real customer database
4. Implement authentication and rate limiting
5. Use a reverse proxy for SSL termination

## Troubleshooting

- **Port already in use**: Change PORT environment variable
- **Dependencies missing**: Run `poetry install` or `pip install -r requirements.txt`
- **ngrok issues**: Ensure URL is HTTPS and accessible
- **Agent not responding**: Check ElevenLabs dashboard for error logs

Check console output for detailed request/response logs.
