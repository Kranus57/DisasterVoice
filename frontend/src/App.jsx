import React from 'react';
import Dashboard from './components/Dashboard.jsx';

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Global Command Header */}
      <header className="border-b border-slate-900/60 bg-slate-950/70 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-rose-500/10 rounded-lg border border-rose-500/20 text-rose-500 text-lg">
              📢
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center">
                Disaster<span className="text-rose-500">Voice</span>
                <span className="ml-2.5 px-2 py-0.5 text-[10px] tracking-widest uppercase font-semibold bg-rose-500/15 text-rose-400 rounded-full border border-rose-500/30">
                  MVP AGENT
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">AI Multilingual Crisis Translation & Multi-Channel Broadcast Console</p>
            </div>
          </div>
          <div className="flex items-center space-x-6">
            <div className="hidden md:flex items-center space-x-4 text-xs text-slate-400">
              <div>
                <span className="text-slate-500">Node JS Port:</span> <span className="font-mono text-rose-400 font-medium">5000</span>
              </div>
              <div className="h-3 w-[1px] bg-slate-800"></div>
              <div>
                <span className="text-slate-500">Vite Dev:</span> <span className="font-mono text-indigo-400 font-medium">5173</span>
              </div>
            </div>
            <div className="flex items-center space-x-2 bg-emerald-500/5 px-2.5 py-1 rounded-md border border-emerald-500/15">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-semibold text-emerald-400 tracking-wider">LIVE NODE CONNECTED</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 flex flex-col justify-start">
        <Dashboard />
      </main>

      {/* Global Footer */}
      <footer className="border-t border-slate-900/60 bg-slate-950/20 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between">
          <p>© 2026 DisasterVoice India. Expert Full-Stack Disaster Response Platform.</p>
          <p className="mt-1 sm:mt-0 font-mono text-[10px] text-slate-600">Latencies calculated in real-time. Twilio & LLM channels simulated if keys absent.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
