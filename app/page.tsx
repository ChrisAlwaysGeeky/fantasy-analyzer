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

  // --- REPAIRED PRO CHECK ---
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
    
    // FIX: Passing context so AI actually has something to look at!
    const prompt = `Analyze this trade: ${selectedItems.join(", ")}. Mode: ${mode}`;
    const initialMessage = { role: "user", text: prompt };
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
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8">
      {/* DEBUG BOX - We need this to see why Pro is locked! */}
      <div className="max-w-7xl mx-auto mb-6 bg-red-900/30 border border-red-500 p-4 rounded-xl text-xs font-mono">
        <p className="text-red-400 font-bold mb-1">🔍 CONNECTION DEBUGGER</p>
        <p>Metadata in Browser: {JSON.stringify(user?.publicMetadata)}</p>
        <p>IsPro Logic: {isPro ? "✅ ACTIVE" : "❌ LOCKED"}</p>
      </div>

      <header className="max-w-7xl mx-auto flex justify-between items-center mb-12">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-black italic tracking-tighter text-white">TRADE<span className="text-blue-500">AI</span></h1>
          {isPro && <span className="bg-purple-600 text-[10px] px-3 py-1 rounded-full font-bold">PRO</span>}
        </div>
        <div className="flex items-center gap-4">
          <Show when="signed-out"><SignInButton mode="modal" /></Show>
          <Show when="signed-in"><UserButton /></Show>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-8">
        {/* Import Box */}
        <section className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-2xl">
          <h2 className="text-lg font-bold mb-4">1. Sync League</h2>
          <div className="flex flex-col md:flex-row gap-3">
            <input 
              type="text" 
              placeholder="Sleeper Username" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              className="flex-1 bg-slate-950 border border-slate-800 p-4 rounded-2xl focus:ring-2 focus:ring-blue-500 transition outline-none" 
            />
            <button onClick={handleFetchUserLeagues} className="bg-blue-600 hover:bg-blue-500 px-10 py-4 rounded-2xl font-bold transition">Find</button>
          </div>
          {userLeagues.length > 0 && (
            <div className="mt-4 flex flex-col md:flex-row gap-3 animate-in fade-in slide-in-from-top-4">
              <select onChange={(e) => setLeagueId(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 p-4 rounded-2xl">
                {userLeagues.map(l => <option key={l.league_id} value={l.league_id}>{l.name}</option>)}
              </select>
              <button onClick={() => handleImport()} className="bg-white text-black px-12 py-4 rounded-2xl font-bold hover:bg-slate-200 transition">Import</button>
            </div>
          )}
        </section>

        {/* Trade Analysis Area */}
        {selectedItems.length > 0 && (
          <section className="bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden shadow-2xl">
            {showPaywall && (
              <div className="absolute inset-0 bg-slate-950/98 z-50 flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
                <span className="text-5xl mb-4">💎</span>
                <h3 className="text-2xl font-black mb-2">Upgrade Required</h3>
                <p className="text-slate-400 mb-8 max-w-sm">Pro analysis includes multi-year trajectory and deep-dive asset values.</p>
                <button onClick={handleUpgrade} className="bg-purple-600 w-full max-w-xs py-4 rounded-2xl font-bold text-lg mb-4 hover:scale-105 transition shadow-lg shadow-purple-500/20">Unlock Pro $4.99</button>
                <button onClick={() => setShowPaywall(false)} className="text-slate-500 underline text-sm">Cancel</button>
              </div>
            )}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold">2. Analyze Trade</h2>
              <div className="flex gap-2">
                <button onClick={() => handleAnalyzeTrade("fast")} className="bg-slate-800 px-6 py-2 rounded-xl border border-slate-700 font-bold hover:bg-slate-700 transition">⚡ Fast</button>
                <button onClick={() => handleAnalyzeTrade("pro")} className={`px-6 py-2 rounded-xl font-bold border transition ${isPro ? 'bg-purple-600 border-purple-400' : 'bg-slate-800 text-slate-500 border-transparent cursor-not-allowed'}`}>🧠 Pro {isPro ? '' : '🔒'}</button>
              </div>
            </div>

            {chatHistory.length > 0 && (
              <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl max-h-96 overflow-y-auto space-y-4">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`p-4 rounded-xl ${msg.role === 'model' ? 'bg-slate-900 border border-slate-800' : 'bg-blue-900/10 text-blue-400 border border-blue-900/20'}`}>
                    <p className="text-xs font-black uppercase tracking-widest opacity-30 mb-2">{msg.role === 'model' ? 'AI Analyst' : 'Context'}</p>
                    <div className="whitespace-pre-wrap text-sm">{msg.text}</div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </section>
        )}

        {/* The Rosters Grid */}
        {leagueData && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {leagueData.rosters.map((roster: any) => (
              <div key={roster.roster_id} className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl h-96 overflow-y-auto">
                <h3 className="text-[10px] font-black text-slate-500 uppercase mb-4 border-b border-slate-800 pb-2 truncate">
                  {getTeamNameByRosterId(roster.roster_id)}
                </h3>
                {roster.players?.map((id: string) => {
                  const p = leagueData.players[id];
                  const isSelected = selectedItems.includes(id);
                  return (
                    <div 
                      key={id} 
                      onClick={() => toggleItem(id)} 
                      className={`p-3 mb-1.5 rounded-xl cursor-pointer transition flex justify-between items-center text-xs border ${isSelected ? 'bg-blue-600 border-blue-400 font-bold text-white' : 'bg-slate-950 border-transparent hover:border-slate-800 text-slate-400'}`}
                    >
                      <span className="truncate mr-2">{p?.first_name} {p?.last_name}</span>
                      <span className="opacity-40">{p?.position}</span>
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