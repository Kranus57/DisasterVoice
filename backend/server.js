import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environmental config
dotenv.config();

// Imports modules
import { users, resetUsers } from './db.js';
import { startRSSPolling, stopRSSPolling, simulateAlertTrigger } from './agents/alertMonitor.js';
import { translateAlert } from './agents/translator.js';
import { 
  broadcastAlert, 
  registerSocketIO as registerBroadcastSocket, 
  activeDeliveries, 
  updateDeliveryStatus, 
  generateTwiML,
  triggerVoiceCall
} from './agents/broadcast.js';
import { 
  handleInboundMessage, 
  registerSocketIO as registerFeedbackSocket 
} from './agents/feedback.js';

const app = express();
const httpServer = createServer(app);

// Enable CORS for frontend Vite dev server
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.io for real-time frontend notifications
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Register Socket.io with Broadcast and Feedback agents
registerBroadcastSocket(io);
registerFeedbackSocket(io);

// Store the latest warning translation in-memory so IVR call script can reference it
let latestTranslations = {
  Hindi: {
    threat: "चक्रवात डाना का आगमन तटीय ओडिशा में हो रहा है।",
    timing: "25 अक्टूबर को 18:00 बजे आईएसटी।",
    action: ["चक्रवात आश्रय में चले जाएं।", "आपातकालीन किट तैयार रखें।"]
  },
  Tamil: {
    threat: "டானா புயல் கடலோர ஒடிசாவை நோக்கி நகர்ந்து வருகிறது.",
    timing: "அக்டோபர் 25 மாலை 18:00 மணியளவில்.",
    action: ["புயல் நிவாரண முகாம்களுக்குச் செல்லவும்.", "முதலுதவிப் பெட்டியை தயார் நிலையில் வைக்கவும்."]
  },
  Bengali: {
    threat: "ঘূর্ণিঝড় ডানা উপকূলীয় ওড়িশায় আছড়ে পড়তে চলেছে।",
    timing: "২৫ অক্টোবর সন্ধ্যা ১৮:০০ টার দিকে।",
    action: ["ঘূর্ণিঝড় আশ্রয় কেন্দ্রে চলে যান।", "জরুরি ওষুধ ও শুকনো খাবার প্রস্তুত রাখুন।"]
  }
};

let latestAlertText = "Cyclone warning issued for coastal districts. Expected landfall soon with heavy rain and wind speeds.";

// System log function that emits to websocket
function logToDashboard(agent, message, type = 'info') {
  io.emit('agent_log', {
    timestamp: new Date().toLocaleTimeString(),
    agent,
    message,
    type
  });
  console.log(`[${agent}] ${message}`);
}

// Socket Connection Handler
io.on('connection', (socket) => {
  console.log(`[WebSocket] Frontend connected: ${socket.id}`);
  
  // Send current state on connection
  socket.emit('initial_state', {
    users,
    activeDeliveriesCount: activeDeliveries.size
  });

  socket.on('disconnect', () => {
    console.log(`[WebSocket] Frontend disconnected: ${socket.id}`);
  });
});

/**
 * ----------------------------------------------------
 * CORE WORKFLOW PIPELINE (Ingestion -> translation -> Broadcast)
 * ----------------------------------------------------
 */
async function executeCrisisPipeline(alertData, options = {}) {
  const startTime = Date.now();
  io.emit('pipeline_start', { startTime });

  logToDashboard('Agent A - Monitor', `🚨 NEW CRISIS INGESTED: "${alertData.title}"`, 'info');
  logToDashboard('Agent A - Monitor', `Payload Description: "${alertData.description}"`, 'info');

  latestAlertText = alertData.description;

  const targetLanguages = options.languages || ['Hindi', 'Bengali', 'Tamil'];

  // STEP 2: Translation & Structuring Agent (Parallel calls to LLM)
  logToDashboard('Agent B - Translator', `Spawning parallel translation processes for: ${targetLanguages.join(', ')}...`, 'info');
  
  const translations = {};
  const translationStart = Date.now();

  try {
    await Promise.all(
      targetLanguages.map(async (lang) => {
        logToDashboard('Agent B - Translator', `Triggering LLM structurer for language: ${lang}`, 'info');
        const translation = await translateAlert(alertData.description, lang);
        translations[lang] = translation;
        logToDashboard('Agent B - Translator', `Successfully localized alert to ${lang}. Threat categorized: "${translation.threat.substring(0, 40)}..."`, 'success');
      })
    );

    // Save globally for IVR call TwiML
    latestTranslations = { ...latestTranslations, ...translations };

  } catch (error) {
    logToDashboard('Agent B - Translator', `Translation pipeline error: ${error.message}. Resolving to local mocks.`, 'error');
  }

  // STEP 3: Broadcast Agent (WhatsApp & Falling Back to SMS/IVR)
  const translationTime = Date.now() - translationStart;
  logToDashboard('Agent C - Broadcast', `Translation phase complete in ${translationTime}ms. Preparing multi-channel dispatch...`, 'success');

  const broadcastStart = Date.now();
  try {
    await broadcastAlert(translations, options);
  } catch (error) {
    logToDashboard('Agent C - Broadcast', `Failed to broadcast: ${error.message}`, 'error');
  }
  const broadcastTime = Date.now() - broadcastStart;

  const totalTime = Date.now() - startTime;
  logToDashboard('System Coordinator', `Crisis alert workflow execution finished. Ingestion ➔ Translation ➔ Dispatch Latency: ${totalTime}ms`, 'success');
  io.emit('pipeline_end', { 
    totalTime,
    latencies: {
      ingestion: Math.min(50, Math.floor(Math.random() * 20) + 15), // Simulated ingestion time
      translation: translationTime,
      broadcast: broadcastTime
    }
  });
}

