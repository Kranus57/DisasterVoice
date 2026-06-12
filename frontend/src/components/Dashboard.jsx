import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { 
  Play, 
  RefreshCw, 
  MessageSquare, 
  PhoneCall, 
  Map, 
  Terminal, 
  Users, 
  Clock, 
  ShieldAlert, 
  CheckCircle, 
  AlertTriangle,
  Smartphone,
  ChevronRight
} from 'lucide-react';

// Connect to backend socket
const socket = io(
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : window.location.origin
);

const PRESETS = [
  {
    name: "Cyclone Dana Alert",
    title: "Severe Cyclone Dana Approaching Coastal Odisha",
    severity: "CRITICAL",
    description: "Cyclone warning issued for coastal Odisha and West Bengal. Landfall expected within 18 hours with wind speeds reaching 150 km/h. Coastal populations near Puri and Paradip must evacuate immediately."
  },
  {
    name: "Sundarbans Flood Warning",
    title: "Flash Flood Alert for Sundarbans Delta",
    severity: "WARNING",
    description: "Severe flooding inundation reported across Sundarbans and Digha due to torrential rains and tidal surges. Low-lying mud embankments breached. Please move to cement cyclone shelters."
  },
  {
    name: "Tamil Nadu Swell Waves",
    title: "Tidal Wave Surge Warning - Nagapattinam",
    severity: "ADVISORY",
    description: "High swell wave advisory issued for Tamil Nadu coast. Sea waves likely to exceed 4 meters. Fishermen warned against going out. Beachside residents near Nagapattinam should relocate inland."
  }
];

