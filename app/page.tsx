"use client";
import { useState, useRef, useEffect } from "react";
import { SignInButton, Show, UserButton, useUser } from "@clerk/nextjs";

export default function Home() {
  const { user, isLoaded } = useUser();
  const [leagueId, setLeagueId] = useState("");
  const [loading, setLoading] = useState(false);
  const [leagueData, setLeagueData] = useState<any>(null);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [loadingUser, setLoadingUser] = useState(false);
  const [userLeagues, setUserLeagues] = useState<any[]>([]);
  const [usernameError, setUsernameError] = useState("");

  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeMode, setAnalyzeMode] = useState<"fast" | "pro" | null>(null);
  const [chatHistory, setChatHistory] = useState<{ role: string; text: string }[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);

  // --- ROBUST PRO CHECK ---
  // This looks at the metadata we saw in your screenshot
  const rawIsPro = user?.publicMetadata?.isPro;
  const isPro = rawIsPro === true || rawIsPro === "true"; 

  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- AUTOMATIC PROFILE REFRESH ---
  // If we detect a success URL, tell Clerk to re-fetch data from the server
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("success") === "true" && user) {
      console.log("Payment detected, forcing profile reload...");
      user.reload();
      // Clean up the URL so it doesn't keep reloading
      window.history.replaceState({}, document.title, "/");
    }
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleFetchUserLeagues = async () => {
    if (!username.trim()) return;
    setLoadingUser(true);
    setUsernameError("");
    try {
      const userRes = await fetch(`https://api.sleeper.app/v1/user/${username}`);
      const userData = await userRes.json();
      if (!userData?.user_id) throw new Error("Username not found");
      const leaguesRes = await fetch(`https://api.sleeper.app/v1/user/${userData.user_id}/leagues/nfl/2026`);
      const leaguesData = await leaguesRes.json();
      setUserLeagues(leaguesData);
      setLeagueId(leaguesData[0]?.league_id || "");
    } catch (err: any) {
      setUsernameError(err.message);
    } finally {
      setLoadingUser(false);
    }
  };

  const handleImport = async (idToLoad = leagueId) => {
    if (!idToLoad) return;
    setLoading(true);
    setError("");
    setSelectedItems([]);
    setChatHistory([]);
    try {
      const res = await fetch(`/api/sleeper?leagueId=${idToLoad}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLeagueData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const getTeamNameByRosterId = (rosterId: number) => {
    const roster = leagueData?.rosters.find((r: any) => r.roster_id === rosterId);
    if (!roster) return "Unknown";
    const owner = leagueData?.users.find((u: any) => u.user_id === roster.owner_id);
    return owner?.metadata?.team_name || owner?.display_name || "Unknown Manager";
  };

  const handleAnalyzeTrade = async (mode: "fast" | "pro") => {
    if (mode === "pro" && !isPro) {
      setShowPaywall(true);
      return;
    }
    setIsAnalyzing(true);
    setAnalyzeMode(mode);
    const initialMessage = { role: "user", text: `Analyze this trade in ${mode} mode.` };
    setChatHistory([initialMessage]);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [initialMessage] }),
      });
      const data = await res.json();
      setChatHistory([initialMessage, { role: "model", text: data.analysis }]);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
      setAnalyzeMode(null);
    }
  };

  const handleUpgrade = async () => {
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      alert("Checkout error: " + err.message);
    }
  };

  if (!isLoaded) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-6">
      {/* --- DEBUG BOX (Remove this after it works!) --- */}
      <div className="max-w-6xl mx-auto mb-4 bg-red-900/20 border border-red-500/50 p-3 rounded text-[10px] font-mono">
        <p className="text-red-400 font-bold mb-1">🔍 CONNECTION DEBUGGER</p>
        <p>Metadata in Browser: {JSON.stringify(user?.publicMetadata)}</p>
        <p>IsPro Logic: {isPro ? "✅ ACTIVE" : "❌ LOCKED"}</p>
      </div>

      <header className="max-w-6xl mx-auto flex justify-between items-center mb-10 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black text-white italic tracking-tighter">TRADE<span className="text-blue-500">AI</span></h1>
          {isPro && (
            <span className="bg-gradient-to-r from-purple-600 to-blue-600 text-[10px] px-3 py-1 rounded-full text-white font-black uppercase tracking-widest shadow-lg shadow-purple-500/20">
              PRO MEMBER
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Show when="signed-out"><SignInButton mode="modal" /></Show>
          <Show when="signed-in"><UserButton /></Show>
        </div>
      </header>

      <main className="max-w-6xl mx-auto">
        {/* Step 1: Sync */}
        <div className="bg-slate-900/50 p-8 rounded-2xl border border-slate-800 mb-8 shadow-xl">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="bg-blue-500 w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
            Sync Sleeper League
          </h2>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Sleeper Username" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              className="flex-1 bg-slate-950 border border-slate-700 p-4 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition" 
            />
            <button onClick={handleFetchUserLeagues} className="bg-blue-600 hover:bg-blue-500 px-8 rounded-xl font-bold transition">Find</button>
          </div>
          {userLeagues.length > 0 && (
            <div className="mt-4 flex gap-2 animate-in fade-in slide-in-from-top-2">
              <select onChange={(e) => setLeagueId(e.target.value)} className="flex-1 bg-slate-950 border border-slate-700 p-4 rounded-xl">
                {userLeagues.map(l => <option key={l.league_id} value={l.league_id}>{l.name}</option>)}
              </select>
              <button onClick={() => handleImport()} className="bg-white text-black px-10 rounded-xl font-bold hover:bg-slate-200 transition">Import</button>
            </div>
          )}
        </div>

        {/* Step 2: Analysis & Paywall */}
        {selectedItems.length > 0 && (
          <div className="bg-slate-900/50 p-8 rounded-2xl border border-slate-800 mb-8 relative overflow-hidden shadow-xl">
            {showPaywall && (
              <div className="absolute inset-0 bg-slate-950/98 z-50 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm animate-in fade-in">
                <div className="w-20 h-20 bg-purple-600/20 rounded-full flex items-center justify-center mb-6 border border-purple-500/30">
                  <span className="text-4xl">💎</span>
                </div>
                <h3 className="text-3xl font-black text-white mb-3">Upgrade to Pro</h3>
                <p className="text-slate-400 mb-8 max-w-sm leading-relaxed">
                  Unlock advanced asset trajectory, deep-dive draft capital hits, and 2026-2027 dynasty value projections.
                </p>
                <button 
                  onClick={handleUpgrade} 
                  className="bg-gradient-to-r from-purple-600 to-blue-600 w-full max-w-xs py-4 rounded-2xl font-black text-lg shadow-[0_0_30px_rgba(147,51,234,0.3)] hover:scale-105 transition transform mb-4"
                >
                  UNLOCK PRO $4.99/mo
                </button>
                <button onClick={() => setShowPaywall(false)} className="text-slate-500 hover:text-white transition font-medium">Continue with Basic</button>
              </div>
            )}

            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <span className="bg-blue-500 w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                AI Trade Evaluation
              </h2>
              <div className="flex gap-3">
                <button onClick={() => handleAnalyzeTrade("fast")} className="bg-slate-800 hover:bg-slate-700 px-6 py-2.5 rounded-xl font-bold border border-slate-700 transition">⚡ Fast</button>
                <button 
                  onClick={() => handleAnalyzeTrade("pro")} 
                  className={`px-6 py-2.5 rounded-xl font-bold border transition flex items-center gap-2 ${isPro ? 'bg-purple-600 border-purple-400 shadow-lg shadow-purple-500/20' : 'bg-slate-700 text-slate-400 border-transparent'}`}
                >
                  🧠 Pro {isPro ? 'Unlocked' : '🔒'}
                </button>
              </div>
            </div>

            {chatHistory.length > 0 && (
              <div className="space-y-4 max-h-[500px] overflow-y-auto p-6 bg-slate-950 rounded-2xl border border-slate-800 shadow-inner">
                {chatHistory.map((msg, i) => i > 0 && (
                  <div key={i} className={`p-5 rounded-2xl leading-relaxed ${msg.role === 'model' ? 'bg-slate-900/80 border border-slate-800 text-slate-200' : 'bg-blue-900/10 text-blue-300 border border-blue-900/30 italic'}`}>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 mb-2">{msg.role === 'model' ? 'AI Analysis Report' : 'User Query'}</div>
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>
        )}

        {/* Rosters Section */}
        {leagueData && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {leagueData.rosters.map((roster: any) => (
              <div key={roster.roster_id} className="bg-slate-900/30 p-6 rounded-2xl border border-slate-800 h-[450px] overflow-y-auto hover:border-slate-700 transition group shadow-lg">
                <h3 className="text-[10px] font-black text-slate-500 uppercase mb-4 sticky top-0 bg-slate-950/50 backdrop-blur-md py-2 border-b border-slate-800 group-hover:text-blue-400 transition">
                  {getTeamNameByRosterId(roster.roster_id)}
                </h3>
                {roster.players?.map((id: string) => {
                  const p = leagueData.players[id];
                  const sel = selectedItems.includes(id);
                  return (
                    <div 
                      key={id} 
                      onClick={() => toggleItem(id)} 
                      className={`p-3.5 mb-2 rounded-xl cursor-pointer transition-all border flex justify-between items-center group/item ${sel ? 'bg-blue-600 border-blue-400 text-white font-bold shadow-lg shadow-blue-500/20' : 'bg-slate-950/50 border-transparent hover:border-slate-600 text-slate-400'}`}
                    >
                      <span className="truncate mr-2">{p?.first_name} {p?.last_name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${sel ? 'bg-blue-400 text-white' : 'bg-slate-800 text-slate-500'}`}>{p?.position}</span>
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