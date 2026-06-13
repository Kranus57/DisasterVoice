import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

const INITIAL_PRESETS = [
  {
    name: "Cyclone Dana Alert",
    title: "Severe Cyclone Dana Approaching Coastal Odisha",
    severity: "CRITICAL",
    description: "Cyclone warning issued for coastal Odisha and West Bengal. Landfall expected within 18 hours with wind speeds reaching 150 km/h. Coastal populations near Puri and Paradip must evacuate immediately.",
    center: [19.2, 87.8],
    zoom: 6,
    trackPoints: [
      [17.0, 89.5],
      [18.0, 88.8],
      [19.2, 87.8],
      [20.1, 86.8], // Landfall Puri/Paradip
      [21.0, 85.5]
    ]
  },
  {
    name: "Sundarbans Flood Warning",
    title: "Flash Flood Alert for Sundarbans Delta",
    severity: "WARNING",
    description: "Severe flooding inundation reported across Sundarbans and Digha due to torrential rains and tidal surges. Low-lying mud embankments breached. Please move to cement cyclone shelters.",
    center: [21.7, 88.5],
    zoom: 7,
    trackPoints: [
      [20.0, 88.0],
      [21.0, 88.5],
      [21.7, 88.5]
    ]
  },
  {
    name: "Tamil Nadu Swell Waves",
    title: "Tidal Wave Surge Warning - Nagapattinam",
    severity: "ADVISORY",
    description: "High swell wave advisory issued for Tamil Nadu coast. Sea waves likely to exceed 4 meters. Fishermen warned against going out. Beachside residents near Nagapattinam should relocate inland.",
    center: [10.8, 79.9],
    zoom: 7,
    trackPoints: [
      [9.0, 81.5],
      [10.0, 80.8],
      [10.8, 79.9]
    ]
  }
];

