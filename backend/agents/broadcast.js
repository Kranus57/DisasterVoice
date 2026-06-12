import twilio from 'twilio';
import { users } from '../db.js';

let twilioClient = null;
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
const smsNumber = process.env.TWILIO_PHONE_NUMBER || '+1234567890';

if (accountSid && authToken && accountSid.trim() !== "" && authToken.trim() !== "") {
  try {
    twilioClient = twilio(accountSid, authToken);
  } catch (error) {
    console.error("Failed to initialize Twilio client:", error);
  }
}

// In-memory status tracking for alerts to manage timeouts and fallbacks
// Key: MessageSid (or mock message id), Value: { user, messageBody, timeoutId, channel, status }
export const activeDeliveries = new Map();

// Reference to Socket.io instance to broadcast agent logs to the command center
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
 * Broadcasts localized alerts to all users.
 * Runs in parallel across the user database.
 * 
 * @param {object} translations - Map of translated alerts: { Hindi: {...}, Tamil: {...}, Bengali: {...} }
 */
export async function broadcastAlert(translations, options = {}) {
  logToDashboard('Agent C - Broadcast', 'Initiating multi-channel crisis alert broadcast pipeline...', 'info');

  const targetLanguages = options.languages || ['Hindi', 'Bengali', 'Tamil'];

  const promises = users.map(async (user) => {
    // Skip if language is not targeted
    if (!targetLanguages.includes(user.language)) {
      logToDashboard('Agent C - Broadcast', `Skipping resident ${user.name} (language ${user.language} is not targeted).`, 'info');
      return;
    }

    const translation = translations[user.language] || translations['Hindi'];
    
    // Format the urgent text alert payload
    const alertBody = `⚠️ CRISIS ALERT: ${translation.threat}
🕒 Timing: ${translation.timing}

IMMEDIATE SAFETY ACTIONS:
${translation.action.map((act, i) => `${i + 1}. ${act}`).join('\n')}

Reply IMMEDIATELY:
1 - I am SAFE
2 - I need ASSISTANCE / UNSAFE`;

    user.status = "Pending";
    user.channel = "WhatsApp";
    user.updatedAt = new Date().toISOString();
    
    if (ioInstance) ioInstance.emit('user_update', user);

    // Trigger Twilio WhatsApp or Simulated WhatsApp
    if (twilioClient) {
      await dispatchTwilioWhatsApp(user, alertBody, options);
    } else {
      await dispatchMockWhatsApp(user, alertBody, options);
    }
  });

  await Promise.all(promises);
}

/**
 * Dispatches via Twilio WhatsApp API
 */
async function dispatchTwilioWhatsApp(user, body, options) {
  logToDashboard('Agent C - Broadcast', `Sending WhatsApp Alert to ${user.name} (${user.phone})...`, 'info');
  
  try {
    const publicUrl = process.env.PUBLIC_URL || 'http://localhost:5000';
    const msg = await twilioClient.messages.create({
      from: whatsappNumber,
      to: `whatsapp:${user.phone}`,
      body: body,
      statusCallback: `${publicUrl}/api/twilio-status-callback`
    });

    logToDashboard('Agent C - Broadcast', `WhatsApp sent to ${user.name}. SID: ${msg.sid}. Tracking status callback.`, 'info');

    // Register tracking with 30s timeout for SMS fallback
    const timeoutId = setTimeout(() => {
      handleDeliveryTimeout(msg.sid);
    }, 30000);

    activeDeliveries.set(msg.sid, {
      userId: user.id,
      phone: user.phone,
      body: body,
      channel: 'WhatsApp',
      status: 'sent',
      timeoutId: timeoutId,
      dispatchedAt: Date.now(),
      options: options
    });

  } catch (error) {
    logToDashboard('Agent C - Broadcast', `Failed to send WhatsApp to ${user.name}: ${error.message}. Escalating.`, 'warning');
    await triggerImmediateFallback(user, body, options);
  }
}

/**
 * Dispatches a simulated WhatsApp message for development purposes
 */
