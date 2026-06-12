import { GoogleGenAI } from '@google/genai';
import { users } from '../db.js';

let ai = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "") {
  try {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } catch (error) {
    console.error("Failed to initialize Google GenAI SDK for Feedback agent:", error);
  }
}

let ioInstance = null;

export function registerSocketIO(io) {
  ioInstance = io;
}

function logToDashboard(agent, message, type = 'info') {
  if (ioInstance) {
    ioInstance.emit('agent_log', {
      timestamp: new Date().toLocaleTimeString(),
      agent,
      message,
      type
    });
  }
  console.log(`[${agent}] ${message}`);
}

/**
 * Parses and processes incoming user text replies from WhatsApp or SMS webhooks.
 * Uses LLM to classify safety status if text is unstructured.
 * 
 * @param {string} rawFrom - Twilio From value (e.g. "whatsapp:+919876543210" or "+919876543210")
 * @param {string} textBody - Message text sent by the user
 */
export async function handleInboundMessage(rawFrom, textBody) {
  // Clean phone number (strip 'whatsapp:' prefix if present and remove extra spaces)
  const phone = rawFrom.replace('whatsapp:', '').trim();
  const text = textBody.trim();

  logToDashboard('Agent D - Feedback', `Inbound response from phone: ${phone} | message: "${text}"`, 'info');

  // Match user in the mock database
  const user = users.find(u => u.phone === phone);

  if (!user) {
    logToDashboard('Agent D - Feedback', `Received message from unregistered number: ${phone}. Discarding.`, 'warning');
    return { success: false, reason: 'Unregistered user' };
  }

  // Classify response
  let safetyStatus = 'Pending';
  let reasoning = 'Categorized response';

  const normalizedText = text.toLowerCase().trim();

  if (normalizedText === '1') {
    safetyStatus = 'Safe';
    reasoning = 'User pressed option 1 (Safe)';
  } else if (normalizedText === '2') {
    safetyStatus = 'Unsafe';
    reasoning = 'User pressed option 2 (Needs Assistance)';
  } else {
    // Unstructured text - trigger LLM or local keyword analyzer
    logToDashboard('Agent D - Feedback', `Analyzing unstructured reply from ${user.name}: "${text}"...`, 'info');
    safetyStatus = await classifyMessageContent(text);
    reasoning = `AI classified status as ${safetyStatus.toUpperCase()}`;
  }

  // Update user state in database
  user.status = safetyStatus;
  user.lastMessage = text;
  user.updatedAt = new Date().toISOString();

  logToDashboard('Agent D - Feedback', `Status for ${user.name} updated to: ${safetyStatus.toUpperCase()} (${reasoning})`, safetyStatus === 'Safe' ? 'success' : 'error');

  // Push instant WebSocket updates to the frontend
  if (ioInstance) {
    ioInstance.emit('user_update', user);
    // Push alert toast event
    ioInstance.emit('toast_notification', {
      title: `User Check-in: ${user.name}`,
      message: `Status is now ${safetyStatus.toUpperCase()} | "${text}"`,
      type: safetyStatus === 'Safe' ? 'success' : 'error'
    });
  }

  return { success: true, user, safetyStatus };
}

/**
 * Classifies a user's unstructured message into 'Safe' or 'Unsafe'
 * Uses LLM if configured, otherwise falls back to a regex keyword matcher.
 * 
 * @param {string} text 
 * @returns {Promise<string>} 'Safe' or 'Unsafe'
 */
async function classifyMessageContent(text) {
  if (!ai) {
    // Local keyword fallback classifier
    const lowercase = text.toLowerCase();
    
    // Unsafe markers
    const unsafeKeywords = [
      'help', 'need help', 'trapped', 'flood', 'water', 'hurt', 'injur', 
      'stuck', 'danger', 'rescue', 'doctor', 'unsafe', '2', 'rising',
      'emergency', 'broken', 'food', 'assistance'
    ];
    
    // Safe markers
    const safeKeywords = [
      'safe', 'ok', 'fine', 'good', 'evacuated', 'shelter', 'reached', 
      '1', 'no problem', 'all right', 'alive', 'saved'
    ];

    for (const kw of unsafeKeywords) {
      if (lowercase.includes(kw)) return 'Unsafe';
    }
    for (const kw of safeKeywords) {
      if (lowercase.includes(kw)) return 'Safe';
    }

    // Default to Unsafe for critical alerts if ambiguous (safety first)
    return 'Unsafe';
  }

  const systemInstruction = `
You are a crisis command categorization agent.
Classify the user's message sent in response to a disaster alert.
You must return a single word: either "Safe" or "Unsafe".

Classify as "Safe" if:
- They state they are fine, evacuated, in a shelter, safe, or do not need help.

Classify as "Unsafe" if:
- They request help, state they are stuck, injured, in danger, flooded, need food/water, or if the message is ambiguous/distressed.

Output ONLY the single word: "Safe" or "Unsafe". Do not write anything else.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Classify this user response: "${text}"`,
      config: {
        systemInstruction: systemInstruction
      }
    });

    const answer = response.text.trim().replace(/[^a-zA-Z]/g, '');
    console.log(`[Agent D - Feedback] AI Classification result: "${answer}"`);
    
    if (answer.toLowerCase() === 'safe') return 'Safe';
    if (answer.toLowerCase() === 'unsafe') return 'Unsafe';
    
    return 'Unsafe'; // Fallback
  } catch (error) {
    console.error("[Agent D - Feedback] LLM classification error, using local fallback:", error);
    // Simple inline fallback
    return text.toLowerCase().includes('safe') ? 'Safe' : 'Unsafe';
  }
}
