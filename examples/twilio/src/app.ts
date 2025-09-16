// src/app.ts

import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
import express, { Response } from 'express';
import ExpressWs from 'express-ws';
import { Readable } from 'stream';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';
import { type WebSocket } from 'ws';

// Create Express app with WebSocket support
const app = ExpressWs(express()).app;
const PORT: number = parseInt(process.env.PORT || '5000');

// ElevenLabs API client
const elevenlabs = new ElevenLabsClient();

// Choose which voice + format Twilio expects
const voiceId = '21m00Tcm4TlvDq8ikWAM';
const outputFormat = 'ulaw_8000';
const text = 'This is a test. You can now hang up. Thank you.';

function startApp() {
  // Endpoint called by Twilio when a call comes in
  app.post('/call/incoming', (_, res: Response) => {
    console.log('[Twilio] Incoming call webhook hit -> generating TwiML connect stream');
    const twiml = new VoiceResponse();

    // Tell Twilio: “connect this call to my WebSocket at /call/connection”
    twiml.connect().stream({
      url: `wss://${process.env.SERVER_DOMAIN}/call/connection`,
    });

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
  });

  // Handle the WebSocket connection from Twilio
  app.ws('/call/connection', (ws: WebSocket) => {
    console.log('[Twilio] WebSocket connection opened at /call/connection');
    ws.on('message', async (data: string) => {
      const message = JSON.parse(data);

      // When Twilio says the stream has started
      if (message.event === 'start' && message.start) {
        console.log('[Twilio] Received start event for streamSid:', message.start.streamSid);
        const streamSid = message.start.streamSid;

        // 1. Ask ElevenLabs to generate TTS audio from text
        const response = await elevenlabs.textToSpeech.convert(voiceId, {
          modelId: 'eleven_flash_v2_5',
          outputFormat: outputFormat,
          text,
        });

        // 2. Collect audio stream into memory
        const readableStream = Readable.from(response);
        const audioArrayBuffer = await streamToArrayBuffer(readableStream);

        // 3. Send audio back to Twilio over WebSocket so it plays to caller
        console.log('[ElevenLabs] TTS audio generated, sending media back to Twilio');
        ws.send(
          JSON.stringify({
            streamSid,
            event: 'media',
            media: {
              payload: Buffer.from(audioArrayBuffer as any).toString('base64'),
            },
          })
        );
      }
    });

    ws.on('error', console.error);
    ws.on('close', () => console.log('[Twilio] WebSocket connection closed'));
  });

  // Simple health endpoint
  app.get('/', (_, res: Response) => {
    res.status(200).send('OK');
  });

  // Start the server
  app.listen(PORT, () => {
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`Remote: https://${process.env.SERVER_DOMAIN}`);
  });
}

// Helper to combine audio stream chunks into one buffer
function streamToArrayBuffer(readableStream: Readable) {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    readableStream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks).buffer);
    });

    readableStream.on('error', reject);
  });
}

startApp();