export default function Dashboard() {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activePreset, setActivePreset] = useState(0);
  const [customAlert, setCustomAlert] = useState(PRESETS[0].description);
  const [severity, setSeverity] = useState(PRESETS[0].severity);
  
  // Stopwatch & Pipeline Latency states
  const [pipelineState, setPipelineState] = useState('idle'); // idle, running, completed
  const [stopwatch, setStopwatch] = useState(0);
  const [finalLatency, setFinalLatency] = useState(null);
  
  // Simulation reply helper states
  const [selectedUser, setSelectedUser] = useState('');
  const [simulatedReply, setSimulatedReply] = useState('1');
  const [customReplyText, setCustomReplyText] = useState('');
  const [isSendingSim, setIsSendingSim] = useState(false);

  // Customization Toggles
  const [selectedLanguages, setSelectedLanguages] = useState(['Hindi', 'Bengali', 'Tamil']);
  const [enabledChannels, setEnabledChannels] = useState({ sms: true, ivr: true });

  // Stage Latencies from WebSocket
  const [stageLatencies, setStageLatencies] = useState({ ingestion: 0, translation: 0, broadcast: 0 });

  // Map Popup & Voice TTS states
  const [selectedMapUser, setSelectedMapUser] = useState(null);
  const [voiceModalUser, setVoiceModalUser] = useState(null);
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);

  const logsEndRef = useRef(null);
  const stopwatchInterval = useRef(null);

  // Parse preset choices
  const applyPreset = (index) => {
    setActivePreset(index);
    setCustomAlert(PRESETS[index].description);
    setSeverity(PRESETS[index].severity);
  };

  // Auto scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Handle running stopwatch
  useEffect(() => {
    if (pipelineState === 'running') {
      setStopwatch(0);
      setFinalLatency(null);
      stopwatchInterval.current = setInterval(() => {
        setStopwatch(prev => prev + 10); // increments every 10ms
      }, 10);
    } else if (pipelineState === 'completed') {
      if (stopwatchInterval.current) {
        clearInterval(stopwatchInterval.current);
      }
    } else {
      if (stopwatchInterval.current) {
        clearInterval(stopwatchInterval.current);
      }
      setStopwatch(0);
    }

    return () => {
      if (stopwatchInterval.current) clearInterval(stopwatchInterval.current);
    };
  }, [pipelineState]);

  // Set up socket listeners
  useEffect(() => {
    // Fetch initial list on load
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data))
      .catch(err => console.error("Error loading users:", err));

    socket.on('initial_state', (data) => {
      if (data.users) setUsers(data.users);
    });

    socket.on('user_update', (updatedUser) => {
      setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    });

    socket.on('agent_log', (logData) => {
      setLogs(prev => [...prev, logData]);
    });

    socket.on('pipeline_start', () => {
      setPipelineState('running');
      setStageLatencies({ ingestion: 0, translation: 0, broadcast: 0 });
    });

    socket.on('pipeline_end', (data) => {
      setPipelineState('completed');
      setFinalLatency(data.totalTime);
      if (data.latencies) {
        setStageLatencies(data.latencies);
      }
    });

    socket.on('reset_complete', (data) => {
      setUsers(data.users);
      setLogs([]);
      setPipelineState('idle');
      setStopwatch(0);
      setFinalLatency(null);
      setStageLatencies({ ingestion: 0, translation: 0, broadcast: 0 });
      setSelectedMapUser(null);
      setVoiceModalUser(null);
    });

    socket.on('toast_notification', (data) => {
      // Implement simple notification sound or visual cue if needed
      console.log("Toast:", data.title, data.message);
    });

    return () => {
      socket.off('initial_state');
      socket.off('user_update');
      socket.off('agent_log');
      socket.off('pipeline_start');
      socket.off('pipeline_end');
      socket.off('reset_complete');
      socket.off('toast_notification');
    };
  }, []);

  // Trigger Simulated Alert
  const triggerAlertSim = async () => {
    try {
      setPipelineState('running');
      // Add a client-side log to kick things off instantly
      setLogs([{
        timestamp: new Date().toLocaleTimeString(),
        agent: 'System Coordinator',
        message: 'Alert Simulator: Manual trigger initiated from command dashboard.',
        type: 'info'
      }]);

      await fetch('/api/simulate-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: PRESETS[activePreset].title,
          description: customAlert,
          severity: severity,
          languages: selectedLanguages,
          channels: enabledChannels
        })
      });
    } catch (err) {
      console.error(err);
      setPipelineState('idle');
    }
  };

  // Simulate user text response webhook
  const submitSimulatedReply = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;
    
    setIsSendingSim(true);
    const userObj = users.find(u => u.id === selectedUser);
    const message = simulatedReply === 'custom' ? customReplyText : simulatedReply;

    try {
      await fetch('/api/simulate-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: userObj.phone,
          message: message
        })
      });
      setCustomReplyText('');
    } catch (err) {
      console.error("Simulation reply failed:", err);
    } finally {
      setIsSendingSim(false);
    }
  };

  // Simulate Twilio Delivery Failures / Status Webhook
  const simulateDeliveryStatus = async (userId, targetStatus) => {
    // Locate the delivery mapped to this user. 
    // In mock mode, the backend sets SMmock_... sids. We can find the sid on the backend, 
    // or call the server, which checks all active mock deliveries for this user.
    // Let's call the backend simulation route
    try {
      const response = await fetch('/api/simulate-status-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Backend will match sid by finding user or we send user's index/sid.
          // Since activeDeliveries uses msg.sid as keys, let's look up the user phone in activeDeliveries.
          // We can let the backend look up by phone or name
          sid: userId, // we pass user id, and backend will find it in activeDeliveries
          status: targetStatus
        })
      });
      console.log(`Status simulation triggered: ${userId} -> ${targetStatus}`);
    } catch (err) {
      console.error("Status update simulation error:", err);
    }
  };

  // Force trigger voice escalation
  const triggerVoiceCallManual = async (userId) => {
    try {
      await fetch(`/api/simulate-ivr/${userId}`, { method: 'POST' });
    } catch (err) {
      console.error("IVR call simulation error:", err);
    }
  };

  // Quick feedback check-in helper
  const sendQuickFeedback = async (phone, replyText) => {
    try {
      await fetch('/api/simulate-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message: replyText })
      });
    } catch (err) {
      console.error("Quick feedback failed:", err);
    }
  };

  // Play IVR speech synthesis
  const playIVRVoice = async (userObj) => {
    try {
      const res = await fetch('/api/translations');
      const translations = await res.json();
      const userLang = userObj.language;
      const translation = translations[userLang] || {
        threat: "चक्रवात चेतावनी। आपातकालीन स्थिति।",
        action: ["सुरक्षित स्थान पर रहें।"]
      };
      
      window.speechSynthesis.cancel();
      
      const threatText = translation.threat;
      const actionText = translation.action.join(". ");
      
      let fullSpeechText = "";
      let langCode = "hi-IN";
      
      if (userLang === "Hindi") {
        fullSpeechText = `आपातकालीन सूचना। ${threatText}। कृपया तुरंत इन निर्देशों का पालन करें: ${actionText}। सुरक्षित स्थान पर रहें। धन्यवाद।`;
        langCode = "hi-IN";
      } else if (userLang === "Tamil") {
        fullSpeechText = `அவசரகால எச்சரிக்கை. ${threatText}. தயவுசெய்து உடனடியாக இந்த வழிமுறைகளைப் பின்பற்றவும்: ${actionText}. பாதுகாப்பாக இருங்கள். நன்றி.`;
        langCode = "ta-IN";
      } else if (userLang === "Bengali") {
        fullSpeechText = `জরুরি সতর্কতা বার্তা। ${threatText}। অনুগ্রহ করে অবিলম্বে এই নির্দেশাবলী অনুসরণ করুন: ${actionText}। নিরাপদ স্থানে থাকুন। ধন্যবাদ।`;
        langCode = "bn-IN";
      } else {
        fullSpeechText = `Emergency alert. ${threatText}. Please follow instructions immediately: ${actionText}. Stay safe.`;
        langCode = "en-US";
      }

      const utterance = new SpeechSynthesisUtterance(fullSpeechText);
      utterance.lang = langCode;
      utterance.rate = 0.95;
      
      utterance.onstart = () => {
        setIsVoicePlaying(true);
      };
      
      utterance.onend = () => {
        setIsVoicePlaying(false);
      };
      
      utterance.onerror = () => {
        setIsVoicePlaying(false);
      };
      
      setVoiceModalUser({
        user: userObj,
        text: fullSpeechText,
        translation: translation,
        utterance: utterance
      });

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error("Failed to play voice synthesis:", err);
    }
  };

  // Stop IVR Speech Synthesis
  const stopIVRVoice = () => {
    window.speechSynthesis.cancel();
    setIsVoicePlaying(false);
    setVoiceModalUser(null);
  };

  // System Reset
  const triggerReset = async () => {
    try {
      await fetch('/api/reset', { method: 'POST' });
    } catch (err) {
      console.error("Reset failed:", err);
    }
  };

  // Helper formatting for status colors
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Safe':
        return (
          <span className="flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 glow-green-pulse">
            <CheckCircle className="w-3.5 h-3.5 mr-1" /> SAFE
          </span>
        );
      case 'Unsafe':
        return (
          <span className="flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30 glow-red-pulse">
            <AlertTriangle className="w-3.5 h-3.5 mr-1 animate-pulse" /> UNSAFE / HELP
          </span>
        );
      case 'Delivered':
        return (
          <span className="flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 glow-blue-pulse">
            <CheckCircle className="w-3.5 h-3.5 mr-1" /> DELIVERED
          </span>
        );
      case 'SMS Fallback':
        return (
          <span className="flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30 glow-orange-pulse">
            <Smartphone className="w-3.5 h-3.5 mr-1" /> SMS FALLBACK
          </span>
        );
      case 'IVR Dispatch':
        return (
          <span className="flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <PhoneCall className="w-3.5 h-3.5 mr-1 animate-bounce" /> IVR CALLING
          </span>
        );
      default:
        return (
          <span className="flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <Clock className="w-3.5 h-3.5 mr-1" /> PENDING
          </span>
        );
    }
  };

  const getAgentColor = (agent) => {
    if (agent.includes('Monitor')) return 'text-indigo-400 font-bold';
    if (agent.includes('Translator')) return 'text-purple-400 font-bold';
    if (agent.includes('Broadcast')) return 'text-amber-400 font-bold';
    if (agent.includes('Feedback')) return 'text-teal-400 font-bold';
    return 'text-rose-400 font-bold';
  };

  const getLogStyle = (type) => {
    switch (type) {
      case 'success': return 'bg-emerald-500/5 border-l-2 border-emerald-500 pl-2 text-slate-300';
      case 'warning': return 'bg-amber-500/5 border-l-2 border-amber-500 pl-2 text-amber-200/90';
      case 'error': return 'bg-rose-500/5 border-l-2 border-rose-500 pl-2 text-rose-300';
      default: return 'text-slate-300 border-l border-slate-800 pl-2';
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch w-full">
      
      {/* ----------------- LEFT PANE: COMMAND CENTER (cols: 5) ----------------- */}
      <div className="lg:col-span-5 flex flex-col space-y-6">
        
        {/* Preset Selection Panel */}
        <div className="glass-panel rounded-2xl p-5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl"></div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold tracking-wide text-white flex items-center">
              <ShieldAlert className="w-4 h-4 mr-2 text-rose-500" /> SYSTEM COMMAND CENTER
            </h2>
            <button 
              onClick={triggerReset}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center space-x-1 py-1 px-2.5 rounded-lg bg-slate-900 border border-slate-800/80 hover:bg-slate-800 transition"
              title="Reset in-memory status"
            >
              <RefreshCw className="w-3.5 h-3.5" /> <span>RESET STATE</span>
            </button>
          </div>

          {/* Preset Chips */}
          <div className="flex space-x-2 mb-4 bg-slate-950/60 p-1 rounded-xl border border-slate-900">
            {PRESETS.map((p, idx) => (
              <button
                key={idx}
                onClick={() => applyPreset(idx)}
                className={`flex-1 text-center py-2 px-1 text-xs font-semibold rounded-lg transition-all ${
                  activePreset === idx 
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Active Preset Input Panel */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Simulator Warning Payload Text</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                severity === 'WARNING' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
              }`}>
                {severity}
              </span>
            </div>
            
            <textarea
              value={customAlert}
              onChange={(e) => setCustomAlert(e.target.value)}
              className="w-full h-24 bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs font-medium text-slate-200 focus:outline-none focus:border-rose-500/60 transition resize-none leading-relaxed"
            />

            {/* Target Languages Selection */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Target Languages</span>
              <div className="flex space-x-4">
                {['Hindi', 'Bengali', 'Tamil'].map(lang => (
                  <label key={lang} className="flex items-center space-x-1.5 text-xs text-slate-355 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedLanguages.includes(lang)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedLanguages(prev => [...prev, lang]);
                        } else {
                          setSelectedLanguages(prev => prev.filter(l => l !== lang));
                        }
                      }}
                      className="rounded border-slate-800 bg-slate-950 text-rose-500 focus:ring-rose-500/50"
                    />
                    <span>{lang}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Fallback Channels Toggle */}
            <div className="space-y-1.5 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Escalation Fallbacks</span>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-1.5 text-xs text-slate-355 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledChannels.sms}
                    onChange={(e) => setEnabledChannels(prev => ({ ...prev, sms: e.target.checked }))}
                    className="rounded border-slate-800 bg-slate-950 text-rose-500 focus:ring-rose-500/50"
                  />
                  <span>SMS Fallback</span>
                </label>
                <label className="flex items-center space-x-1.5 text-xs text-slate-355 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledChannels.ivr}
                    onChange={(e) => setEnabledChannels(prev => ({ ...prev, ivr: e.target.checked }))}
                    className="rounded border-slate-800 bg-slate-950 text-rose-500 focus:ring-rose-500/50"
                  />
                  <span>IVR Voice Call</span>
                </label>
              </div>
            </div>

            <div className="flex space-x-3 pt-1">
              <div className="flex-1 flex flex-col justify-center">
                <span className="text-[10px] text-slate-500">Pipeline Ingestion Mode</span>
                <span className="text-xs font-semibold text-slate-300">Parallel Translator (MVP)</span>
              </div>
              <button
                onClick={triggerAlertSim}
                disabled={pipelineState === 'running' || selectedLanguages.length === 0}
                className={`py-3 px-5 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center space-x-2 transition ${
                  pipelineState === 'running' || selectedLanguages.length === 0
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                    : 'bg-rose-500 hover:bg-rose-600 text-white shadow-xl shadow-rose-500/20 border border-rose-400/20'
                }`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>LAUNCH CRISIS PIPELINE</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stopwatch & Speed Telemetry Panel */}
        <div className="glass-panel rounded-2xl p-5 shadow-2xl relative overflow-hidden">
          <div className="flex items-center space-x-2 mb-4">
            <Clock className="w-4 h-4 text-emerald-400" />
            <h2 className="text-base font-bold tracking-wide text-white">PIPELINE LATENCY stopwatch</h2>
          </div>

          <div className="grid grid-cols-2 gap-4 items-center bg-slate-950/40 p-4 rounded-xl border border-slate-900">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Execution Timer</p>
              <div className="flex items-baseline space-x-1">
                <span className="text-3xl font-extrabold text-white font-mono tracking-tight">
                  {pipelineState === 'running' 
                    ? (stopwatch / 1000).toFixed(2) 
                    : finalLatency 
                      ? (finalLatency / 1000).toFixed(2) 
                      : "0.00"
                  }
                </span>
                <span className="text-slate-400 font-bold text-sm">sec</span>
              </div>
            </div>
            <div className="border-l border-slate-900 pl-4 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Stage Latencies</p>
              <div className="text-[11px] font-mono space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">1. Ingestion:</span>
                  <span className="text-emerald-400 font-bold">
                    {pipelineState === 'running' ? 'Active...' : stageLatencies.ingestion ? `${stageLatencies.ingestion}ms` : '0ms'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">2. LLM Translation:</span>
                  <span className="text-purple-400 font-bold">
                    {pipelineState === 'running' ? 'Active...' : stageLatencies.translation ? `${stageLatencies.translation}ms` : '0ms'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">3. Broadcast Dispatch:</span>
                  <span className="text-amber-400 font-bold">
                    {pipelineState === 'running' ? 'Pending...' : stageLatencies.broadcast ? `${stageLatencies.broadcast}ms` : '0ms'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Logs Terminal Console */}
        <div className="glass-panel rounded-2xl p-5 shadow-2xl flex-1 flex flex-col min-h-[350px]">
          <div className="flex items-center justify-between mb-3 border-b border-slate-900/60 pb-3">
            <h2 className="text-base font-bold tracking-wide text-white flex items-center">
              <Terminal className="w-4 h-4 mr-2 text-indigo-400" /> REAL-TIME AGENT TELEMETRY LOGS
            </h2>
            <button 
              onClick={() => setLogs([])}
              className="text-[10px] font-semibold text-slate-500 hover:text-slate-300 py-0.5 px-2 rounded-md hover:bg-slate-900 border border-slate-800"
            >
              CLEAR CONSOLE
            </button>
          </div>

          <div className="h-[280px] overflow-y-auto bg-slate-950/85 border border-slate-900 rounded-xl p-3 font-mono text-[11px] space-y-2.5">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center select-none">
                <Terminal className="w-8 h-8 mb-2 opacity-30 animate-pulse" />
                <p>Console empty. Spawns automated agents logs upon triggering an alert simulate.</p>
              </div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className={`flex flex-col py-1 border-b border-slate-900/30 last:border-0 ${getLogStyle(log.type)}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-slate-500 font-semibold">{log.timestamp}</span>
                    <span className={`text-[10px] font-bold uppercase ${getAgentColor(log.agent)}`}>
                      {log.agent}
                    </span>
                  </div>
                  <p className="text-slate-300 break-words leading-relaxed">{log.message}</p>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

      </div>

      {/* ----------------- RIGHT PANE: LIVE IMPACT FEED (cols: 7) ----------------- */}
      <div className="lg:col-span-7 flex flex-col space-y-6">
        
        {/* Coastal Mapping Status Panel */}
        <div className="glass-panel rounded-2xl p-5 shadow-2xl relative overflow-hidden">
          <div className="flex items-center space-x-2 mb-4">
            <Map className="w-4 h-4 text-rose-500" />
            <h2 className="text-base font-bold tracking-wide text-white">GEOSPATIAL STORM INUNDATION RADAR</h2>
          </div>

          <div className="relative bg-slate-950/80 rounded-xl border border-slate-900 p-4 h-[250px] overflow-hidden flex items-center justify-center">
            
            {/* SVG Visual Map representation */}
            <svg viewBox="0 0 450 250" className="w-full h-full opacity-85 select-none z-10">
              <defs>
                <linearGradient id="radarSweep" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(59, 130, 246, 0)" />
                  <stop offset="100%" stopColor="rgba(59, 130, 246, 0.25)" />
                </linearGradient>
              </defs>

              {/* Concentric radar grid circles */}
              <circle cx="225" cy="125" r="50" fill="none" stroke="rgba(59, 130, 246, 0.08)" strokeWidth="1" />
              <circle cx="225" cy="125" r="100" fill="none" stroke="rgba(59, 130, 246, 0.08)" strokeWidth="1" />
              <circle cx="225" cy="125" r="150" fill="none" stroke="rgba(59, 130, 246, 0.05)" strokeWidth="1" />
              <circle cx="225" cy="125" r="200" fill="none" stroke="rgba(59, 130, 246, 0.03)" strokeWidth="1" />
              
              {/* Radiating lines */}
              <line x1="25" y1="125" x2="425" y2="125" stroke="rgba(59, 130, 246, 0.04)" strokeWidth="1" />
              <line x1="225" y1="25" x2="225" y2="225" stroke="rgba(59, 130, 246, 0.04)" strokeWidth="1" />

              {/* Radar sweep beam */}
              <g className="radar-sweep-beam" style={{ transformOrigin: '225px 125px' }}>
                <polygon points="225,125 425,110 425,140" fill="url(#radarSweep)" />
                <line x1="225" y1="125" x2="425" y2="125" stroke="rgba(59, 130, 246, 0.3)" strokeWidth="1.5" />
              </g>

              {/* Landmass outline */}
              <path 
                d="M50 0 C70 50, 110 90, 180 120 C220 135, 270 145, 340 180 C390 205, 420 220, 450 250 L450 0 Z" 
                fill="#111827" 
                stroke="#1f2937" 
                strokeWidth="1.5" 
              />
              
              {/* Coastline Shoreline wave effect */}
              <path 
                d="M50 0 C70 50, 110 90, 180 120 C220 135, 270 145, 340 180 C390 205, 420 220, 450 250" 
                fill="none" 
                stroke="#1e3a8a" 
                strokeWidth="3" 
                strokeDasharray="4 2" 
                className="opacity-50"
              />

              {/* Storm vortex overlay */}
              <g className="origin-center animate-spin" style={{ transformOrigin: '320px 100px', animationDuration: '20s' }}>
                {/* Typhoon spiral lines */}
                <circle cx="320" cy="100" r="45" fill="none" stroke="rgba(244, 63, 94, 0.15)" strokeWidth="6" strokeDasharray="20 10" />
                <circle cx="320" cy="100" r="30" fill="none" stroke="rgba(244, 63, 94, 0.2)" strokeWidth="4" strokeDasharray="15 8" />
                <circle cx="320" cy="100" r="15" fill="rgba(244, 63, 94, 0.1)" stroke="rgba(244, 63, 94, 0.4)" strokeWidth="2" />
              </g>

              {/* Storm projection arrow */}
              <path 
                d="M 320 100 Q 250 120, 190 115" 
                fill="none" 
                stroke="#ef4444" 
                strokeWidth="1.5" 
                strokeDasharray="5 3" 
              />
              <text x="310" y="80" fill="#f43f5e" fontSize="9" fontWeight="bold">Storm Core (Dana)</text>
              <text x="140" y="100" fill="#64748b" fontSize="8" transform="rotate(20 140 100)">Bay of Bengal</text>

              {/* Coordinates mappings for mock users */}
              {/* User 1: Puri (19.8134, 85.8312) -> Mapping to X=170 Y=120 */}
              {/* User 2: Nagapattinam (10.7672, 79.8444) -> Mapping to X=60 Y=210 */}
              {/* User 3: Digha (21.6266, 87.5074) -> Mapping to X=280 Y=75 */}
              {/* User 4: Paradip (20.2606, 86.6666) -> Mapping to X=205 Y=105 */}
              {/* User 5: Sundarbans (21.9497, 89.1833) -> Mapping to X=330 Y=60 */}
              
              {users.map(u => {
                let x = 150, y = 150;
                if (u.id === 'user_1') { x = 160; y = 115; }
                else if (u.id === 'user_2') { x = 70; y = 205; }
                else if (u.id === 'user_3') { x = 280; y = 75; }
                else if (u.id === 'user_4') { x = 205; y = 100; }
                else if (u.id === 'user_5') { x = 320; y = 55; }

                let markerColor = '#94a3b8'; // pending grey
                let glowClass = '';
                if (u.status === 'Safe') { markerColor = '#22c55e'; glowClass = 'glow-green-pulse'; }
                else if (u.status === 'Unsafe') { markerColor = '#ef4444'; glowClass = 'glow-red-pulse'; }
                else if (u.status === 'SMS Fallback') { markerColor = '#f97316'; glowClass = 'glow-orange-pulse'; }
                else if (u.status === 'IVR Dispatch') { markerColor = '#a855f7'; }
                else if (u.status === 'Delivered') { markerColor = '#3b82f6'; glowClass = 'glow-blue-pulse'; }

                return (
                  <g 
                    key={u.id} 
                    className="cursor-pointer group"
                    onClick={() => setSelectedMapUser(u)}
                  >
                    {/* Pulsing glow background */}
                    <circle cx={x} cy={y} r="8" className={`${glowClass} group-hover:scale-125 transition-transform`} fill={markerColor} opacity="0.3" />
                    {/* Core node */}
                    <circle cx={x} cy={y} r="4" fill={markerColor} stroke="#ffffff" strokeWidth="1" className="group-hover:stroke-rose-400 transition" />
                    {/* Label */}
                    <text x={x + 7} y={y + 3} fill="#e2e8f0" fontSize="8" fontWeight="600" className="drop-shadow-md group-hover:fill-rose-350 transition">
                      {u.name.split(' ')[0]}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Clickable Map Detail Profile Popover */}
            {selectedMapUser && (
              <div className="absolute top-2 right-2 bg-slate-900/95 border border-slate-800/80 rounded-xl p-3 shadow-xl z-30 max-w-[200px] text-[11px] space-y-1.5 backdrop-blur-sm">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-white leading-tight">{selectedMapUser.name}</h4>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setSelectedMapUser(null); }}
                    className="text-slate-500 hover:text-slate-300 ml-2 text-xs"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-slate-400 font-mono text-[9px]">{selectedMapUser.phone}</p>
                <div className="border-t border-slate-800/60 my-1"></div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Lang:</span>
                  <span className="font-semibold text-slate-350">{selectedMapUser.language}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Location:</span>
                  <span className="text-slate-350 text-right text-[10px] break-all leading-tight">{selectedMapUser.location.split(',')[0]}</span>
                </div>
                <div className="flex justify-between items-center pt-0.5">
                  <span className="text-slate-500">Status:</span>
                  {getStatusBadge(selectedMapUser.status)}
                </div>
                
                {selectedMapUser.status === 'IVR Dispatch' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); playIVRVoice(selectedMapUser); }}
                    className="w-full mt-1.5 py-1 px-2 rounded bg-purple-500/20 hover:bg-purple-500/35 text-purple-400 font-semibold text-[10px] flex items-center justify-center space-x-1 border border-purple-500/30 transition animate-pulse"
                  >
                    <span>Play IVR Synthesis</span>
                  </button>
                )}
              </div>
            )}
            
            {/* Legend Overlay */}
            <div className="absolute bottom-2 right-2 bg-slate-900/95 border border-slate-800/80 rounded-lg p-2 flex flex-col space-y-1 text-[9px] text-slate-400 font-semibold z-20">
              <div className="flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span> <span>Safe Check-in</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500"></span> <span>Needs Help</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500"></span> <span>WhatsApp Delivered</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-orange-500"></span> <span>SMS Fallback</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-500"></span> <span>Pending</span>
              </div>
            </div>
            
            <div className="absolute top-2 left-2 bg-slate-900/90 border border-slate-850 rounded-lg py-1 px-2.5 text-[10px] text-slate-300 font-mono z-25 flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
              <span>RADAR SWEEP ACTIVE</span>
            </div>
          </div>
        </div>

        {/* User database live status table/grid */}
        <div className="glass-panel rounded-2xl p-5 shadow-2xl flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-slate-900/60 pb-3">
            <h2 className="text-base font-bold tracking-wide text-white flex items-center">
              <Users className="w-4 h-4 mr-2 text-indigo-400" /> AFFECTED RESIDENTS TELEMETRY RECORD
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-md font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
              Total Monitored: {users.length}
            </span>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-x-auto min-h-[220px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-900/80 text-slate-500 font-bold tracking-wider">
                  <th className="py-2.5 px-3">RESIDENT</th>
                  <th className="py-2.5 px-3">LANGUAGE</th>
                  <th className="py-2.5 px-3">CHANNEL</th>
                  <th className="py-2.5 px-3">STATUS</th>
                  <th className="py-2.5 px-3">LAST RESPONSE / TIMEOUT ACTION</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-900/35 hover:bg-slate-900/30 transition-colors">
                    <td className="py-3 px-3">
                      <div>
                        <p className="font-bold text-slate-200">{u.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{u.phone}</p>
                        <p className="text-[10px] text-slate-400">{u.location}</p>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-300">
                      {u.language}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded font-mono text-[10px] ${
                        u.channel === 'WhatsApp' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        u.channel === 'SMS' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                        'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                      }`}>
                        {u.channel}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {getStatusBadge(u.status)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col space-y-2">
                        {/* Quick check-in inline simulation */}
                        {(u.status === 'Pending' || u.status === 'Delivered' || u.status === 'SMS Fallback' || u.status === 'IVR Dispatch') && (
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => sendQuickFeedback(u.phone, '1')}
                              className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/25 text-emerald-400 text-[10px] font-semibold transition"
                              title="Declare Safe (sends '1')"
                            >
                              ✔️ Safe
                            </button>
                            <button
                              onClick={() => sendQuickFeedback(u.phone, '2')}
                              className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/25 text-rose-400 text-[10px] font-semibold transition"
                              title="Request Help (sends '2')"
                            >
                              ⚠️ Help
                            </button>
                          </div>
                        )}

                        {/* Direct manual channel control triggers */}
                        <div className="flex flex-wrap gap-1.5">
                          {u.status === 'Pending' && (
                            <>
                              <button
                                onClick={() => simulateDeliveryStatus(u.id, 'failed')}
                                className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20 text-amber-400 text-[10px] font-semibold transition"
                                title="Fail WhatsApp delivery to run SMS fallback"
                              >
                                Fail WhatsApp
                              </button>
                              <button
                                onClick={() => triggerVoiceCallManual(u.id)}
                                className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/25 hover:bg-purple-500/20 text-purple-400 text-[10px] font-semibold transition"
                              >
                                Escalate Voice
                              </button>
                            </>
                          )}
                          
                          {u.status === 'Delivered' && (
                            <button
                              onClick={() => triggerVoiceCallManual(u.id)}
                              className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/25 hover:bg-purple-500/20 text-purple-400 text-[10px] font-semibold transition"
                            >
                              Escalate Voice
                            </button>
                          )}

                          {u.status === 'SMS Fallback' && (
                            <button
                              onClick={() => triggerVoiceCallManual(u.id)}
                              className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/25 hover:bg-purple-500/20 text-purple-400 text-[10px] font-semibold transition"
                            >
                              Escalate Voice
                            </button>
                          )}

                          {u.status === 'IVR Dispatch' && (
                            <button
                              onClick={() => playIVRVoice(u)}
                              className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/30 text-purple-400 text-[10px] font-bold flex items-center space-x-1 transition"
                            >
                              <span>📞 Stream Call</span>
                            </button>
                          )}

                          {(u.status === 'Safe' || u.status === 'Unsafe') && (
                            <p className="text-slate-350 italic text-[11px] leading-relaxed max-w-[200px]">
                              {u.lastMessage ? `"${u.lastMessage}"` : 'Status updated.'}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live feedback simulation tool */}
        <div className="glass-panel rounded-2xl p-5 shadow-2xl">
          <div className="flex items-center space-x-2 mb-3">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <h2 className="text-base font-bold tracking-wide text-white">TWO-WAY RESIDENT SAFETY FEEDBACK SIMULATOR</h2>
          </div>
          
          <form onSubmit={submitSimulatedReply} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-4 space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Select Resident</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                required
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 transition"
              >
                <option value="">-- Choose Resident --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.language})</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Reply Intention</label>
              <select
                value={simulatedReply}
                onChange={(e) => setSimulatedReply(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 transition"
              >
                <option value="1">"1" (Declare Safe)</option>
                <option value="2">"2" (Request Help)</option>
                <option value="I am safe, reached high ground">Text: "Safe & evacuated"</option>
                <option value="Water is rising rapidly in my room, help">Text: "Emergency / trapped"</option>
                <option value="custom">-- Write Custom Text --</option>
              </select>
            </div>

            <div className="md:col-span-3 space-y-1.5">
              {simulatedReply === 'custom' ? (
                <>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Custom message text</label>
                  <input
                    type="text"
                    required
                    value={customReplyText}
                    onChange={(e) => setCustomReplyText(e.target.value)}
                    placeholder="e.g. Tree blocked road, need food"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 transition placeholder:text-slate-650"
                  />
                </>
              ) : (
                <div className="py-2.5 px-1 flex flex-col justify-center">
                  <span className="text-[10px] text-slate-500">Classification Method</span>
                  <span className="text-xs font-semibold text-slate-400">Gemini Intent Parser</span>
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={isSendingSim || !selectedUser}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                  isSendingSim || !selectedUser
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/10 border border-emerald-400/20'
                }`}
              >
                <span>TRANSMIT</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>

      </div>

    </div>

    {/* Speech TTS playback modal */}
    {voiceModalUser && (
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="glass-panel max-w-md w-full rounded-2xl p-6 shadow-2xl relative border border-slate-800 space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-900">
            <div className="flex items-center space-x-2">
              <span className="text-purple-400 animate-pulse">📞</span>
              <h3 className="font-bold text-white text-base">IVR Voice Call Simulator</h3>
            </div>
            <button 
              onClick={stopIVRVoice}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold"
            >
              ✕ CLOSE
            </button>
          </div>

          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-900/80 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Resident:</span>
              <span className="font-bold text-slate-200">{voiceModalUser.user.name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Dial Phone:</span>
              <span className="font-mono text-indigo-455 font-medium">{voiceModalUser.user.phone}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Language:</span>
              <span className="font-semibold text-purple-400">{voiceModalUser.user.language}</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">TwiML Audio Streaming Message</p>
            <div className="bg-purple-950/15 border border-purple-500/25 rounded-xl p-3.5 text-xs text-purple-200 font-medium leading-relaxed italic">
              "{voiceModalUser.translation.threat} - {voiceModalUser.translation.action.join('. ')}"
            </div>
          </div>

          {/* Soundwave Visualizer Animation */}
          <div className="flex items-center justify-center space-x-1.5 h-10 py-1 bg-slate-950/40 rounded-xl border border-slate-900/40">
            {isVoicePlaying ? (
              Array.from({ length: 15 }).map((_, i) => {
                const delay = (i % 5) * 0.15;
                const height = [16, 32, 24, 8, 20][i % 5];
                return (
                  <div 
                    key={i} 
                    className="w-1 bg-purple-500 rounded-full" 
                    style={{ 
                      height: `${height}px`, 
                      animation: `pulse-glow-blue 1.2s infinite ease-in-out alternate`, 
                      animationDelay: `${delay}s` 
                    }}
                  />
                );
              })
            ) : (
              <div className="text-[10px] text-slate-500 font-mono italic">Speech Synthesis Paused / Finished</div>
            )}
          </div>

          <div className="flex space-x-3 pt-2">
            {isVoicePlaying ? (
              <button
                onClick={() => {
                  window.speechSynthesis.pause();
                  setIsVoicePlaying(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/30 text-amber-400 text-xs font-bold transition"
              >
                ⏸ PAUSE CALL
              </button>
            ) : (
              <button
                onClick={() => {
                  if (window.speechSynthesis.paused) {
                    window.speechSynthesis.resume();
                    setIsVoicePlaying(true);
                  } else {
                    playIVRVoice(voiceModalUser.user);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-650 text-white text-xs font-bold transition shadow-lg shadow-purple-500/10"
              >
                ▶️ RESUME CALL
              </button>
            )}
            <button
              onClick={stopIVRVoice}
              className="py-2.5 px-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition"
            >
              DISCONNECT
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
}
