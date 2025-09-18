import Fastify from "fastify";
import WebSocket from "ws";
import dotenv from "dotenv";
dotenv.config({ path: '../../../.env' });

import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import Twilio from "twilio";

// Load environment variables from .env file

// Check for required environment variables
const {
  ELEVENLABS_API_KEY,
  ELEVENLABS_AGENT_ID,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
} = process.env;

if (
  !ELEVENLABS_API_KEY ||
  !ELEVENLABS_AGENT_ID ||
  !TWILIO_ACCOUNT_SID ||
  !TWILIO_AUTH_TOKEN ||
  !TWILIO_PHONE_NUMBER
) {
  console.error("Missing required environment variables");
  throw new Error("Missing required environment variables");
}

// Initialize Fastify server
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

const PORT = process.env.PORT || 8000;

// Twilio → ElevenLabs audio conversion: mu-law 8k → PCM16 16k
function muLawByteToLinearSample(muByte) {
  const MULAW_MAX = 0x1FFF;
  const MULAW_BIAS = 33;
  muByte = ~muByte & 0xFF;
  const sign = muByte & 0x80;
  let exponent = (muByte >> 4) & 0x07;
  let mantissa = muByte & 0x0F;
  let sample = ((mantissa << 4) + 8) << (exponent + 3);
  sample = sample - MULAW_BIAS;
  if (sample > MULAW_MAX) sample = MULAW_MAX;
  return sign ? (MULAW_BIAS - sample) : (sample - MULAW_BIAS);
}

function decodeMuLaw8kToPCM16(buffer) {
  const out = Buffer.alloc(buffer.length * 2);
  for (let i = 0; i < buffer.length; i++) {
    const s = muLawByteToLinearSample(buffer[i]);
    out.writeInt16LE(s, i * 2);
  }
  return out;
}

function upsampleLinearPCM16x2(pcm8k) {
  // Zero-order hold: duplicate samples 8k -> 16k
  const inSamples = pcm8k.length / 2;
  const out = Buffer.alloc(pcm8k.length * 2);
  for (let i = 0; i < inSamples; i++) {
    const val = pcm8k.readInt16LE(i * 2);
    out.writeInt16LE(val, i * 4);
    out.writeInt16LE(val, i * 4 + 2);
  }
  return out;
}

// Root route for health check
fastify.get("/", async (_, reply) => {
  reply.send({ message: "Server is running" });
});

// Initialize Twilio client
const twilioClient = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Helper function to get signed URL for authenticated conversations
async function getSignedUrl() {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get signed URL: ${response.statusText}`);
    }

    const data = await response.json();
    return data.signed_url;
  } catch (error) {
    console.error("Error getting signed URL:", error);
    throw error;
  }
}

// Route to initiate outbound calls
fastify.post("/outbound-call", async (request, reply) => {
  const { number, prompt, first_message } = request.body || {};

  if (!number) {
    return reply.code(400).send({ error: "Phone number is required" });
  }

  try {
    // Build URL and append query params only if provided
    const baseUrl = `https://${request.headers.host}/outbound-call-twiml`;
    const qs = [];
    if (typeof prompt === "string" && prompt.length > 0) {
      qs.push(`prompt=${encodeURIComponent(prompt)}`);
    }
    if (typeof first_message === "string" && first_message.length > 0) {
      qs.push(`first_message=${encodeURIComponent(first_message)}`);
    }
    const url = qs.length ? `${baseUrl}?${qs.join("&")}` : baseUrl;

    const call = await twilioClient.calls.create({
      from: TWILIO_PHONE_NUMBER,
      to: number,
      url,
    });

    reply.send({
      success: true,
      message: "Call initiated",
      callSid: call.sid,
    });
  } catch (error) {
    console.error("Error initiating outbound call:", error);
    reply.code(500).send({
      success: false,
      error: "Failed to initiate call",
    });
  }
});

