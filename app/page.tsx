"use client";
import { useState, useRef, useEffect } from "react";
import { SignInButton, Show, UserButton, useUser } from "@clerk/nextjs";

// A simple Spinner component for feedback
const Spinner = () => (
  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
);

export default function Home() {
  const { user, isLoaded } = useUser();
  const [leagueId, setLeagueId] = useState("");
  const [loading, setLoading] = useState(false);
  const [leagueData, setLeagueData] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [loadingUser, setLoadingUser] = useState(false);
  const [userLeagues, setUserLeagues] = useState<any[]>([]);
  
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeMode, setAnalyzeMode] = useState<"fast" | "pro" | null>(null);
  const [chatHistory, setChatHistory] = useState<{ role: string; text: string }[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);

  const rawIsPro = user?.publicMetadata?.isPro;
  const isPro = rawIsPro === true || rawIsPro === "true"; 

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("success") === "true" && user) {
      user.reload();
      window.history.replaceState({}, document.title, "/");
    }
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleFetchUserLeagues = async () => {
    if (!username.trim()) return;
    setLoadingUser(true);
    try {
      const userRes = await fetch(`https://api.sleeper.app/v1/user/${username}`);
      const userData = await userRes.json();
      const leaguesRes = await fetch(`https://api.sleeper.app/v1/user/${userData.user_id}/leagues/nfl/2026`);
      const leaguesData = await leaguesRes.json();
      setUserLeagues(leaguesData);
      setLeagueId(leaguesData[0]?.league_id || "");
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUser(false);
    }
  };

  const handleImport = async (idToLoad = leagueId) => {
    if (!idToLoad) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sleeper?leagueId=${idToLoad}`);
      const data = await res.json();
      setLeagueData(data);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeTrade = async (mode: "fast" | "pro") => {
    if (mode === "pro" && !isPro) {
      setShowPaywall(true);
      return;
    }
    setIsAnalyzing(true);
    setAnalyzeMode(mode);
    
    const prompt = `Analyze this trade involving players: ${selectedItems.join(", ")}. League Type: Dynasty. Year: 2026.`;
    const initialMessage = { role: "user", text: "AI is analyzing your trade assets..." };
    setChatHistory([initialMessage]);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", text: prompt }] }),
      });
      const data = await res.json();
      setChatHistory([{ role: "user", text: `Analyzing trade for ${selectedItems.length} assets...` }, { role: "model", text: data.analysis }]);
    } finally {
      setIsAnalyzing(false);
      setAnalyzeMode(null);
    }
  };

  if (!isLoaded) return null;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 selection:bg-blue-500/30">
      {/* Top Debug Bar - Temporary */}
      <div className="bg-red-950/20 border-b border-red-500/50 p-2 text-center text-[10px] font-mono text-red-400">
        DEBUG: {isPro ? "✅ PRO ACTIVE" : "❌ LOCKED"} | METADATA: {JSON.stringify(user?.publicMetadata)}
      </div>

      <header className="max-w-7xl mx-auto px-6 py-8 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-white font-black text-xl">T</span>
          </div>
          <h1 className="text-2xl font-black tracking-tighter text-white">TRADE<span className="text-blue-500">AI</span></h1>
        </div>
        <div className="flex items-center gap-4">
          {isPro && <span className="text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full uppercase">Pro Member</span>}
          <UserButton />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pb-20 space-y-10">
        {/* Step 1: Search */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem] shadow-2xl">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500 mb-6">01. Initialize Connection</h2>
          <div className="flex gap-3">
            <input 
              value={username} 
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter Sleeper Username" 
              className="flex-1 bg-black/40 border border-white/10 p-4 rounded-2xl focus:border-blue-500/50 transition outline-none" 
            />
            <button onClick={handleFetchUserLeagues} className="bg-blue-600 hover:bg-blue-500 px-10 rounded-2xl font-bold flex items-center gap-2 transition">
              {loadingUser ? <Spinner /> : "Sync"}
            </button>
          </div>
          {userLeagues.length > 0 && (
            <div className="mt-4 flex gap-3 animate-in fade-in slide-in-from-top-2">
              <select onChange={(e) => setLeagueId(e.target.value)} className="flex-1 bg-black/40 border border-white/10 p-4 rounded-2xl">
                {userLeagues.map(l => <option key={l.league_id} value={l.league_id}>{l.name}</option>)}
              </select>
              <button onClick={() => handleImport()} className="bg-white text-black px-12 rounded-2xl font-bold hover:bg-slate-200 transition">
                {loading ? <Spinner /> : "Import League"}
              </button>
            </div>
          )}
        </div>

        {/* Trade Block */}
        {selectedItems.length > 0 && (
          <div className="bg-gradient-to-b from-slate-900/60 to-slate-900/20 backdrop-blur-xl border border-white/10 p-8 rounded-[2.5rem] relative overflow-hidden shadow-2xl">
            {showPaywall && (
              <div className="absolute inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-8 animate-in fade-in">
                <h3 className="text-3xl font-black mb-2">Pro Access Required</h3>
                <p className="text-slate-400 mb-8 text-center max-w-sm">Deep-dive analysis is reserved for Pro members.</p>
                <button onClick={async () => {
                   const res = await fetch("/api/checkout", { method: "POST" });
                   const data = await res.json();
                   if (data.url) window.location.href = data.url;
                }} className="bg-blue-600 px-12 py-4 rounded-2xl font-bold shadow-xl shadow-blue-500/20 hover:scale-105 transition">Upgrade Now $4.99</button>
                <button onClick={() => setShowPaywall(false)} className="mt-4 text-slate-500 text-sm">Close</button>
              </div>
            )}
            
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">02. AI Trade Logic</h2>
              <div className="flex gap-3">
                <button onClick={() => handleAnalyzeTrade("fast")} className="bg-white/5 border border-white/10 px-6 py-2.5 rounded-xl font-bold hover:bg-white/10 transition">
                  {isAnalyzing && analyzeMode === 'fast' ? <Spinner /> : "⚡ Fast Mode"}
                </button>
                <button onClick={() => handleAnalyzeTrade("pro")} className={`px-6 py-2.5 rounded-xl font-bold border transition ${isPro ? 'bg-blue-600 border-blue-400' : 'bg-slate-800 border-transparent text-slate-500'}`}>
                  {isAnalyzing && analyzeMode === 'pro' ? <Spinner /> : "🧠 Pro Analysis"}
                </button>
              </div>
            </div>

            {chatHistory.length > 0 && (
              <div className="bg-black/40 border border-white/5 p-6 rounded-3xl space-y-4 max-h-[400px] overflow-y-auto">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`p-4 rounded-2xl ${msg.role === 'model' ? 'bg-blue-500/5 border border-blue-500/20' : 'bg-white/5 border border-white/5 italic text-slate-400'}`}>
                    <div className="text-[10px] font-black uppercase text-blue-500 mb-1">{msg.role === 'model' ? 'AI Agent' : 'User Request'}</div>
                    <div className="text-sm leading-relaxed">{msg.text}</div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>
        )}

        {/* League Grid */}
        {leagueData && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {leagueData.rosters.map((roster: any) => (
              <div key={roster.roster_id} className="bg-slate-900/20 border border-white/5 p-6 rounded-3xl h-[400px] overflow-y-auto hover:border-white/10 transition group">
                <h3 className="text-[10px] font-black text-slate-600 uppercase mb-4 sticky top-0 bg-[#020617]/80 backdrop-blur py-1">
                  Team {roster.roster_id}
                </h3>
                {roster.players?.map((id: string) => {
                  const p = leagueData.players[id];
                  const active = selectedItems.includes(id);
                  return (
                    <div 
                      key={id} 
                      onClick={() => setSelectedItems(prev => active ? prev.filter(x => x !== id) : [...prev, id])}
                      className={`p-3 mb-2 rounded-xl cursor-pointer transition flex justify-between items-center text-xs border ${active ? 'bg-blue-600 border-blue-400 font-bold' : 'bg-black/20 border-transparent hover:border-white/10 text-slate-400'}`}
                    >
                      <span>{p?.first_name} {p?.last_name}</span>
                      <span className="opacity-30 uppercase font-black">{p?.position}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}