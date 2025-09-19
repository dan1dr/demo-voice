#!/usr/bin/env python3
"""
ElevenLabs Twilio Personalization Webhook - Python Implementation

This webhook demonstrates interactive name-based personalization for ElevenLabs agents.
The agent asks for the caller's name and provides personalized responses based on a customer database.
"""

import json
import os
from typing import Dict, Any, Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import uvicorn

# Load environment variables from the project root
load_dotenv(dotenv_path="../../../.env")

# Initialize FastAPI app
app = FastAPI(
    title="ElevenLabs Twilio Personalization Webhook (Python)",
    description="Interactive name-based personalization for ElevenLabs agents",
    version="1.0.0"
)

# Configuration
PORT = int(os.getenv("PORT", "5051"))

# Request/Response Models
class TwilioWebhookRequest(BaseModel):
    caller_id: str
    agent_id: str
    called_number: str
    call_sid: str

class ConversationInitiationResponse(BaseModel):
    type: str
    dynamic_variables: Dict[str, Any]
    conversation_config_override: Dict[str, Any]

# Mock customer database - in real implementation, this would be a database lookup by name
CUSTOMER_DATABASE = {
    "john doe": {
        "name": "John Doe",
        "status": "premium",
        "last_interaction": "2024-01-15",
        "balance": "$1,250.00",
        "location": "San Francisco",
        "member_since": "2020"
    },
    "jane smith": {
        "name": "Jane Smith",
        "status": "standard",
        "last_interaction": "2024-01-10",
        "balance": "$500.00",
        "location": "New York",
        "member_since": "2022"
    },
    "maria garcia": {
        "name": "Maria Garcia",
        "status": "premium",
        "last_interaction": "2025-01-10",
        "balance": "$2,500.00",
        "location": "Madrid",
        "member_since": "2019"
    },
    "carlos rodriguez": {
        "name": "Carlos Rodriguez",
        "status": "premium",
        "last_interaction": "2025-01-12",
        "balance": "$5,000.00",
        "location": "Barcelona",
        "member_since": "2018"
    },
    "default": {
        "name": "New Customer",
        "status": "standard",
        "last_interaction": "today",
        "balance": "$0.00",
        "location": "Unknown",
        "member_since": "today"
    }
}

def create_customer_database_text() -> str:
    """Create a formatted text representation of the customer database for the agent."""
    entries = []
    for key, data in CUSTOMER_DATABASE.items():
        if key != 'default':
            entries.append(
                f'- "{key}": {data["name"]} ({data["status"]} customer, {data["balance"]} balance, '
                f'{data["location"]}, member since {data["member_since"]})'
            )
    return '\n'.join(entries)

def create_agent_prompt() -> str:
    """Create the comprehensive agent prompt with instructions and customer database."""
    return f"""You are a friendly and professional customer service representative. Your main goal is to provide personalized service.

IMPORTANT INSTRUCTIONS:
1. FIRST, greet the caller and ask for their name politely: "Hello! Thank you for calling. May I please have your name?"
2. WAIT for them to provide their name
3. Once you get their name, look it up in the customer database I'll provide you
4. If found: Greet them personally and mention their account details (status, balance, location, member since)
5. If not found: Welcome them as a new customer and offer to help set up an account

CUSTOMER DATABASE (lookup by lowercase name):
{create_customer_database_text()}

PERSONALIZATION RULES:
- Premium customers: Be extra welcoming, mention exclusive benefits, use phrases like "valued premium customer"
- Standard customers: Be friendly and helpful
- New customers: Be welcoming and explain our services

CONVERSATION FLOW:
1. Ask for name
2. Look up in database
3. Personalized greeting based on customer tier
4. Offer relevant assistance

Always be helpful, friendly, and professional. Use the customer's name throughout the conversation once you know it.
Remember to treat premium customers with extra care and mention exclusive benefits when appropriate."""

@app.get("/")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "OK",
        "message": "ElevenLabs Twilio Personalization Webhook Server (Python)",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }

@app.post("/get-personal")
async def personalization_webhook(request: TwilioWebhookRequest) -> ConversationInitiationResponse:
    """
    Main webhook endpoint for ElevenLabs personalization.
    
    Receives Twilio call data and returns interactive personalization configuration.
    """
    try:
        print(f"[Webhook] Received personalization request: {request.model_dump()}")
        print("[Webhook] Setting up interactive name-based personalization")

        # Prepare the response for name collection and personalization
        response_data = {
            "type": "conversation_initiation_client_data",
            "dynamic_variables": {
                "customer_database": json.dumps(CUSTOMER_DATABASE),
                "call_id": request.call_sid,
                "caller_phone": request.caller_id,
                "timestamp": datetime.now().isoformat()
            },
            "conversation_config_override": {
                "agent": {
                    "prompt": {
                        "prompt": create_agent_prompt()
                    },
                    "first_message": "Hello! Thank you for calling our customer service. May I please have your name?",
                    "language": "en"
                }
            }
        }

        print(f"[Webhook] Sending personalization response:")
        print(json.dumps(response_data, indent=2))
        print("[Webhook] ✅ Response sent successfully")
        
        return ConversationInitiationResponse(**response_data)

    except Exception as error:
        print(f"[Webhook] Error processing personalization request: {error}")
        
        # Return default response in case of error
        default_response = {
            "type": "conversation_initiation_client_data",
            "dynamic_variables": {
                "error": "true",
                "call_id": "unknown",
                "timestamp": datetime.now().isoformat()
            },
            "conversation_config_override": {
                "agent": {
                    "prompt": {
                        "prompt": "You are a helpful customer service representative. Due to a technical issue, you cannot access the customer database right now. Be friendly and ask for the caller's name, then provide general assistance. Apologize for any inconvenience."
                    },
                    "first_message": "Hello! Thank you for calling. I apologize, but we're experiencing a slight technical issue. May I have your name so I can assist you better?",
                    "language": "en"
                }
            }
        }
        
        return ConversationInitiationResponse(**default_response)

def start_server():
    """Start the webhook server."""
    print("🐍 Starting Python ElevenLabs Twilio Personalization Webhook Server")
    print(f"✅ Webhook server running on port {PORT}")
    print(f"🌐 Local: http://localhost:{PORT}")
    print(f"📡 Webhook endpoint: http://localhost:{PORT}/get-personal")
    print(f"🚀 To expose with ngrok, run: ngrok http {PORT}")
    print(f"📋 Then use the ngrok URL + /get-personal in ElevenLabs dashboard")
    
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=PORT,
        reload=True,
        log_level="info"
    )

if __name__ == "__main__":
    start_server()
