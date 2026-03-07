"use client";
import { useState, useRef, useEffect } from "react";

export default function Home() {
  // Core State
  const [leagueId, setLeagueId] = useState("");
  const [loading, setLoading] = useState(false);
  const [leagueData, setLeagueData] = useState<any>(null);
  const [error, setError] = useState("");
  const [savedLeagues, setSavedLeagues] = useState<{ id: string; name: string }[]>([]);

  // Username Search State
  const [username, setUsername] = useState("");
  const [loadingUser, setLoadingUser] = useState(false);
  const [userLeagues, setUserLeagues] = useState<any[]>([]);
  const [usernameError, setUsernameError] = useState("");

  // Trade & AI State
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeMode, setAnalyzeMode] = useState<"fast" | "pro" | null>(null);
  const [chatHistory, setChatHistory] = useState<{ role: string; text: string }[]>([]);
  const [followUp, setFollowUp] = useState("");
  const [analyzeError, setAnalyzeError] = useState("");
  const [copied, setCopied] = useState(false);

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

  // Fetch all leagues for a specific username
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
        throw new Error("No 2026 leagues found for this user. (Note: Sleeper may still be using 2025 IDs for some leagues)");
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
    setIsAnalyzing(true);
    setAnalyzeMode(mode);
    setAnalyzeError("");

    const isSuperflex = leagueData.leagueInfo.roster_positions?.includes("SUPER_FLEX");
    const ppr = leagueData.leagueInfo.scoring_settings?.rec || 0;
    const tep = leagueData.leagueInfo.scoring_settings?.bonus_rec_te || 0;
    const isDynasty = leagueData.leagueInfo.settings?.type === 2;

    let prompt = `Act as an expert fantasy football analyst. It is currently March 2026. Evaluate players based on their current 2026 status.\n\n`;
    
    if (mode === "pro") {
      prompt += `CRITICAL INSTRUCTION: This is a PRO-tier request. You must conduct a highly granular review and a thorough, meticulous analysis of every single moving piece. Break down the 2-to-3 year trajectory of the assets, historical draft capital hit rates, and the deep, underlying roster implications for both teams. Provide a long-form, multi-paragraph deep dive before rendering your final verdict.\n\n`;
    } else {
      prompt += `CRITICAL INSTRUCTION: This is a FAST-tier request. Provide a concise, snappy, and fast-paced analysis hitting the main points of the trade without excessive fluff.\n\n`;
    }

    prompt += `CRITICAL INSTRUCTIONS FOR NUMERICAL SCORING:\n`;
    prompt += `1. You MUST assign a concrete "Trade Value Score" (using arbitrary value points, e.g., 5500 vs 5200) to both sides of the proposed trade to mathematically show how close the trade is.\n`;
    prompt += `2. You MUST calculate a "Team Power Rating" (on a scale of 0 to 100) ONLY for the specific teams involved in the trade. Do NOT generate a Power Rankings table for the entire 12-team league. Just state the Power Ratings for the trading teams.\n\n`;
    
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
    prompt += `Below are the full rosters, draft picks, and ALL-TIME FRANCHISE HISTORY for EVERY team in the league. Use this to understand the league ecosystem and calculate the Team Power Ratings.\n\n`;
    
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

  return (
    <main className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-blue-400 mb-8">AI Trade Analyzer</h1>

        {/* --- REBUILT IMPORT SECTION --- */}
        <div className="bg-slate-800 p-6 rounded-xl shadow-lg mb-8 border border-slate-700">
          <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
            <h2 className="text-xl font-semibold">1. Load Your League</h2>
            {leagueData && !savedLeagues.some((l) => l.id === leagueId) && (
              <button
                onClick={handleSaveLeague}
                className="text-sm bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1 rounded font-bold transition flex items-center gap-1"
              >
                ⭐ Save Current League
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column: Username Search */}
            <div className="bg-slate-900/50 p-5 rounded-lg border border-slate-600">
              <h3 className="font-bold text-blue-400 mb-3 text-sm uppercase tracking-wider">Search by Username</h3>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="e.g. SleeperUsername"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchUserLeagues()}
                  className="flex-1 bg-slate-800 p-2.5 rounded border border-slate-600 focus:outline-none focus:border-blue-500 text-sm"
                />
                <button
                  onClick={handleFetchUserLeagues}
                  disabled={loadingUser || !username}
                  className="bg-blue-600 hover:bg-blue-500 px-4 py-2.5 rounded text-sm font-bold transition disabled:opacity-50"
                >
                  {loadingUser ? "..." : "Find"}
                </button>
              </div>
              {usernameError && <p className="text-red-400 mt-1 text-xs">{usernameError}</p>}

              {userLeagues.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 animate-fade-in border-t border-slate-700 pt-4">
                  <label className="text-xs text-slate-400 font-bold">Select a League:</label>
                  <select
                    onChange={(e) => setLeagueId(e.target.value)}
                    value={leagueId}
                    className="w-full bg-slate-800 p-2.5 rounded border border-blue-500 focus:outline-none text-sm text-slate-200"
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
                    className="w-full bg-green-600 hover:bg-green-500 py-2.5 rounded text-sm font-bold transition disabled:opacity-50 mt-1"
                  >
                    {loading ? "Loading Roster Data..." : "Import Selected League"}
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: Saved & Manual */}
            <div className="flex flex-col gap-4">
              {/* Saved Leagues */}
              {savedLeagues.length > 0 && (
                <div className="bg-slate-900/50 p-5 rounded-lg border border-slate-600">
                  <h3 className="font-bold text-yellow-500 mb-3 text-sm uppercase tracking-wider">Saved Leagues</h3>
                  <div className="flex gap-2">
                    <select
                      onChange={(e) => setLeagueId(e.target.value)}
                      value={leagueId}
                      className="flex-1 bg-slate-800 p-2.5 rounded border border-slate-600 focus:outline-none focus:border-yellow-500 text-sm text-slate-200"
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
                      className="bg-yellow-600 hover:bg-yellow-500 px-4 py-2.5 rounded text-sm font-bold transition disabled:opacity-50"
                    >
                      Load
                    </button>
                  </div>
                </div>
              )}

              {/* Manual ID Input */}
              <div className="bg-slate-900/50 p-5 rounded-lg border border-slate-600">
                <h3 className="font-bold text-slate-400 mb-3 text-sm uppercase tracking-wider">Manual League ID</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="18-digit ID"
                    value={leagueId}
                    onChange={(e) => setLeagueId(e.target.value)}
                    className="flex-1 bg-slate-800 p-2.5 rounded border border-slate-600 focus:outline-none focus:border-slate-400 text-sm"
                  />
                  <button
                    onClick={() => handleImport(leagueId)}
                    disabled={loading || !leagueId}
                    className="bg-slate-600 hover:bg-slate-500 px-4 py-2.5 rounded text-sm font-bold transition disabled:opacity-50"
                  >
                    Import
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {error && <p className="text-red-400 mt-4 text-center font-bold">{error}</p>}
        </div>

        {/* --- TRADE BLOCK --- */}
        {selectedItems.length > 0 && (
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl mb-8 border-2 border-blue-500 animate-fade-in sticky top-4 z-10 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h2 className="text-2xl font-bold text-blue-400">2. Trade Block Staging</h2>
              
              <div className="flex gap-3">
                {chatHistory.length > 0 && (
                  <>
                    <button
                      onClick={handleShare}
                      className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2"
                    >
                      {copied ? "✅ Copied!" : "🔗 Share"}
                    </button>
                    <button
                      onClick={() => setChatHistory([])}
                      className="bg-red-900/50 hover:bg-red-800/80 text-red-200 border border-red-700 px-4 py-2 rounded text-sm font-bold transition"
                    >
                      ✕ Close Chat
                    </button>
                  </>
                )}
                
                {chatHistory.length === 0 && (
                  <>
                    <button
                      onClick={() => {
                        setSelectedItems([]);
                        setChatHistory([]);
                      }}
                      className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-sm font-bold transition"
                    >
                      Clear Trade
                    </button>

                    <button
                      onClick={() => handleAnalyzeTrade("fast")}
                      disabled={teamsInvolved.length < 2 || isAnalyzing}
                      className="bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 px-5 py-2 rounded font-bold transition shadow-lg flex items-center gap-2"
                    >
                      {isAnalyzing && analyzeMode === "fast" ? (
                        <span className="animate-pulse">Analyzing...</span>
                      ) : (
                        "⚡ Fast"
                      )}
                    </button>

                    <button
                      onClick={() => handleAnalyzeTrade("pro")}
                      disabled={teamsInvolved.length < 2 || isAnalyzing}
                      className="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 px-5 py-2 rounded font-bold transition shadow-lg flex items-center gap-2"
                    >
                      {isAnalyzing && analyzeMode === "pro" ? (
                        <span className="animate-pulse">Deep Diving...</span>
                      ) : (
                        "🧠 Pro"
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {chatHistory.length === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">
                {teamsInvolved.map((teamName) => (
                  <div key={teamName} className="bg-slate-900 p-4 rounded-lg border border-slate-700">
                    <h3 className="text-lg font-bold text-slate-300 mb-3 border-b border-slate-700 pb-2">
                      {teamName} Sends:
                    </h3>
                    <div className="space-y-2">
                      {tradeSides[teamName].map((itemId) => {
                        if (itemId.startsWith("pick_")) {
                          const [_, year, round] = itemId.split("_");
                          return (
                            <div key={itemId} className="flex justify-between items-center bg-slate-800 p-2 rounded border border-slate-600">
                              <span className="font-medium">{year} Round {round} Pick</span>
                              <span className="text-xs font-bold px-2 py-1 rounded bg-purple-900 text-purple-200">
                                PICK
                              </span>
                            </div>
                          );
                        } else {
                          const player = leagueData.players[itemId];
                          return (
                            <div key={itemId} className="flex justify-between items-center bg-slate-800 p-2 rounded border border-slate-600">
                              <span className="font-medium">
                                {player?.first_name} {player?.last_name}
                              </span>
                              <span className="text-xs font-bold px-2 py-1 rounded bg-slate-700 text-slate-300">
                                {player?.position}
                              </span>
                            </div>
                          );
                        }
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {analyzeError && <p className="text-red-400 mt-4">Error: {analyzeError}</p>}

            {chatHistory.length > 0 && (
              <div className="mt-2 flex flex-col flex-1 min-h-[400px] overflow-hidden border border-slate-700 rounded-lg bg-slate-950">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatHistory.map((msg, idx) => {
                    if (idx === 0 && msg.role === "user") return null;

                    return (
                      <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] p-4 rounded-lg leading-relaxed whitespace-pre-wrap ${
                            msg.role === "user"
                              ? "bg-blue-600 text-white rounded-br-none"
                              : "bg-slate-800 text-slate-200 border border-purple-500/30 rounded-bl-none shadow-[0_0_10px_rgba(168,85,247,0.1)]"
                          }`}
                        >
                          {msg.role === "model" && (
                            <div className="font-bold text-purple-400 mb-1 flex items-center gap-2 text-sm">
                              ✨ AI Analyst
                            </div>
                          )}
                          {msg.text}
                        </div>
                      </div>
                    );
                  })}
                  {isAnalyzing && chatHistory.length > 0 && (
                    <div className="flex justify-start">
                      <div className="bg-slate-800 text-slate-400 p-4 rounded-lg rounded-bl-none border border-slate-700 animate-pulse">
                        Typing...
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleFollowUp} className="p-3 bg-slate-900 border-t border-slate-700 flex gap-2 shrink-0">
                  <input
                    type="text"
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                    placeholder="Ask a follow-up (e.g., 'What if I add a 2nd round pick?')"
                    className="flex-1 bg-slate-800 p-3 rounded border border-slate-600 focus:outline-none focus:border-purple-500"
                    disabled={isAnalyzing}
                  />
                  <button
                    type="submit"
                    disabled={isAnalyzing || !followUp.trim()}
                    className="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 px-6 rounded font-bold transition"
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
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-green-400 mb-6 flex items-center gap-3">
              {leagueData.leagueInfo.name} Rosters
              <span className="text-sm font-normal text-slate-400 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                Click players or picks to add them to the trade block
              </span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {leagueData.rosters.map((roster: any) => {
                const teamName = getTeamNameByRosterId(roster.roster_id);

                return (
                  <div key={roster.roster_id} className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-md">
                    <div className="bg-slate-950 p-4 border-b border-slate-700 flex justify-between items-center">
                      <h3 className="font-bold text-lg text-blue-300 truncate">{teamName}</h3>
                    </div>

                    <div className="p-2 h-96 overflow-y-auto">
                      {roster.players?.map((playerId: string) => {
                        const player = leagueData.players[playerId];
                        if (!player) return null;
                        const isSelected = selectedItems.includes(playerId);
                        return (
                          <div
                            key={playerId}
                            onClick={() => toggleItem(playerId)}
                            className={`flex justify-between items-center py-2 px-3 mb-1 rounded cursor-pointer transition border ${
                              isSelected
                                ? "bg-blue-900/60 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                                : "border-transparent hover:bg-slate-700/50"
                            }`}
                          >
                            <span className={`font-medium ${isSelected ? "text-white" : "text-slate-200"}`}>
                              {player.first_name} {player.last_name}
                            </span>
                            <span className={`text-xs font-bold px-2 py-1 rounded ${isSelected ? "bg-blue-800 text-blue-100" : "bg-slate-700 text-slate-300"}`}>
                              {player.position} - {player.team}
                            </span>
                          </div>
                        );
                      })}
                      {roster.draft_picks?.length > 0 && (
                        <div className="mt-4 mb-2 px-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
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
                            className={`flex justify-between items-center py-2 px-3 mb-1 rounded cursor-pointer transition border ${
                              isSelected
                                ? "bg-purple-900/60 border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.3)]"
                                : "border-transparent hover:bg-slate-700/50"
                            }`}
                          >
                            <span className={`font-medium ${isSelected ? "text-white" : "text-slate-200"}`}>
                              {pick.year} Round {pick.round} <span className="text-xs text-slate-400">{originalTeam}</span>
                            </span>
                            <span className={`text-xs font-bold px-2 py-1 rounded ${isSelected ? "bg-purple-800 text-purple-100" : "bg-slate-800 text-slate-400"}`}>
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
      </div>
    </main>
  );
}