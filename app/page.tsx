"use client";
import { useState, useRef, useEffect } from "react";
import { SignInButton, Show, UserButton, useUser } from "@clerk/nextjs";

export default function Home() {
  const { user } = useUser();
  const [leagueId, setLeagueId] = useState("");
  const [loading, setLoading] = useState(false);
  const [leagueData, setLeagueData] = useState<any>(null);
  const [error, setError] = useState("");
  const [savedLeagues, setSavedLeagues] = useState<{ id: string; name: string }[]>([]);

  const [username, setUsername] = useState("");
  const [loadingUser, setLoadingUser] = useState(false);
  const [userLeagues, setUserLeagues] = useState<any[]>([]);
  const [usernameError, setUsernameError] = useState("");

  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeMode, setAnalyzeMode] = useState<"fast" | "pro" | null>(null);
  const [chatHistory, setChatHistory] = useState<{ role: string; text: string }[]>([]);
  const [followUp, setFollowUp] = useState("");
  const [analyzeError, setAnalyzeError] = useState("");
  const [copied, setCopied] = useState(false);

  const [showPaywall, setShowPaywall] = useState(false);
  
  const isPro = user?.publicMetadata?.isPro === true || user?.publicMetadata?.isPro === "true";

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("savedSleeperLeagues");
    if (saved) {
      setSavedLeagues(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleFetchUserLeagues = async () => {
    if (!username.trim()) return;
    setLoadingUser(true);
    setUsernameError("");
    setUserLeagues([]);
    try {
      const userRes = await fetch(`https://api.sleeper.app/v1/user/${username}`);
      if (!userRes.ok) throw new Error("Sleeper username not found.");
      const userData = await userRes.json();
      if (!userData?.user_id) throw new Error("Sleeper username not found.");

      const leaguesRes = await fetch(`https://api.sleeper.app/v1/user/${userData.user_id}/leagues/nfl/2026`);
      if (!leaguesRes.ok) throw new Error("Could not fetch leagues.");
      const leaguesData = await leaguesRes.json();

      if (!leaguesData || leaguesData.length === 0) {
        throw new Error("No 2026 leagues found for this user.");
      }

      setUserLeagues(leaguesData);
      setLeagueId(leaguesData[0].league_id); 
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
      setLeagueId(idToLoad); 
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLeague = () => {
    if (!leagueData?.leagueInfo) return;
    const newLeague = { id: leagueId, name: leagueData.leagueInfo.name };
    const updatedLeagues = [newLeague, ...savedLeagues.filter((l) => l.id !== leagueId)];
    
    setSavedLeagues(updatedLeagues);
    localStorage.setItem("savedSleeperLeagues", JSON.stringify(updatedLeagues));
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

  const getTradeSides = () => {
    if (!leagueData) return {};
    const sides: Record<string, string[]> = {};
    selectedItems.forEach((itemId) => {
      const roster = leagueData.rosters.find(
        (r: any) => r.players?.includes(itemId) || r.draft_picks?.some((p: any) => p.id === itemId)
      );
      if (roster) {
        const teamName = getTeamNameByRosterId(roster.roster_id);
        if (!sides[teamName]) sides[teamName] = [];
        sides[teamName].push(itemId);
      }
    });
    return sides;
  };

  const tradeSides = getTradeSides();
  const teamsInvolved = Object.keys(tradeSides);

  const getFullRosterContext = (teamName: string) => {
    let rosterText = "";
    const roster = leagueData.rosters.find((r: any) => getTeamNameByRosterId(r.roster_id) === teamName);
    if (!roster) return "";

    const allTime = roster.all_time || { wins: 0, losses: 0, fpts: 0, years: 1 };
    rosterText += `All-Time Franchise History (${allTime.years} seasons): ${allTime.wins} Wins, ${allTime.losses} Losses, ${allTime.fpts} Total Points\n`;

    rosterText += "Players: ";
    roster.players?.forEach((id: string) => {
      const p = leagueData.players[id];
      if (p) rosterText += `${p.first_name} ${p.last_name} (${p.position}), `;
    });

    if (roster.draft_picks?.length > 0) {
      rosterText += "\nDraft Picks: ";
      roster.draft_picks.forEach((pick: any) => {
        rosterText += `${pick.year} Round ${pick.round}, `;
      });
    }
    return rosterText;
  };

  const handleAnalyzeTrade = async (mode: "fast" | "pro") => {
    if (mode === "pro" && !isPro) {
      setShowPaywall(true);
      return; 
    }

    setIsAnalyzing(true);
    setAnalyzeMode(mode);
    setAnalyzeError("");

    const isSuperflex = leagueData.leagueInfo.roster_positions?.includes("SUPER_FLEX");
    const ppr = leagueData.leagueInfo.scoring_settings?.rec || 0;
    const tep = leagueData.leagueInfo.scoring_settings?.bonus_rec_te || 0;
    const isDynasty = leagueData.leagueInfo.settings?.type === 2;

    let prompt = `Act as an expert fantasy football analyst. It is currently March 2026. Evaluate players based on their current 2026 status.\n\n`;
    prompt += `CRITICAL INSTRUCTION: This is a FAST-tier request. Provide a concise, snappy, and fast-paced analysis hitting the main points of the trade without excessive fluff.\n\n`;
    prompt += `CRITICAL INSTRUCTIONS FOR NUMERICAL SCORING:\n`;
    prompt += `1. You MUST assign a concrete "Trade Value Score" (using arbitrary value points, e.g., 5500 vs 5200) to both sides of the proposed trade to mathematically show how close the trade is.\n`;
    prompt += `2. You MUST calculate a "Team Power Rating" (on a scale of 0 to 100) ONLY for the specific teams involved in the trade.\n\n`;
    prompt += `League Rules: ${isSuperflex ? "Superflex" : "1QB"}, ${ppr} PPR, ${tep} TE Premium. Type: ${isDynasty ? "Dynasty" : "Redraft/Keeper"}\n\n`;

    prompt += `--- PROPOSED TRADE ---\n`;
    teamsInvolved.forEach((team) => {
      prompt += `**${team}** receives what the other team is sending, and is sending away:\n`;
      tradeSides[team].forEach((id) => {
        if (id.startsWith("pick_")) {
          const [_, year, round] = id.split("_");
          prompt += `- ${year} Round ${round} Draft Pick\n`;
        } else {
          const p = leagueData.players[id];
          if (p) prompt += `- ${p.first_name} ${p.last_name} (${p.position}, ${p.team})\n`;
        }
      });
      prompt += "\n";
    });

    prompt += `--- ENTIRE LEAGUE ROSTER CONTEXT ---\n`;
    leagueData.rosters.forEach((roster: any) => {
        const teamName = getTeamNameByRosterId(roster.roster_id);
        prompt += `**${teamName}:**\n${getFullRosterContext(teamName)}\n\n`;
    });

    prompt += `Analyze this trade mathematically and contextually. Who wins the trade, what are the numerical values, and what are the Power Ratings for just the teams involved?`;

    const initialMessage = { role: "user", text: prompt };
    setChatHistory([initialMessage]);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [initialMessage] }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setChatHistory([initialMessage, { role: "model", text: data.analysis }]);
    } catch (err: any) {
      setAnalyzeError(err.message);
    } finally {
      setIsAnalyzing(false);
      setAnalyzeMode(null);
    }
  };

  const handleFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUp.trim() || isAnalyzing) return;

    const userMessage = { role: "user", text: followUp };
    const updatedHistory = [...chatHistory, userMessage];

    setChatHistory(updatedHistory);
    setFollowUp("");
    setIsAnalyzing(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedHistory }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setChatHistory([...updatedHistory, { role: "model", text: data.analysis }]);
    } catch (err: any) {
      setAnalyzeError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleShare = () => {
    let shareText = "🤖 AI Trade Analysis:\n\n";
    chatHistory.forEach((msg, idx) => {
      if (idx === 0) return; 
      if (msg.role === "user") {
        shareText += `You: ${msg.text}\n\n`;
      } else {
        shareText += `AI: ${msg.text}\n\n`;
      }
    });

    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000); 
  };

  // --- UPDATED: SMARTER STRIPE CHECKOUT HANDLER ---
  const handleUpgrade = async () => {
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await res.json();
      
      // If the backend threw an error, catch it here!
      if (!res.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      if (data.url) {
        window.location.href = data.url; // Send the user to the Stripe Checkout page!
      }
    } catch (err: any) {
      console.error("Failed to load checkout:", err.message);
      alert("Checkout Error: " + err.message); // Show the real error on screen!
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-purple-500/30 font-sans flex flex-col">
      
      {/* --- MODERN HEADER --- */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-black text-xl shadow-[0_0_15px_rgba(147,51,234,0.4)]">
              A
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              TradeAnalyzer AI
            </span>
          </div>
          
          <nav className="flex items-center gap-4 text-sm font-medium">
            <button className="text-slate-400 hover:text-white transition hidden md:block">Features</button>
            <button className="text-slate-400 hover:text-white transition hidden md:block">Pricing</button>
            
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-full transition border border-slate-700">
                  Sign In
                </button>
              </SignInButton>
            </Show>
            
            <Show when="signed-in">
              <UserButton appearance={{ elements: { userButtonAvatarBox: "w-9 h-9" } }} />
            </Show>
          </nav>
        </div>
      </header>

      {/* --- MAIN APP CONTENT --- */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 lg:p-8">
        
        {/* Welcome Hero */}
        {!leagueData && (
          <div className="text-center max-w-2xl mx-auto mt-12 mb-16 animate-fade-in">
            <h1 className="text-5xl font-black text-white mb-6 tracking-tight leading-tight">
              Dominate Your Dynasty League with <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">Omniscient AI.</span>
            </h1>
            <p className="text-lg text-slate-400 mb-8">
              Import your Sleeper league. Stage any trade. Let our 2026-aware AI analyze rosters, draft capital, and historical performance to crown a winner.
            </p>
          </div>
        )}

        {/* --- REBUILT IMPORT SECTION --- */}
        <div className="bg-slate-900/40 backdrop-blur-xl p-6 md:p-8 rounded-2xl shadow-xl mb-10 border border-slate-800/60 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none -z-10"></div>
          
          <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-md">1</span> 
              Load Your League
            </h2>
            {leagueData && !savedLeagues.some((l) => l.id === leagueId) && (
              <button
                onClick={handleSaveLeague}
                className="text-xs bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/20 px-3 py-1.5 rounded-full font-bold transition flex items-center gap-1"
              >
                ⭐ Save Current League
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-slate-950/50 p-5 rounded-xl border border-slate-800/80">
              <h3 className="font-bold text-slate-300 mb-3 text-xs uppercase tracking-wider flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                Search by Username
              </h3>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="e.g. SleeperUsername"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchUserLeagues()}
                  className="flex-1 bg-slate-900 p-3 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 text-sm transition"
                />
                <button
                  onClick={handleFetchUserLeagues}
                  disabled={loadingUser || !username}
                  className="bg-blue-600 hover:bg-blue-500 px-5 py-3 rounded-lg text-sm font-bold transition disabled:opacity-50 shadow-md"
                >
                  {loadingUser ? "..." : "Find"}
                </button>
              </div>
              {usernameError && <p className="text-red-400 mt-1 text-xs">{usernameError}</p>}

              {userLeagues.length > 0 && (
                <div className="mt-5 flex flex-col gap-2 animate-fade-in border-t border-slate-800 pt-5">
                  <label className="text-xs text-slate-400 font-medium">Select a 2026 League:</label>
                  <select
                    onChange={(e) => setLeagueId(e.target.value)}
                    value={leagueId}
                    className="w-full bg-slate-900 p-3 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 text-sm text-slate-200"
                  >
                    {userLeagues.map((league) => (
                      <option key={league.league_id} value={league.league_id}>
                        {league.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleImport(leagueId)}
                    disabled={loading}
                    className="w-full bg-slate-200 hover:bg-white text-slate-900 py-3 rounded-lg text-sm font-bold transition disabled:opacity-50 mt-2 shadow-sm"
                  >
                    {loading ? "Syncing Roster Data..." : "Import Selected League"}
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              {savedLeagues.length > 0 && (
                <div className="bg-slate-950/50 p-5 rounded-xl border border-slate-800/80">
                  <h3 className="font-bold text-slate-300 mb-3 text-xs uppercase tracking-wider">Saved Leagues</h3>
                  <div className="flex gap-2">
                    <select
                      onChange={(e) => setLeagueId(e.target.value)}
                      value={leagueId}
                      className="flex-1 bg-slate-900 p-3 rounded-lg border border-slate-700 focus:outline-none text-sm text-slate-200"
                    >
                      <option value="" disabled>Select...</option>
                      {savedLeagues.map((league) => (
                        <option key={league.id} value={league.id}>
                          {league.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleImport(leagueId)}
                      disabled={loading || !leagueId}
                      className="bg-slate-700 hover:bg-slate-600 px-5 py-3 rounded-lg text-sm font-bold transition disabled:opacity-50"
                    >
                      Load
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-slate-950/50 p-5 rounded-xl border border-slate-800/80">
                <h3 className="font-bold text-slate-300 mb-3 text-xs uppercase tracking-wider">Manual League ID</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="18-digit ID"
                    value={leagueId}
                    onChange={(e) => setLeagueId(e.target.value)}
                    className="flex-1 bg-slate-900 p-3 rounded-lg border border-slate-700 focus:outline-none text-sm"
                  />
                  <button
                    onClick={() => handleImport(leagueId)}
                    disabled={loading || !leagueId}
                    className="bg-slate-700 hover:bg-slate-600 px-5 py-3 rounded-lg text-sm font-bold transition disabled:opacity-50"
                  >
                    Import
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {error && <div className="mt-6 p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400 text-center font-medium">{error}</div>}
        </div>

        {/* --- TRADE BLOCK --- */}
        {selectedItems.length > 0 && (
          <div className="bg-slate-900/60 backdrop-blur-xl p-6 md:p-8 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.3)] mb-10 border border-slate-700/50 sticky top-20 z-10 flex flex-col max-h-[80vh]">
            <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center mb-6 border-b border-slate-800 pb-4 gap-4 shrink-0">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded-md">2</span> 
                Trade Block Staging
              </h2>
              
              <div className="flex flex-wrap gap-3">
                {chatHistory.length > 0 && (
                  <>
                    <button onClick={handleShare} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition border border-slate-700 flex items-center gap-2">
                      {copied ? "✅ Copied" : "🔗 Share Analysis"}
                    </button>
                    <button onClick={() => setChatHistory([])} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-2 rounded-lg text-sm font-medium transition">
                      ✕ Close
                    </button>
                  </>
                )}
                
                {chatHistory.length === 0 && (
                  <>
                    <button onClick={() => { setSelectedItems([]); setChatHistory([]); }} className="text-slate-400 hover:text-white px-3 py-2 text-sm font-medium transition">
                      Clear Trade
                    </button>

                    <Show when="signed-out">
                      <SignInButton mode="modal">
                        <button className="bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-lg text-white font-bold transition flex items-center gap-2 shadow-sm">
                          🔒 Sign in to Analyze
                        </button>
                      </SignInButton>
                    </Show>

                    <Show when="signed-in">
                      <button
                        onClick={() => handleAnalyzeTrade("fast")}
                        disabled={teamsInvolved.length < 2 || isAnalyzing}
                        className="bg-slate-200 hover:bg-white text-slate-900 disabled:bg-slate-800 disabled:text-slate-500 px-5 py-2 rounded-lg font-bold transition flex items-center gap-2 shadow-sm"
                      >
                        {isAnalyzing && analyzeMode === "fast" ? "Analyzing..." : "⚡ Fast Analysis"}
                      </button>

                      <button
                        onClick={() => handleAnalyzeTrade("pro")}
                        disabled={teamsInvolved.length < 2 || isAnalyzing}
                        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 px-5 py-2 rounded-lg font-bold transition flex items-center gap-2 shadow-[0_0_15px_rgba(147,51,234,0.3)] text-white relative overflow-hidden group"
                      >
                        <span className="absolute inset-0 w-full h-full bg-white/20 group-hover:translate-x-full transition-transform duration-500 -translate-x-full skew-x-12"></span>
                        <span>🧠 Pro Deep Dive</span>
                        <svg className="w-4 h-4 ml-1 opacity-70" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"></path></svg>
                      </button>
                    </Show>
                  </>
                )}
              </div>
            </div>

            {/* --- THE STRIPE PAYWALL BUTTON --- */}
            {showPaywall && (
              <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-sm rounded-2xl flex items-center justify-center p-6 animate-fade-in">
                <div className="bg-slate-900 border border-purple-500/50 rounded-2xl p-8 max-w-md w-full text-center shadow-[0_0_50px_rgba(147,51,234,0.15)]">
                  <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-purple-500/50">
                    <span className="text-3xl">💎</span>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">Unlock Pro Analysis</h3>
                  <p className="text-slate-400 mb-6 text-sm leading-relaxed">
                    Get highly granular, multi-paragraph breakdowns analyzing 3-year asset trajectories, draft capital hit rates, and deep roster implications.
                  </p>
                  
                  {/* Wired up button! */}
                  <button 
                    onClick={handleUpgrade}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 text-white font-bold py-3 rounded-lg mb-3 transition shadow-lg"
                  >
                    Upgrade to Pro - $4.99/mo
                  </button>
                  
                  <button onClick={() => setShowPaywall(false)} className="text-slate-400 hover:text-white text-sm font-medium transition">
                    Maybe Later
                  </button>
                </div>
              </div>
            )}

            {chatHistory.length === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">
                {teamsInvolved.map((teamName) => (
                  <div key={teamName} className="bg-slate-950/50 p-5 rounded-xl border border-slate-800">
                    <h3 className="text-sm font-bold text-slate-300 mb-4 border-b border-slate-800 pb-2">
                      <span className="text-blue-400">{teamName}</span> receives:
                    </h3>
                    <div className="space-y-2">
                      {tradeSides[teamName].map((itemId) => {
                        if (itemId.startsWith("pick_")) {
                          const [_, year, round] = itemId.split("_");
                          return (
                            <div key={itemId} className="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800 shadow-sm">
                              <span className="font-medium text-sm text-slate-200">{year} Round {round} Pick</span>
                              <span className="text-[10px] font-black px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 tracking-wide">PICK</span>
                            </div>
                          );
                        } else {
                          const player = leagueData.players[itemId];
                          return (
                            <div key={itemId} className="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800 shadow-sm">
                              <div className="flex flex-col">
                                <span className="font-bold text-sm text-slate-200">{player?.first_name} {player?.last_name}</span>
                                <span className="text-xs text-slate-500">{player?.team}</span>
                              </div>
                              <span className="text-[10px] font-black px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 tracking-wide">{player?.position}</span>
                            </div>
                          );
                        }
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {analyzeError && <div className="mt-4 p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400 text-center text-sm">{analyzeError}</div>}

            {chatHistory.length > 0 && (
              <div className="mt-2 flex flex-col flex-1 min-h-[400px] overflow-hidden border border-slate-800 rounded-xl bg-slate-950/80 shadow-inner">
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {chatHistory.map((msg, idx) => {
                    if (idx === 0 && msg.role === "user") return null;
                    return (
                      <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[90%] md:max-w-[80%] p-5 rounded-2xl leading-relaxed whitespace-pre-wrap text-sm shadow-md ${
                            msg.role === "user"
                              ? "bg-blue-600 text-white rounded-br-none"
                              : "bg-slate-900 text-slate-300 border border-slate-700/50 rounded-bl-none"
                          }`}
                        >
                          {msg.role === "model" && (
                            <div className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-2 flex items-center gap-2 text-xs uppercase tracking-wider">
                              ✨ TradeAnalyzer AI
                            </div>
                          )}
                          {msg.text}
                        </div>
                      </div>
                    );
                  })}
                  {isAnalyzing && chatHistory.length > 0 && (
                    <div className="flex justify-start">
                      <div className="bg-slate-900 text-slate-400 p-4 rounded-2xl rounded-bl-none border border-slate-800 text-sm flex items-center gap-2">
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleFollowUp} className="p-4 bg-slate-900/80 border-t border-slate-800 flex gap-3 shrink-0">
                  <input
                    type="text"
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                    placeholder="Ask a follow-up..."
                    className="flex-1 bg-slate-950 p-3 rounded-xl border border-slate-700 focus:outline-none focus:border-purple-500 text-sm transition"
                    disabled={isAnalyzing}
                  />
                  <button
                    type="submit"
                    disabled={isAnalyzing || !followUp.trim()}
                    className="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 px-6 rounded-xl font-bold text-sm transition"
                  >
                    Send
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* --- ROSTERS --- */}
        {leagueData && (
          <div className="space-y-6 animate-fade-in mt-12">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3 border-b border-slate-800 pb-4">
              <span className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded-md">3</span> 
              {leagueData.leagueInfo.name} Rosters
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {leagueData.rosters.map((roster: any) => {
                const teamName = getTeamNameByRosterId(roster.roster_id);

                return (
                  <div key={roster.roster_id} className="bg-slate-900/40 backdrop-blur-sm rounded-xl overflow-hidden border border-slate-800 shadow-lg hover:border-slate-700 transition duration-300 flex flex-col h-[500px]">
                    <div className="bg-slate-950/80 p-4 border-b border-slate-800 shrink-0">
                      <h3 className="font-bold text-sm text-slate-200 truncate">{teamName}</h3>
                    </div>

                    <div className="p-3 overflow-y-auto flex-1 custom-scrollbar">
                      {roster.players?.map((playerId: string) => {
                        const player = leagueData.players[playerId];
                        if (!player) return null;
                        const isSelected = selectedItems.includes(playerId);
                        return (
                          <div
                            key={playerId}
                            onClick={() => toggleItem(playerId)}
                            className={`flex justify-between items-center py-2 px-3 mb-1.5 rounded-lg cursor-pointer transition border text-sm ${
                              isSelected
                                ? "bg-blue-600/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                                : "bg-slate-900 border-transparent hover:bg-slate-800 hover:border-slate-700"
                            }`}
                          >
                            <span className={`font-medium truncate mr-2 ${isSelected ? "text-blue-100" : "text-slate-300"}`}>
                              {player.first_name} {player.last_name}
                            </span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 ${isSelected ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                              {player.position}
                            </span>
                          </div>
                        );
                      })}
                      
                      {roster.draft_picks?.length > 0 && (
                        <div className="mt-5 mb-3 px-2 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-1">
                          Draft Picks
                        </div>
                      )}
                      
                      {roster.draft_picks?.map((pick: any) => {
                        const isSelected = selectedItems.includes(pick.id);
                        const originalTeam =
                          pick.original_roster_id !== roster.roster_id
                            ? `(via ${getTeamNameByRosterId(pick.original_roster_id)})`
                            : "";
                        return (
                          <div
                            key={pick.id}
                            onClick={() => toggleItem(pick.id)}
                            className={`flex justify-between items-center py-2 px-3 mb-1.5 rounded-lg cursor-pointer transition border text-sm ${
                              isSelected
                                ? "bg-purple-600/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                                : "bg-slate-900 border-transparent hover:bg-slate-800 hover:border-slate-700"
                            }`}
                          >
                            <span className={`font-medium truncate mr-2 ${isSelected ? "text-purple-100" : "text-slate-300"}`}>
                              {pick.year} Rnd {pick.round} <span className="text-[10px] text-slate-500 hidden sm:inline">{originalTeam}</span>
                            </span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 ${isSelected ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-500 border border-slate-700"}`}>
                              PICK
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* --- IP & COPYRIGHT FOOTER --- */}
      <footer className="bg-slate-950 border-t border-slate-900 mt-20">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-slate-500 text-sm">
            &copy; 2026 TradeAnalyzer AI. All rights reserved.
          </div>
          <div className="text-slate-600 text-xs text-center md:text-right max-w-md">
            This tool is for entertainment purposes only. We are not affiliated with Sleeper or KeepTradeCut.
          </div>
          <div className="flex gap-4 text-sm text-slate-400">
            <a href="#" className="hover:text-white transition">Terms of Service</a>
            <a href="#" className="hover:text-white transition">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}