async function dispatchMockWhatsApp(user, body, options) {
  const mockSid = `SMmock_${Math.random().toString(36).substring(2, 15)}`;
  logToDashboard('Agent C - Broadcast', `[MOCK] Sending WhatsApp Alert to ${user.name} (${user.phone})...`, 'info');
  
  // Register tracking with a mock timeout
  const timeoutId = setTimeout(() => {
    handleDeliveryTimeout(mockSid);
  }, 30000);

  activeDeliveries.set(mockSid, {
    userId: user.id,
    phone: user.phone,
    body: body,
    channel: 'WhatsApp',
    status: 'sent',
    timeoutId: timeoutId,
    dispatchedAt: Date.now(),
    options: options
  });

  // Automatically simulate a message status update to 'delivered' for some users
  // and trigger a fallback for others to demonstrate both scenarios in the demo dashboard
  setTimeout(() => {
    const delivery = activeDeliveries.get(mockSid);
    if (!delivery || delivery.status !== 'sent') return;

    // Simulate Rajesh and Ananya receiving WhatsApp safely
    if (user.id === 'user_1' || user.id === 'user_3') {
      updateDeliveryStatus(mockSid, 'delivered');
    } else {
      // User 2 (Karthik) or User 4 (Subhashree) will time out to SMS fallback
      logToDashboard('Agent C - Broadcast', `[MOCK] Simulating network drop for ${user.name}. WhatsApp status stays pending.`, 'warning');
    }
  }, 4000);
}

/**
 * Triggered if 30s pass without a 'delivered' status update
 */
export async function handleDeliveryTimeout(sid) {
  const delivery = activeDeliveries.get(sid);
  if (!delivery) return;

  if (delivery.status !== 'delivered' && delivery.status !== 'read') {
    const user = users.find(u => u.id === delivery.userId);
    const channels = delivery.options?.channels || { sms: true, ivr: true };
    
    if (user && user.status === 'Pending') {
      if (channels.sms) {
        logToDashboard('Agent C - Broadcast', `⏰ 30-sec WhatsApp delivery timeout for ${user.name}. Escalating to SMS Fallback.`, 'warning');
        user.status = 'SMS Fallback';
        user.channel = 'SMS';
        user.updatedAt = new Date().toISOString();
        if (ioInstance) ioInstance.emit('user_update', user);

        if (twilioClient) {
          await dispatchTwilioSMS(user, delivery.body, delivery.options);
        } else {
          await dispatchMockSMS(user, delivery.body, delivery.options);
        }
      } else if (channels.ivr) {
        logToDashboard('Agent C - Broadcast', `⏰ 30-sec WhatsApp delivery timeout for ${user.name}. SMS disabled. Escalating directly to Voice Call.`, 'warning');
        await triggerVoiceCall(user);
      } else {
        logToDashboard('Agent C - Broadcast', `⏰ 30-sec WhatsApp delivery timeout for ${user.name}. SMS and Voice fallbacks disabled.`, 'warning');
      }
    }
  }
  
  // Clear timeout reference and clean tracking
  if (delivery.timeoutId) clearTimeout(delivery.timeoutId);
  activeDeliveries.delete(sid);
}

/**
 * Immediate escalation helper if Twilio API rejects WhatsApp send outright
 */
async function triggerImmediateFallback(user, body, options) {
  const channels = options?.channels || { sms: true, ivr: true };
  if (channels.sms) {
    user.status = 'SMS Fallback';
    user.channel = 'SMS';
    user.updatedAt = new Date().toISOString();
    if (ioInstance) ioInstance.emit('user_update', user);

    if (twilioClient) {
      await dispatchTwilioSMS(user, body, options);
    } else {
      await dispatchMockSMS(user, body, options);
    }
  } else if (channels.ivr) {
    await triggerVoiceCall(user);
  } else {
    logToDashboard('Agent C - Broadcast', `WhatsApp failed and fallbacks are disabled for ${user.name}.`, 'warning');
  }
}

/**
 * Twilio SMS Gateway Sender
 */
async function dispatchTwilioSMS(user, body, options) {
  logToDashboard('Agent C - Broadcast', `Sending Fallback SMS to ${user.name} (${user.phone})...`, 'info');
  try {
    await twilioClient.messages.create({
      from: smsNumber,
      to: user.phone,
      body: body
    });
    logToDashboard('Agent C - Broadcast', `SMS delivered successfully to ${user.name}.`, 'success');
  } catch (error) {
    const channels = options?.channels || { sms: true, ivr: true };
    if (channels.ivr) {
      logToDashboard('Agent C - Broadcast', `Failed to send SMS fallback to ${user.name}: ${error.message}. Escalating to Voice Call.`, 'error');
      await triggerVoiceCall(user);
    } else {
      logToDashboard('Agent C - Broadcast', `Failed to send SMS fallback to ${user.name}: ${error.message}. Voice fallback disabled.`, 'error');
    }
  }
}

/**
 * Simulated SMS Gateway
 */