/**
 * ----------------------------------------------------
 * API ENDPOINTS
 * ----------------------------------------------------
 */

// Route to get list of users & statuses
app.get('/api/users', (req, res) => {
  res.json(users);
});

// Route to manually simulate alert trigger
app.post('/api/simulate-trigger', (req, res) => {
  const { title, description, severity, languages, channels } = req.body;
  
  simulateAlertTrigger({ title, description, severity }, (alertData) => {
    // Execute asynchronously to release request immediately
    executeCrisisPipeline(alertData, { languages, channels });
  });

  res.json({ success: true, message: 'Simulation pipeline started' });
});

// Route to fetch current translations
app.get('/api/translations', (req, res) => {
  res.json(latestTranslations);
});

// Twilio Message Status Webhook (Handles WhatsApp receipt confirmation)
app.post('/api/twilio-status-callback', (req, res) => {
  const { MessageSid, MessageStatus } = req.body;
  console.log(`[Twilio Webhook] MessageStatusCallback: SID=${MessageSid}, Status=${MessageStatus}`);
  
  if (MessageSid && MessageStatus) {
    updateDeliveryStatus(MessageSid, MessageStatus);
  }

  res.send('<Response></Response>');
});

// Twilio Inbound Webhook (Handles WhatsApp/SMS replies)
app.post('/api/twilio-webhook', async (req, res) => {
  const { From, Body } = req.body;
  console.log(`[Twilio Webhook] Inbound SMS/WhatsApp: From=${From}, Body=${Body}`);

  if (From && Body) {
    await handleInboundMessage(From, Body);
  }

  // Reply with an empty response so Twilio doesn't trigger automated replies
  res.header('Content-Type', 'text/xml');
  res.send('<Response></Response>');
});

// Twilio IVR Call TwiML Generator
app.post('/api/ivr-twiml/:userId', (req, res) => {
  const { userId } = req.params;
  const user = users.find(u => u.id === userId);
  
  if (!user) {
    res.status(404).send('User not found');
    return;
  }

  const translation = latestTranslations[user.language] || latestTranslations['Hindi'];
  const twimlXml = generateTwiML(user, translation);

  res.header('Content-Type', 'text/xml');
  res.send(twimlXml);
});

// Endpoint to simulate webhook reply from the frontend
app.post('/api/simulate-webhook', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'Missing phone or message parameters' });
  }

  const result = await handleInboundMessage(phone, message);
  res.json(result);
});

// Endpoint to simulate status callbacks (to fail or deliver WhatsApp messages in mock dev mode)
app.post('/api/simulate-status-update', (req, res) => {
  const { sid, status } = req.body;
  if (!sid || !status) {
    return res.status(400).json({ error: 'Missing sid or status parameters' });
  }

  updateDeliveryStatus(sid, status);
  res.json({ success: true });
});

// Endpoint to force trigger IVR voice escalation for a user manually
app.post('/api/simulate-ivr/:userId', async (req, res) => {
  const { userId } = req.params;
  const user = users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  await triggerVoiceCall(user);
  res.json({ success: true });
});

// Reset users safety status and active timers
app.post('/api/reset', (req, res) => {
  resetUsers();
  // Clear active timers
  for (const [sid, delivery] of activeDeliveries.entries()) {
    if (delivery.timeoutId) clearTimeout(delivery.timeoutId);
  }
  activeDeliveries.clear();
  
  logToDashboard('System Coordinator', 'System reset complete. User safety states cleared.', 'info');
  io.emit('reset_complete', { users });
  res.json({ success: true });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', twilioConfigured: !!twilioClient, geminiConfigured: !!process.env.GEMINI_API_KEY });
});

// Boot Server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`[System] DisasterVoice backend running on port ${PORT}`);
  
  // Start RSS Polling Agent A
  startRSSPolling(async (alertData) => {
    await executeCrisisPipeline(alertData);
  }, 60000);
});

// Handle clean shutdown
process.on('SIGTERM', () => {
  stopRSSPolling();
  httpServer.close(() => {
    console.log('[System] Process terminated.');
  });
});