// TwiML route for outbound calls
fastify.all("/outbound-call-twiml", async (request, reply) => {
  const prompt = request.query.prompt || "";
  const first_message = request.query.first_message || "";

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Connect>
          <Stream url="wss://${request.headers.host}/outbound-media-stream">
            <Parameter name="prompt" value="${prompt}" />
            <Parameter name="first_message" value="${first_message}" />
          </Stream>
        </Connect>
      </Response>`;

  reply.type("text/xml").send(twimlResponse);
});

// WebSocket route for handling media streams
fastify.register(async fastifyInstance => {
  fastifyInstance.get(
    "/outbound-media-stream",
    { websocket: true },
    (ws, req) => {
      console.info("[Server] Twilio connected to outbound media stream");

      // Variables to track the call
      let streamSid = null;
      let callSid = null;
      let elevenLabsWs = null;
      let customParameters = null; // Add this to store parameters

      // Handle WebSocket errors
      ws.on("error", console.error);

      // Set up ElevenLabs connection
      const setupElevenLabs = async () => {
        try {
          const signedUrl = await getSignedUrl();
          elevenLabsWs = new WebSocket(signedUrl);

          elevenLabsWs.on("open", () => {
            console.log("[ElevenLabs] Connected to Conversational AI");

            // Only send overrides if provided by caller
            const hasPrompt = !!(customParameters && customParameters.prompt);
            const hasFirst = !!(customParameters && customParameters.first_message);
            if (hasPrompt || hasFirst) {
              const initialConfig = {
                type: "conversation_initiation_client_data",
                conversation_config_override: {
                  agent: {
                    ...(hasPrompt
                      ? { prompt: { prompt: String(customParameters.prompt) } }
                      : {}),
                    ...(hasFirst
                      ? { first_message: String(customParameters.first_message) }
                      : {}),
                  },
                },
              };

              console.log(
                "[ElevenLabs] Sending initial config overrides",
                initialConfig.conversation_config_override.agent
              );
              elevenLabsWs.send(JSON.stringify(initialConfig));
            }
          });

          elevenLabsWs.on("message", data => {
            try {
              const message = JSON.parse(data);

              switch (message.type) {
                case "conversation_initiation_metadata":
                  console.log("[ElevenLabs] Received initiation metadata");
                  break;

                case "audio":
                  if (streamSid) {
                    if (message.audio?.chunk) {
                      const audioData = {
                        event: "media",
                        streamSid,
                        media: {
                          payload: message.audio.chunk,
                        },
                      };
                      ws.send(JSON.stringify(audioData));
                    } else if (message.audio_event?.audio_base_64) {
                      const audioData = {
                        event: "media",
                        streamSid,
                        media: {
                          payload: message.audio_event.audio_base_64,
                        },
                      };
                      ws.send(JSON.stringify(audioData));
                    }
                  } else {
                    console.log(
                      "[ElevenLabs] Received audio but no StreamSid yet"
                    );
                  }
                  break;

                case "interruption":
                  if (streamSid) {
                    ws.send(
                      JSON.stringify({
                        event: "clear",
                        streamSid,
                      })
                    );
                  }
                  break;

                case "ping":
                  if (message.ping_event?.event_id) {
                    elevenLabsWs.send(
                      JSON.stringify({
                        type: "pong",
                        event_id: message.ping_event.event_id,
                      })
                    );
                  }
                  break;

                case "agent_response":
                  console.log(
                    `[Twilio] Agent response: ${message.agent_response_event?.agent_response}`
                  );
                  break;

                case "user_transcript":
                  console.log(
                    `[Twilio] User transcript: ${message.user_transcription_event?.user_transcript}`
                  );
                  break;

                default:
                  console.log(
                    `[ElevenLabs] Unhandled message type: ${message.type}`
                  );
              }
            } catch (error) {
              console.error("[ElevenLabs] Error processing message:", error);
            }
          });

          elevenLabsWs.on("error", error => {
            console.error("[ElevenLabs] WebSocket error:", error);
          });

          elevenLabsWs.on("close", () => {
            console.log("[ElevenLabs] Disconnected");
          });
        } catch (error) {
          console.error("[ElevenLabs] Setup error:", error);
        }
      };

      // Set up ElevenLabs connection
      setupElevenLabs();

      // Handle messages from Twilio
      ws.on("message", message => {
        try {
          const msg = JSON.parse(message);
          if (msg.event !== "media") {
            console.log(`[Twilio] Received event: ${msg.event}`);
          }

          switch (msg.event) {
            case "start":
              streamSid = msg.start.streamSid;
              callSid = msg.start.callSid;
              // Normalize Twilio customParameters (array of {name,value}) to an object
              if (Array.isArray(msg.start.customParameters)) {
                customParameters = Object.fromEntries(
                  msg.start.customParameters
                    .filter(p => p && typeof p.name === "string")
                    .map(p => [p.name, p.value])
                );
              } else if (msg.start.customParameters && typeof msg.start.customParameters === "object") {
                customParameters = msg.start.customParameters;
              } else {
                customParameters = {};
              }
              console.log(
                `[Twilio] Stream started - StreamSid: ${streamSid}, CallSid: ${callSid}`
              );
              console.log("[Twilio] Start parameters:", customParameters);
              break;

            case "media":
              if (elevenLabsWs?.readyState === WebSocket.OPEN) {
              const mu = Buffer.from(msg.media.payload, "base64");
              const pcm8k = decodeMuLaw8kToPCM16(mu);
              const pcm16k = upsampleLinearPCM16x2(pcm8k);
              const audioMessage = {
                user_audio_chunk: pcm16k.toString("base64"),
              };
                elevenLabsWs.send(JSON.stringify(audioMessage));
              }
              break;

            case "stop":
              console.log(`[Twilio] Stream ${streamSid} ended`);
              if (elevenLabsWs?.readyState === WebSocket.OPEN) {
                elevenLabsWs.close();
              }
              break;

            default:
              console.log(`[Twilio] Unhandled event: ${msg.event}`);
          }
        } catch (error) {
          console.error("[Twilio] Error processing message:", error);
        }
      });

      // Handle WebSocket closure
      ws.on("close", () => {
        console.log("[Twilio] Client disconnected");
        if (elevenLabsWs?.readyState === WebSocket.OPEN) {
          elevenLabsWs.close();
        }
      });
    }
  );
});

// Start the Fastify server
fastify.listen({ port: PORT }, err => {
  if (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
  console.log(`[Server] Listening on port ${PORT}`);
});