export default function Dashboard({ theme }) {
  const [presets, setPresets] = useState(INITIAL_PRESETS);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activePreset, setActivePreset] = useState(0);
  const [customAlert, setCustomAlert] = useState(INITIAL_PRESETS[0].description);
  const [severity, setSeverity] = useState(INITIAL_PRESETS[0].severity);
  
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

  // Leaflet map states and refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef({});
  const stormOverlayRef = useRef(null);
  const disasterMarkerRef = useRef(null);
  const trackLineRef = useRef(null);
  const operatorMarkerRef = useRef(null);
  const [isLocating, setIsLocating] = useState(false);
  const [operatorLocation, setOperatorLocation] = useState(null);
  
  // Add User from Map modal state
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [clickedCoords, setClickedCoords] = useState(null);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserLang, setNewUserLang] = useState('Hindi');
  const [newUserLocName, setNewUserLocName] = useState('');

  // Add Custom Disaster states
  const [showAddDisasterModal, setShowAddDisasterModal] = useState(false);
  const [disasterName, setDisasterName] = useState('');
  const [disasterTitle, setDisasterTitle] = useState('');
  const [disasterSeverity, setDisasterSeverity] = useState('CRITICAL');
  const [disasterDesc, setDisasterDesc] = useState('');
  const [disasterLat, setDisasterLat] = useState('19.0');
  const [disasterLng, setDisasterLng] = useState('85.0');
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const isPickingLocationRef = useRef(false);

  useEffect(() => {
    isPickingLocationRef.current = isPickingLocation;
  }, [isPickingLocation]);


  const getMarkerColor = (status) => {
    switch (status) {
      case 'Safe': return '#10b981';      // Emerald-500
      case 'Unsafe': return '#ef4444';    // Red-500
      case 'Delivered': return '#3b82f6'; // Blue-500
      case 'SMS Fallback': return '#f97316'; // Orange-500
      case 'IVR Dispatch': return '#a855f7'; // Purple-500
      default: return '#64748b';          // Slate-500
    }
  };

  const locateOperator = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setOperatorLocation({ lat: latitude, lng: longitude });
        setIsLocating(false);

        if (mapInstanceRef.current) {
          const map = mapInstanceRef.current;
          map.setView([latitude, longitude], 8); // Zoom closer

          // Draw operator marker
          const operatorIconHtml = `
            <div class="relative flex items-center justify-center">
              <span class="absolute inline-flex h-10 w-10 rounded-full bg-blue-500/30 opacity-40 animate-ping"></span>
              <span class="relative inline-flex rounded-full h-5 w-5 bg-blue-500 border-2 border-white shadow-lg flex items-center justify-center">
                <span class="h-2 w-2 rounded-full bg-white"></span>
              </span>
            </div>
          `;

          const opIcon = L.divIcon({
            html: operatorIconHtml,
            className: 'operator-leaflet-marker',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          });

          if (operatorMarkerRef.current) {
            operatorMarkerRef.current.setLatLng([latitude, longitude]);
          } else {
            const opMarker = L.marker([latitude, longitude], { icon: opIcon })
              .addTo(map)
              .bindPopup(`
                <div class="text-xs text-slate-200 bg-slate-950 p-2 rounded border border-slate-800 font-sans min-w-[150px]">
                  <h4 class="font-bold text-white text-sm">Command Center (You)</h4>
                  <p class="text-[10px] text-slate-400 font-mono mt-0.5">${latitude.toFixed(6)}, ${longitude.toFixed(6)}</p>
                  <p class="text-[10px] text-blue-400 mt-1">Acquired via GPS</p>
                </div>
              `);
            operatorMarkerRef.current = opMarker;
          }
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        setIsLocating(false);
        alert(`Failed to acquire GPS location: ${error.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleAddNewUser = async (e) => {
    e.preventDefault();
    if (!newUserName || !newUserPhone || !newUserLang || !clickedCoords) return;

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName,
          phone: newUserPhone,
          language: newUserLang,
          location: newUserLocName || `Coordinates: ${clickedCoords.lat}, ${clickedCoords.lng}`,
          lat: clickedCoords.lat,
          lng: clickedCoords.lng
        })
      });

      const data = await response.json();
      if (data.success) {
        setNewUserName('');
        setNewUserPhone('');
        setNewUserLang('Hindi');
        setNewUserLocName('');
        setShowAddUserModal(false);
        setClickedCoords(null);
        
        setLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          agent: 'System Coordinator',
          message: `Resident "${data.user.name}" registered successfully at GPS coordinates (${data.user.lat}, ${data.user.lng}).`,
          type: 'success'
        }]);
      }
    } catch (err) {
      console.error("Failed to add user:", err);
      alert("Failed to add resident. Check server connection.");
    }
  };

  const handleAddNewDisaster = (e) => {
    e.preventDefault();
    if (!disasterName || !disasterTitle || !disasterDesc || !disasterLat || !disasterLng) return;

    const latNum = Number(disasterLat);
    const lngNum = Number(disasterLng);

    const newTrackPoints = [
      [latNum - 1.5, lngNum + 1.2],
      [latNum - 0.7, lngNum + 0.6],
      [latNum, lngNum],
      [latNum + 0.8, lngNum - 0.7],
      [latNum + 1.6, lngNum - 1.5]
    ];

    const newPreset = {
      name: disasterName,
      title: disasterTitle,
      severity: disasterSeverity,
      description: disasterDesc,
      center: [latNum, lngNum],
      zoom: 6,
      trackPoints: newTrackPoints
    };

    setPresets(prev => {
      const updated = [...prev, newPreset];
      setActivePreset(updated.length - 1);
      setCustomAlert(newPreset.description);
      setSeverity(newPreset.severity);
      return updated;
    });

    setShowAddDisasterModal(false);
    setDisasterName('');
    setDisasterTitle('');
    setDisasterSeverity('CRITICAL');
    setDisasterDesc('');
    setDisasterLat('19.0');
    setDisasterLng('85.0');

    setLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      agent: 'System Coordinator',
      message: `Manually added new disaster: "${disasterTitle}" centered at (${latNum}, ${lngNum}).`,
      type: 'success'
    }]);
  };

  // Parse preset choices
  const applyPreset = (index) => {
    setActivePreset(index);
    setCustomAlert(presets[index].description);
    setSeverity(presets[index].severity);
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

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Center of the Bay of Bengal coastline, fitting Odisha, Bengal, and Tamil Nadu
    const map = L.map(mapContainerRef.current, {
      center: INITIAL_PRESETS[0].center,
      zoom: INITIAL_PRESETS[0].zoom,
      zoomControl: true,
      attributionControl: false
    });

    // Dynamic tile layer initialized with current theme
    const initialTileUrl = theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    const tiles = L.tileLayer(initialTileUrl, {
      maxZoom: 19
    }).addTo(map);
    tileLayerRef.current = tiles;

    mapInstanceRef.current = map;

    // Draw the storm overlay (impact range circle)
    const stormCircle = L.circle(INITIAL_PRESETS[0].center, {
      color: '#ef4444',
      fillColor: '#ef4444',
      fillOpacity: 0.12,
      radius: 200000, // 200km radius
      weight: 1.5,
      dashArray: '5, 5'
    }).addTo(map);

    // Pulse animation for storm overlay
    let goingUp = true;
    const pulseInterval = setInterval(() => {
      if (!mapInstanceRef.current) return;
      const currentOpacity = stormCircle.options.fillOpacity;
      let newOpacity = goingUp ? currentOpacity + 0.005 : currentOpacity - 0.005;
      if (newOpacity >= 0.20) {
        newOpacity = 0.20;
        goingUp = false;
      } else if (newOpacity <= 0.08) {
        newOpacity = 0.08;
        goingUp = true;
      }
      stormCircle.setStyle({ fillOpacity: newOpacity });
    }, 150);

    stormOverlayRef.current = stormCircle;

    // Draw Cyclone Eye rotating marker
    const stormIconHtml = `
      <div class="animate-spin" style="animation-duration: 20s">
        <svg viewBox="0 0 100 100" class="w-12 h-12 text-rose-500 opacity-80 filter drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]">
          <circle cx="50" cy="50" r="10" fill="currentColor" />
          <path fill="currentColor" d="M50 30c-11 0-20 9-20 20s9 20 20 20 20-9 20-20-9-20-20-20zm0 30c-5.5 0-10-4.5-10-10s4.5-10 10-10 10 4.5 10 10-4.5 10-10 10z" opacity="0.5"/>
          <path fill="currentColor" d="M50 0C22.4 0 0 22.4 0 50c0 10.1 3 19.5 8.2 27.4l12.4-12.4C17.3 59.5 15 50 15 50c0-19.3 15.7-35 35-35h15l15-15H50z" />
          <path fill="currentColor" d="M50 100c27.6 0 50-22.4 50-50 0-10.1-3-19.5-8.2-27.4L89.4 35c3.3 5.5 5.6 15 5.6 15 0 19.3-15.7 35-35 35H45L30 100h20z" />
        </svg>
      </div>
    `;

    const stormEyeIcon = L.divIcon({
      html: stormIconHtml,
      className: 'storm-eye-marker',
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });

    const disasterMarker = L.marker(INITIAL_PRESETS[0].center, { icon: stormEyeIcon })
      .addTo(map)
      .bindPopup(`
        <div class="text-xs text-rose-200 bg-slate-950 p-2.5 rounded-lg border border-rose-900/40 font-sans">
          <h4 class="font-bold text-rose-500 text-sm">Cyclone Dana Eye</h4>
          <p class="text-[10px] text-slate-400">Current Intensity: Category 2</p>
          <p class="text-[10px] text-slate-400">Est. Landfall: 12 Hours</p>
          <p class="text-[10px] text-rose-450 font-bold">Speed: 150 km/h</p>
        </div>
      `);
    disasterMarkerRef.current = disasterMarker;

    // Forecast Track Polyline
    const trackLine = L.polyline(INITIAL_PRESETS[0].trackPoints, {
      color: '#ef4444',
      weight: 2,
      opacity: 0.6,
      dashArray: '6, 6'
    }).addTo(map);
    trackLineRef.current = trackLine;

    // Map click handler to open the registration dialog or pick coordinates for custom disaster
    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (isPickingLocationRef.current) {
        setDisasterLat(lat.toFixed(6));
        setDisasterLng(lng.toFixed(6));
        setIsPickingLocation(false);
        setShowAddDisasterModal(true);
      } else {
        setClickedCoords({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
        setNewUserLocName(`Coastal Region (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        setShowAddUserModal(true);
      }
    });

    // Invalidate size to guarantee rendering
    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearInterval(pulseInterval);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update map tile layer dynamically when theme changes
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    const map = mapInstanceRef.current;
    
    // Remove old tiles
    tileLayerRef.current.remove();

    const newUrl = theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    const newTiles = L.tileLayer(newUrl, {
      maxZoom: 19
    }).addTo(map);
    tileLayerRef.current = newTiles;
  }, [theme]);


  // Update map center and overlays when active preset changes
  useEffect(() => {
    if (!mapInstanceRef.current || !presets[activePreset]) return;
    const map = mapInstanceRef.current;
    const currentPreset = presets[activePreset];

    // Fly to new location
    map.flyTo(currentPreset.center, currentPreset.zoom || 6, {
      animate: true,
      duration: 1.5
    });

    // Update storm range circle
    if (stormOverlayRef.current) {
      stormOverlayRef.current.setLatLng(currentPreset.center);
    }

    // Update disaster center marker popup content & position
    if (disasterMarkerRef.current) {
      disasterMarkerRef.current.setLatLng(currentPreset.center);
      disasterMarkerRef.current.setPopupContent(`
        <div class="text-xs text-rose-200 bg-slate-950 p-2.5 rounded-lg border border-rose-900/40 font-sans">
          <h4 class="font-bold text-rose-500 text-sm">${currentPreset.title}</h4>
          <p class="text-[10px] text-slate-400">Severity: ${currentPreset.severity}</p>
          <p class="text-[10px] text-slate-400">Location: ${currentPreset.center[0].toFixed(4)}, ${currentPreset.center[1].toFixed(4)}</p>
        </div>
      `);
    }

    // Update track line polyline geometry
    if (trackLineRef.current && currentPreset.trackPoints) {
      trackLineRef.current.setLatLngs(currentPreset.trackPoints);
    }
  }, [activePreset, presets]);


  // Update/Render Resident Markers on users list change
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Remove obsolete markers
    Object.keys(markersRef.current).forEach(userId => {
      if (!users.some(u => u.id === userId)) {
        markersRef.current[userId].remove();
        delete markersRef.current[userId];
      }
    });

    // Draw/Update markers
    users.forEach(user => {
      if (user.lat === undefined || user.lng === undefined) return;

      const markerColor = getMarkerColor(user.status);
      const iconHtml = `
        <div class="relative flex items-center justify-center">
          <span class="absolute inline-flex h-8 w-8 rounded-full opacity-35 animate-ping" style="background-color: ${markerColor}"></span>
          <span class="relative inline-flex rounded-full h-5.5 w-5.5 border border-white shadow-lg flex items-center justify-center text-[9px] font-extrabold text-white" style="background-color: ${markerColor}">
            ${user.name.charAt(0)}
          </span>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-leaflet-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const popupContent = document.createElement('div');
      popupContent.className = 'text-xs text-slate-200 bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5 min-w-[200px] font-sans';
      
      let badgeHtml = `<span class="px-1.5 py-0.5 rounded font-mono text-[9px] uppercase font-bold" style="background-color: ${markerColor}33; color: ${markerColor}; border: 1px solid ${markerColor}55">${user.status}</span>`;
      
      popupContent.innerHTML = `
        <div class="flex justify-between items-start">
          <h4 class="font-bold text-white text-sm leading-tight">${user.name}</h4>
          ${badgeHtml}
        </div>
        <p class="text-[10px] text-slate-400 font-mono">${user.phone}</p>
        <div class="border-t border-slate-800/60 my-1"></div>
        <div class="flex justify-between text-[11px]">
          <span class="text-slate-500 font-semibold">Lang:</span>
          <span class="font-semibold text-slate-300">${user.language}</span>
        </div>
        <div class="flex justify-between text-[11px]">
          <span class="text-slate-500 font-semibold">Channel:</span>
          <span class="font-semibold text-slate-300">${user.channel}</span>
        </div>
        <div class="flex justify-between text-[11px]">
          <span class="text-slate-500 font-semibold">Location:</span>
          <span class="text-slate-300 text-right max-w-[130px] truncate" title="${user.location}">${user.location}</span>
        </div>
        <div class="pt-1.5 flex flex-col gap-1.5">
          ${(user.status === 'Pending' || user.status === 'Delivered' || user.status === 'SMS Fallback' || user.status === 'IVR Dispatch') ? `
            <div class="flex gap-1.5">
              <button class="safe-btn flex-1 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold transition">
                ✔️ Safe
              </button>
              <button class="help-btn flex-1 py-1 rounded bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-[10px] font-bold transition">
                ⚠️ Help
              </button>
            </div>
          ` : ''}
          ${user.status === 'IVR Dispatch' ? `
            <button class="stream-btn w-full py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/35 border border-purple-500/30 text-purple-400 text-[10px] font-bold flex items-center justify-center gap-1 transition">
              📞 Stream Call
            </button>
          ` : ''}
        </div>
      `;

      popupContent.querySelector('.safe-btn')?.addEventListener('click', () => {
        sendQuickFeedback(user.phone, '1');
      });
      popupContent.querySelector('.help-btn')?.addEventListener('click', () => {
        sendQuickFeedback(user.phone, '2');
      });
      popupContent.querySelector('.stream-btn')?.addEventListener('click', () => {
        playIVRVoice(user);
      });

      if (markersRef.current[user.id]) {
        const marker = markersRef.current[user.id];
        marker.setLatLng([user.lat, user.lng]);
        marker.setIcon(customIcon);
        marker.setPopupContent(popupContent);
      } else {
        const marker = L.marker([user.lat, user.lng], { icon: customIcon })
          .addTo(map)
          .bindPopup(popupContent);
        
        marker.on('click', () => {
          setSelectedMapUser(user);
        });

        markersRef.current[user.id] = marker;
      }
    });

  }, [users]);


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
          title: presets[activePreset].title,
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
          <div className="flex flex-wrap gap-2 mb-4 bg-slate-950/60 p-2 rounded-xl border border-slate-900 items-center">
            {presets.map((p, idx) => (
              <button
                key={idx}
                onClick={() => applyPreset(idx)}
                className={`py-1.5 px-3 text-xs font-semibold rounded-lg transition-all ${
                  activePreset === idx 
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                }`}
              >
                {p.name}
              </button>
            ))}
            <button
              onClick={() => setShowAddDisasterModal(true)}
              className="py-1 px-2.5 text-[10px] font-bold rounded-lg transition-all text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 hover:border-rose-500/50"
            >
              + ADD DISASTER
            </button>
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
        <div className="glass-panel rounded-2xl p-5 shadow-2xl relative overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Map className="w-4 h-4 text-rose-500" />
              <h2 className="text-base font-bold tracking-wide text-white">GEOSPATIAL STORM INUNDATION RADAR</h2>
            </div>
            <button
              onClick={locateOperator}
              disabled={isLocating}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center space-x-1 py-1 px-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 transition"
            >
              <span>{isLocating ? 'LOCATING GPS...' : 'LOCATE COMMAND CENTER'}</span>
            </button>
          </div>

          <div className="relative bg-slate-950/80 rounded-xl border border-slate-900 overflow-hidden flex items-center justify-center min-h-[380px]">
            {/* Leaflet map div */}
            <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-10"></div>

            {/* Custom Legend Overlay inside Map Panel */}
            <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-800/80 rounded-lg p-2.5 flex flex-col space-y-1.5 text-[9px] text-slate-400 font-bold z-[1000] backdrop-blur-sm shadow-xl select-none">
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
            
            <div className="absolute top-4 left-4 bg-slate-900/90 border border-slate-850 rounded-lg py-1 px-2.5 text-[10px] text-slate-300 font-mono z-[1000] flex items-center space-x-1 select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
              <span>LIVE INTERACTIVE GPS MAP</span>
            </div>
          </div>

          {/* Map click hint */}
          <div className="mt-2 text-[10px] text-slate-500 italic text-center">
            💡 Pro-Tip: Click anywhere on the map to register a new resident at those exact coordinates.
          </div>
        </div>

        {/* Add User Modal Dialog */}
        {showAddUserModal && clickedCoords && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
            <div className="glass-panel max-w-sm w-full rounded-2xl p-5 shadow-2xl border border-slate-800/80 space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                <h3 className="font-bold text-white text-sm tracking-wide">REGISTER COASTAL RESIDENT</h3>
                <button 
                  onClick={() => { setShowAddUserModal(false); setClickedCoords(null); }}
                  className="text-slate-400 hover:text-white text-[11px] font-semibold px-2 py-1 rounded bg-slate-900 border border-slate-800"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleAddNewUser} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Coordinates</label>
                  <input
                    type="text"
                    readOnly
                    value={`${clickedCoords.lat}, ${clickedCoords.lng}`}
                    className="w-full bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-500 focus:outline-none"
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Resident Name</label>
                  <input
                    type="text"
                    required
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="e.g. Priyanjali Patnaik"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Phone Number</label>
                  <input
                    type="text"
                    required
                    value={newUserPhone}
                    onChange={(e) => setNewUserPhone(e.target.value)}
                    placeholder="e.g. +91XXXXXXXXXX"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Language</label>
                  <select
                    value={newUserLang}
                    onChange={(e) => setNewUserLang(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="Hindi">Hindi</option>
                    <option value="Bengali">Bengali</option>
                    <option value="Tamil">Tamil</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Location Label</label>
                  <input
                    type="text"
                    value={newUserLocName}
                    onChange={(e) => setNewUserLocName(e.target.value)}
                    placeholder="e.g. Puri Shoreline, Odisha"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 mt-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs tracking-wider transition"
                >
                  REGISTER RESIDENT
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Picking location banner */}
        {isPickingLocation && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[2000] bg-rose-600/90 border border-rose-500 rounded-xl py-3 px-6 shadow-2xl backdrop-blur-md flex items-center space-x-3 text-white font-semibold text-xs tracking-wider animate-bounce select-none">
            <span className="h-2.5 w-2.5 rounded-full bg-white animate-ping"></span>
            <span>DISASTER LOCATION PICKER ACTIVE: CLICK ON THE MAP TO SET COORDINATES</span>
            <button 
              onClick={() => setIsPickingLocation(false)}
              className="px-2 py-0.5 rounded bg-black/30 hover:bg-black/50 text-[10px] transition"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Add Preset Disaster Modal */}
        {showAddDisasterModal && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
            <div className="glass-panel max-w-sm w-full rounded-2xl p-5 shadow-2xl border border-slate-800/80 space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                <h3 className="font-bold text-white text-sm tracking-wide">CREATE CUSTOM DISASTER WARNING</h3>
                <button 
                  onClick={() => setShowAddDisasterModal(false)}
                  className="text-slate-400 hover:text-white text-[11px] font-semibold px-2 py-1 rounded bg-slate-900 border border-slate-800"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleAddNewDisaster} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Short Name (for Chip)</label>
                  <input
                    type="text"
                    required
                    value={disasterName}
                    onChange={(e) => setDisasterName(e.target.value)}
                    placeholder="e.g. Cyclone Amphan"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Full Warning Title</label>
                  <input
                    type="text"
                    required
                    value={disasterTitle}
                    onChange={(e) => setDisasterTitle(e.target.value)}
                    placeholder="e.g. Super Cyclone Amphan Warning"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Severity</label>
                  <select
                    value={disasterSeverity}
                    onChange={(e) => setDisasterSeverity(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="WARNING">WARNING</option>
                    <option value="ADVISORY">ADVISORY</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      required
                      value={disasterLat}
                      onChange={(e) => setDisasterLat(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      required
                      value={disasterLng}
                      onChange={(e) => setDisasterLng(e.target.value)}
                      className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsPickingLocation(true);
                    setShowAddDisasterModal(false); // temporary hide modal to let user click on map
                  }}
                  className="w-full py-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold tracking-wider transition"
                >
                  📍 PICK COORDINATES FROM MAP
                </button>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Warning Description</label>
                  <textarea
                    required
                    value={disasterDesc}
                    onChange={(e) => setDisasterDesc(e.target.value)}
                    placeholder="Provide details about the warnings, directions, evacuations..."
                    className="w-full h-20 bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500/60 transition resize-none leading-normal"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 mt-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs tracking-wider transition"
                >
                  CREATE DISASTER PRESET
                </button>
              </form>
            </div>
          </div>
        )}


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
