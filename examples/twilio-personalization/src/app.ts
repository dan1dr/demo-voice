// src/app.ts

import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
import Fastify from 'fastify';

// Create Fastify instance
const fastify = Fastify({
  logger: true
});

const PORT: number = parseInt(process.env.PORT || '5050');

// Define interface for Twilio webhook request
interface TwilioWebhookRequest {
  caller_id: string;
  agent_id: string;
  called_number: string;
  call_sid: string;
}

// Define interface for the response
interface ConversationInitiationResponse {
  type: 'conversation_initiation_client_data';
  dynamic_variables: {
    customer_name: string;
    account_status: string;
    last_interaction: string;
    [key: string]: any;
  };
  conversation_config_override: {
    agent: {
      prompt: {
        prompt: string;
      };
      first_message: string;
      language: string;
    };
    tts?: {
      voice_id: string;
    };
  };
}

// Mock customer database - in real implementation, this would be a database lookup by name
const customerDatabase: Record<string, any> = {
  'john doe': {
    name: 'John Doe',
    status: 'premium',
    lastInteraction: '2024-01-15',
    balance: '$1,250.00',
    location: 'San Francisco',
    memberSince: '2020'
  },
  'jane smith': {
    name: 'Jane Smith',
    status: 'standard',
    lastInteraction: '2024-01-10',
    balance: '$500.00',
    location: 'New York',
    memberSince: '2022'
  },
  'maria garcia': {
    name: 'Maria Garcia',
    status: 'premium',
    lastInteraction: '2025-01-10',
    balance: '$2,500.00',
    location: 'Madrid',
    memberSince: '2019'
  },
  'default': {
    name: 'New Customer',
    status: 'standard',
    lastInteraction: 'today',
    balance: '$0.00',
    location: 'Unknown',
    memberSince: 'today'
  }
};

// Health check endpoint
fastify.get('/', async (request, reply) => {
  return { status: 'OK', message: 'ElevenLabs Twilio Personalization Webhook Server' };
});

// Webhook endpoint for ElevenLabs personalization
fastify.post('/get-personal', async (request, reply) => {
  try {
    const { caller_id, agent_id, called_number, call_sid } = request.body as TwilioWebhookRequest;
    
    console.log('[Webhook] Received personalization request:', {
      caller_id,
      agent_id,
      called_number,
      call_sid
    });

    // Instead of looking up by phone number, we'll set up the agent to ask for the name
    console.log('[Webhook] Setting up interactive name-based personalization');

    // Prepare the response for name collection and personalization
    const response: ConversationInitiationResponse = {
      type: 'conversation_initiation_client_data',
      dynamic_variables: {
        customer_database: JSON.stringify(customerDatabase), // Pass the database to the agent
        call_id: call_sid,
        caller_phone: caller_id
      },
      conversation_config_override: {
        agent: {
          prompt: {
            prompt: `You are a friendly and professional customer service representative. Your main goal is to provide personalized service.

IMPORTANT INSTRUCTIONS:
1. FIRST, greet the caller and ask for their name politely: "Hello! Thank you for calling. May I please have your name?"
2. WAIT for them to provide their name
3. Once you get their name, look it up in the customer database I'll provide you
4. If found: Greet them personally and mention their account details (status, balance, location, member since)
5. If not found: Welcome them as a new customer and offer to help set up an account

CUSTOMER DATABASE (lookup by lowercase name):
${Object.entries(customerDatabase).map(([key, data]) => 
  key !== 'default' ? `- "${key}": ${data.name} (${data.status} customer, $${data.balance} balance, ${data.location}, member since ${data.memberSince})` : ''
).filter(Boolean).join('\n')}

PERSONALIZATION RULES:
- Premium customers: Be extra welcoming, mention exclusive benefits
- Standard customers: Be friendly and helpful
- New customers: Be welcoming and explain our services

Always be helpful, friendly, and professional. Use the customer's name throughout the conversation once you know it.`
          },
          first_message: "Hello! Thank you for calling our customer service. May I please have your name?",
          language: 'en'
        }
      }
    };

    console.log('[Webhook] Sending personalization response:', JSON.stringify(response, null, 2));
    console.log('[Webhook] ✅ Response sent successfully');
    
    reply.send(response);
  } catch (error) {
    console.error('[Webhook] Error processing personalization request:', error);
    
    // Return default response in case of error
    const defaultResponse: ConversationInitiationResponse = {
      type: 'conversation_initiation_client_data',
      dynamic_variables: {
        error: 'true',
        call_id: 'unknown'
      },
      conversation_config_override: {
        agent: {
          prompt: {
            prompt: 'You are a helpful customer service representative. Due to a technical issue, you cannot access the customer database right now. Be friendly and ask for the caller\'s name, then provide general assistance. Apologize for any inconvenience.'
          },
          first_message: 'Hello! Thank you for calling. I apologize, but we\'re experiencing a slight technical issue. May I have your name so I can assist you better?',
          language: 'en'
        }
        // Removed TTS override - not allowed by agent config
      }
    };
    
    reply.send(defaultResponse);
  }
});

// Start the server
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`✅ Webhook server running on port ${PORT}`);
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`📡 Webhook endpoint: http://localhost:${PORT}/get-personal`);
    console.log(`🚀 To expose with ngrok, run: ngrok http ${PORT}`);
    console.log(`📋 Then use the ngrok URL + /get-personal in ElevenLabs dashboard`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