async function dispatchMockSMS(user, body, options) {
  logToDashboard('Agent C - Broadcast', `[MOCK] Sending Fallback SMS to ${user.name} (${user.phone})...`, 'info');
  await new Promise(r => setTimeout(r, 1000));
  logToDashboard('Agent C - Broadcast', `[MOCK] SMS fallback sent to ${user.name}.`, 'success');

  // For User 4, simulate SMS failing as well, triggering IVR voice call
  if (user.id === 'user_4') {
    setTimeout(async () => {
      const channels = options?.channels || { sms: true, ivr: true };
      if (channels.ivr) {
        logToDashboard('Agent C - Broadcast', `[MOCK] Simulating SMS transmission failure for ${user.name}. Initiating IVR Call.`, 'warning');
        await triggerVoiceCall(user);
      } else {
        logToDashboard('Agent C - Broadcast', `[MOCK] Simulating SMS transmission failure for ${user.name}. Voice fallback disabled.`, 'warning');
      }
    }, 4000);
  }
}

/**
 * Initiates automated IVR Voice Call
 */
export async function triggerVoiceCall(user) {
  logToDashboard('Agent C - Broadcast', `📞 Escalating to Automated Voice Call (IVR) for ${user.name}...`, 'info');
  
  user.status = 'IVR Dispatch';
  user.channel = 'IVR Call';
  user.updatedAt = new Date().toISOString();
  if (ioInstance) ioInstance.emit('user_update', user);

  if (twilioClient) {
    try {
      const publicUrl = process.env.PUBLIC_URL || 'http://localhost:5000';
      await twilioClient.calls.create({
        url: `${publicUrl}/api/ivr-twiml/${user.id}`,
        to: user.phone,
        from: smsNumber
      });
      logToDashboard('Agent C - Broadcast', `IVR Call connected to ${user.name}. Streaming Neural TTS...`, 'success');
    } catch (error) {
      logToDashboard('Agent C - Broadcast', `Failed to make voice call to ${user.name}: ${error.message}`, 'error');
    }
  } else {
    logToDashboard('Agent C - Broadcast', `[MOCK] Placing Voice Call to ${user.name}. Streaming simulated TwiML...`, 'info');
    await new Promise(r => setTimeout(r, 1500));
    logToDashboard('Agent C - Broadcast', `[MOCK] Simulated IVR Call completed for ${user.name}.`, 'success');
  }
}

/**
 * Generates TwiML XML payload containing advanced Neural Text-to-Speech voices
 * 
 * @param {object} user - Target user object
 * @param {object} translation - Translated content
 * @returns {string} XML TwiML code
 */
export function generateTwiML(user, translation) {
  const threatText = translation.threat;
  const actionText = translation.action.join(". ");
  
  // Select voices based on language requirements
  // Twilio supports neural voices. Hindi maps to Polly.Aditi-Neural, Tamil/Bengali fall back to high-quality Polly voices
  let voiceName = 'Polly.Aditi'; // Default Hindi voice (support Neural if set up in Twilio console)
  let langCode = 'hi-IN';

  if (user.language === 'Tamil') {
    voiceName = 'Polly.Aditi'; // Twilio uses Aditi for cross-lingual or standard voices, or standard Tamil
    langCode = 'ta-IN';
  } else if (user.language === 'Bengali') {
    voiceName = 'Polly.Aditi';
    langCode = 'bn-IN';
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Pause length="1"/>
    <Say voice="${voiceName}" language="${langCode}" loop="2">
        आपातकालीन सूचना। ${threatText}।
        कृपया तुरंत इन निर्देशों का पालन करें: ${actionText}।
        सुरक्षित स्थान पर रहें। धन्यवाद।
    </Say>
</Response>`;
}

/**
 * Updates delivery status of messages tracked through webhooks
 */
export function updateDeliveryStatus(sid, status) {
  const delivery = activeDeliveries.get(sid);
  if (!delivery) return;

  delivery.status = status;
  const user = users.find(u => u.id === delivery.userId);

  logToDashboard('Agent C - Broadcast', `Twilio webhook updated Message ${sid} status: "${status}" for user ${user ? user.name : 'Unknown'}.`, 'info');

  if (status === 'delivered' || status === 'read') {
    if (user && user.status === 'Pending') {
      user.status = 'Delivered'; // Update to Delivered!
      user.updatedAt = new Date().toISOString();
      if (ioInstance) ioInstance.emit('user_update', user);
      logToDashboard('Agent C - Broadcast', `WhatsApp delivered to ${user.name}. Clearing SMS fallback timer.`, 'success');
    }
    
    // Success: clear timer
    if (delivery.timeoutId) {
      clearTimeout(delivery.timeoutId);
    }
    activeDeliveries.delete(sid);
  } else if (status === 'failed' || status === 'undelivered') {
    logToDashboard('Agent C - Broadcast', `WhatsApp failed for ${user ? user.name : 'User'}. Triggering immediate fallback.`, 'warning');
    if (delivery.timeoutId) {
      clearTimeout(delivery.timeoutId);
    }
    activeDeliveries.delete(sid);
    if (user) {
      triggerImmediateFallback(user, delivery.body, delivery.options);
    }
  }
}
