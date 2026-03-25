import { useState, useEffect, useCallback, useRef } from "react";
import * as d3 from "d3";
import { feature } from "topojson-client";

const HOSTNAME = "prod-db-server";
const API_BASE = "http://192.168.122.222:5000/api";
const TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

/* ─── SVG Icons ──────────────────────────────────────────────────── */
const I = {
  shield: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  terminal: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
  key: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  download: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  zap: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  brain: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z"/></svg>,
  globe: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  activity: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  check: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  clock: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  alert: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  refresh: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  cpu: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/></svg>,
  skull: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><path d="M8 20v2h8v-2"/><path d="M12.5 17-.5-1h-1l-.5 1"/><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/></svg>,
  lock: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  link: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  bot: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>,
  pickaxe: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.531 12.469 6.619 20.38a1 1 0 1 1-3-3l7.912-7.912"/><path d="M15.686 4.314A12.5 12.5 0 0 0 5.461 2.958 1 1 0 0 0 5.58 4.71a22 22 0 0 1 6.318 3.393"/><path d="M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z"/></svg>,
  scan: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>,
  search: (s=16,c="currentColor") => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
};

/* ─── World Map Component ────────────────────────────────────────── */
function WorldMap({ geoData }) {
  const svgRef = useRef(null);
  const [worldData, setWorldData] = useState(null);

  useEffect(() => {
    fetch(TOPO_URL).then(r => r.json()).then(topo => {
      setWorldData(feature(topo, topo.objects.countries));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!worldData || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const w = svgRef.current.clientWidth;
    const h = w * 0.48;
    svg.attr("height", h);

    const projection = d3.geoNaturalEarth1().fitSize([w, h], worldData);
    const path = d3.geoPath().projection(projection);

    // Countries
    svg.append("g").selectAll("path")
      .data(worldData.features)
      .join("path")
      .attr("d", path)
      .attr("fill", "rgba(255,255,255,0.04)")
      .attr("stroke", "rgba(255,255,255,0.08)")
      .attr("stroke-width", 0.4);

    // Attack points
    if (geoData.length > 0) {
      const maxCount = Math.max(...geoData.map(g => g.count), 1);

      // Pulse circles
      svg.append("g").selectAll("circle.pulse")
        .data(geoData)
        .join("circle")
        .attr("cx", d => projection([d.lon, d.lat])?.[0] || 0)
        .attr("cy", d => projection([d.lon, d.lat])?.[1] || 0)
        .attr("r", d => 6 + (d.count / maxCount) * 18)
        .attr("fill", "rgba(249,115,22,0.12)")
        .attr("stroke", "none");

      // Main dots
      svg.append("g").selectAll("circle.dot")
        .data(geoData)
        .join("circle")
        .attr("cx", d => projection([d.lon, d.lat])?.[0] || 0)
        .attr("cy", d => projection([d.lon, d.lat])?.[1] || 0)
        .attr("r", d => 3 + (d.count / maxCount) * 8)
        .attr("fill", "#f97316")
        .attr("stroke", "rgba(249,115,22,0.4)")
        .attr("stroke-width", 1.5)
        .attr("opacity", 0.85);

      // Labels
      svg.append("g").selectAll("text")
        .data(geoData)
        .join("text")
        .attr("x", d => (projection([d.lon, d.lat])?.[0] || 0) + 10)
        .attr("y", d => (projection([d.lon, d.lat])?.[1] || 0) - 8)
        .text(d => `${d.city} (${d.count})`)
        .attr("fill", "rgba(255,255,255,0.6)")
        .attr("font-size", "10px")
        .attr("font-family", "'DM Mono', monospace");
    }
  }, [worldData, geoData]);

  return <svg ref={svgRef} width="100%" style={{ display: "block" }} />;
}

/* ─── Small Components ───────────────────────────────────────────── */
function MiniBar({ value, max, color = "#f97316" }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.04)", borderRadius: 2 }}><div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.5s" }} /></div>;
}

function HourChart({ hourly }) {
  const vals = Object.values(hourly); const max = vals.length > 0 ? Math.max(...vals, 1) : 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80, padding: "8px 0" }}>
      {Array.from({ length: 24 }, (_, i) => {
        const key = String(i).padStart(2, "0"); const v = hourly[key] || 0; const h = max > 0 ? (v / max) * 65 : 0;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 3 }}>
            <div style={{ width: "100%", maxWidth: 16, height: h, background: v > 0 ? "#f97316" : "rgba(255,255,255,0.03)", borderRadius: "2px 2px 0 0", transition: "height 0.4s", minHeight: v > 0 ? 2 : 1, opacity: v > 0 ? 0.4 + (v / max) * 0.6 : 1 }} />
            {i % 3 === 0 && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)" }}>{key}</span>}
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, sub, color = "#f97316", icon }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--mono)" }}>{label}</span>
        <span style={{ color, opacity: 0.5 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 600, color: "#fff", fontFamily: "var(--display)", lineHeight: 1, letterSpacing: "-0.03em" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 6, fontFamily: "var(--mono)" }}>{sub}</div>}
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────── */
export default function HoneypotDashboard() {
  const [overview, setOverview] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [credentials, setCredentials] = useState({ top_usernames: [], top_passwords: [] });
  const [sessions, setSessions] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [timeline, setTimeline] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedSession, setSelectedSession] = useState(null);
  const [geminiKey, setGeminiKey] = useState(() => {
    try { return window.__GEMINI_KEY || ""; } catch(e) { return ""; }
  });
  const updateGeminiKey = (key) => { setGeminiKey(key); window.__GEMINI_KEY = key; };
  const [geminiAnalysis, setGeminiAnalysis] = useState("");
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [classifications, setClassifications] = useState([]);
  const [classifyLoading, setClassifyLoading] = useState(false);
  const [classifyError, setClassifyError] = useState("");
  const [heatmapData, setHeatmapData] = useState({});
  const [cmdFreq, setCmdFreq] = useState([]);
  const [pwdStrength, setPwdStrength] = useState({});
  const [killChain, setKillChain] = useState({});
  const [sessionDurations, setSessionDurations] = useState([]);
  const [geoData, setGeoData] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const [ovR, atR, crR, seR, dlR, tlR] = await Promise.all([
        fetch(`${API_BASE}/overview`), fetch(`${API_BASE}/login_attempts`), fetch(`${API_BASE}/credentials`),
        fetch(`${API_BASE}/sessions`), fetch(`${API_BASE}/downloads`), fetch(`${API_BASE}/timeline`),
      ]);
      setOverview(await ovR.json()); setAttempts(await atR.json()); setCredentials(await crR.json());
      setSessions(await seR.json()); setDownloads(await dlR.json()); setTimeline(await tlR.json());
      try {
        const [hmR, cfR, psR, kcR, sdR, geR] = await Promise.all([
          fetch(API_BASE+"/heatmap"), fetch(API_BASE+"/command_freq"), fetch(API_BASE+"/password_strength"),
          fetch(API_BASE+"/kill_chain"), fetch(API_BASE+"/session_durations"), fetch(API_BASE+"/geo_attacks"),
        ]);
        setHeatmapData(await hmR.json()); setCmdFreq(await cfR.json()); setPwdStrength(await psR.json());
        setKillChain(await kcR.json()); setSessionDurations(await sdR.json()); setGeoData(await geR.json());
      } catch(e) { console.log("Analytics:", e); }
      setError("");
    } catch (e) { setError("Cannot connect to API"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); if (autoRefresh) { const iv = setInterval(fetchData, 10000); return () => clearInterval(iv); } }, [fetchData, autoRefresh]);

  const analyzeWithGemini = useCallback(async (session) => {
    if (!geminiKey) { setGeminiError("Enter your Gemini API key first"); return; }
    setGeminiLoading(true); setGeminiError(""); setGeminiAnalysis("");
    const cmdList = session.commands.map((c, i) => `  ${i+1}. ${c.input}`).join("\n");
    const credList = session.credentials.map(c => `  ${c.username}/${c.password} (${c.success ? "ok" : "fail"})`).join("\n");
    const dlList = session.downloads.length > 0 ? session.downloads.map(d => `  ${d.url}`).join("\n") : "  None";
    const prompt = `You are a cybersecurity analyst. Analyze this SSH honeypot session:\n\n1. Attack Classification\n2. Attacker Skill Level\n3. Attack Objective\n4. IOCs\n5. MITRE ATT&CK Mapping\n6. Risk Assessment (Low/Medium/High/Critical)\n7. Mitigations\n\nIP=${session.src_ip} ID=${session.id}\nCredentials:\n${credList}\nCommands:\n${cmdList}\nDownloads:\n${dlList}\n\nConcise analysis with headings.`;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || `Error ${res.status}`); }
      setGeminiAnalysis((await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "No analysis.");
    } catch (e) { setGeminiError(e.message); } finally { setGeminiLoading(false); }
  }, [geminiKey]);

  const classifyAll = useCallback(async () => {
    if (!geminiKey) { setClassifyError("Set API key in AI Analysis tab first"); return; }
    setClassifyLoading(true); setClassifyError("");
    try {
      const res = await fetch(API_BASE + "/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: geminiKey }) });
      if (!res.ok) throw new Error("Error " + res.status);
      setClassifications(await res.json());
    } catch (e) { setClassifyError(e.message); } finally { setClassifyLoading(false); }
  }, [geminiKey]);

  const sevColor = s => ({ critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e" }[s] || "#555");
  const atkIcon = t => { const m = { brute_force: I.lock, recon: I.search, cryptominer: I.pickaxe, botnet: I.bot, persistence: I.link, scanner: I.scan, manual_exploit: I.skull }; const fn = m[t]; return fn ? fn(16) : I.alert(16); };

  const renderMd = text => {
    return text.replace(/---/g, "").split("\n").map((line, i) => {
      const t = line.trim();
      if (!t || t.match(/^\|?[:\-\s|]+\|?$/)) return null;
      if (t.startsWith("#### ")) return <h4 key={i} style={{ color: "#f97316", fontSize: 13, fontWeight: 600, margin: "12px 0 5px", fontFamily: "var(--display)" }}>{t.slice(5)}</h4>;
      if (t.startsWith("### ")) return <h4 key={i} style={{ color: "#f97316", fontSize: 14, fontWeight: 600, margin: "13px 0 5px", fontFamily: "var(--display)" }}>{t.slice(4)}</h4>;
      if (t.startsWith("## ")) return <h3 key={i} style={{ color: "#f97316", fontSize: 15, fontWeight: 600, margin: "14px 0 6px", fontFamily: "var(--display)" }}>{t.slice(3)}</h3>;
      if (t.startsWith("# ")) return <h2 key={i} style={{ color: "#f97316", fontSize: 16, fontWeight: 600, margin: "16px 0 7px", fontFamily: "var(--display)" }}>{t.slice(2)}</h2>;
      const fmt = s => {
        const p = []; const rx = /(\*\*(.+?)\*\*|`(.+?)`)/g; let l = 0, m;
        while ((m = rx.exec(s)) !== null) {
          if (m.index > l) p.push(s.slice(l, m.index));
          if (m[2]) p.push(<strong key={m.index} style={{ color: "#e2e8f0", fontWeight: 600 }}>{m[2]}</strong>);
          if (m[3]) p.push(<code key={m.index} style={{ color: "#f97316", background: "rgba(249,115,22,0.08)", padding: "1px 4px", borderRadius: 2, fontFamily: "var(--mono)", fontSize: 11 }}>{m[3]}</code>);
          l = m.index + m[0].length;
        }
        if (l < s.length) p.push(s.slice(l)); return p.length ? p : s;
      };
      if (t.startsWith("| ")) { const cells = t.split("|").filter(c => c.trim()).map(c => c.trim()); return <p key={i} style={{ color: "rgba(255,255,255,0.7)", margin: "2px 0", paddingLeft: 16, fontFamily: "var(--mono)", fontSize: 11 }}>{fmt(cells.join(" > "))}</p>; }
      if (t.match(/^\d+\.\s/)) return <p key={i} style={{ color: "rgba(255,255,255,0.65)", margin: "3px 0", paddingLeft: 14, lineHeight: 1.6 }}>{fmt(t.replace(/^\d+\.\s/, ""))}</p>;
      if (t.startsWith("- ") || t.startsWith("* ")) { const indent = line.search(/\S/) > 2 ? 28 : 14; return <p key={i} style={{ color: "rgba(255,255,255,0.75)", margin: "2px 0", paddingLeft: indent, lineHeight: 1.6 }}>{fmt(t.replace(/^[-*]\s/, ""))}</p>; }
      return <p key={i} style={{ color: "rgba(255,255,255,0.6)", margin: "3px 0", lineHeight: 1.7 }}>{fmt(t)}</p>;
    }).filter(Boolean);
  };

  const CS = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: 22 };
  const LS = { fontSize: 12, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, fontFamily: "var(--mono)", display: "flex", alignItems: "center", gap: 7 };
  const tabs = [
    { id: "overview", label: "Overview", icon: I.activity },
    { id: "analytics", label: "Analytics", icon: I.cpu },
    { id: "credentials", label: "Credentials", icon: I.key },
    { id: "sessions", label: "Sessions", icon: I.terminal },
    { id: "downloads", label: "Downloads", icon: I.download },
    { id: "classify", label: "Auto-Classify", icon: I.zap },
    { id: "gemini", label: "AI Analysis", icon: I.brain },
  ];

  if (loading) return <div style={{ minHeight: "100vh", background: "#08090a", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ textAlign: "center" }}>{I.shield(36, "#f97316")}<div style={{ color: "#f97316", fontSize: 13, marginTop: 14, fontFamily: "'DM Mono', monospace" }}>Connecting...</div></div></div>;
  if (error) return <div style={{ minHeight: "100vh", background: "#08090a", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ textAlign: "center", maxWidth: 400, padding: 40 }}>{I.alert(32, "#ef4444")}<div style={{ color: "#ef4444", fontSize: 15, fontFamily: "'Outfit', sans-serif", fontWeight: 600, margin: "14px 0 8px" }}>Connection failed</div><div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 18 }}>{error}</div><button onClick={() => { setLoading(true); setError(""); fetchData(); }} style={{ padding: "9px 22px", background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 6, color: "#f97316", cursor: "pointer", fontFamily: "'Outfit', sans-serif", fontWeight: 500 }}>Retry</button></div></div>;

  return (
    <div style={{ minHeight: "100vh", background: "#08090a", color: "rgba(255,255,255,0.7)", fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        :root{--display:'Outfit',sans-serif;--mono:'DM Mono',monospace}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        .tb:hover{background:rgba(255,255,255,0.04)} .ch:hover{border-color:rgba(255,255,255,0.12)}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {I.shield(20, "#f97316")}
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: "#fff", letterSpacing: "-0.02em" }}>Ouroboros</h1>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)", letterSpacing: "0.06em" }}>CUSTOM SSH HONEYPOT · {HOSTNAME} · 192.168.122.222:2223</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "rgba(255,255,255,0.7)", cursor: "pointer", fontFamily: "var(--mono)" }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ accentColor: "#f97316", width: 11, height: 11 }} />AUTO
          </label>
          <button onClick={fetchData} style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "4px 7px", color: "rgba(255,255,255,0.7)", cursor: "pointer", display: "flex" }}>{I.refresh(12, "rgba(255,255,255,0.7)")}</button>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", animation: "pulse 2.5s ease infinite" }} /><span style={{ fontSize: 12, color: "#22c55e", fontFamily: "var(--mono)" }}>LIVE</span></div>
          {geminiKey && <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: "#f97316" }} /><span style={{ fontSize: 12, color: "#f97316", fontFamily: "var(--mono)" }}>AI</span></div>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 1, padding: "0 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {tabs.map(t => (
          <button key={t.id} className="tb" onClick={() => { setActiveTab(t.id); setSelectedSession(null); }}
            style={{ padding: "11px 14px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "var(--display)", display: "flex", alignItems: "center", gap: 6, background: activeTab === t.id ? "rgba(255,255,255,0.04)" : "transparent", color: activeTab === t.id ? "#fff" : "rgba(255,255,255,0.75)", borderBottom: activeTab === t.id ? "1.5px solid #f97316" : "1.5px solid transparent" }}>
            {t.icon(13, activeTab === t.id ? "#f97316" : "rgba(255,255,255,0.7)")} {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "22px 24px", maxWidth: 1320, animation: "fadeUp 0.2s ease" }}>

        {/* ═══ OVERVIEW ═══ */}
        {activeTab === "overview" && overview && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <StatCard icon={I.activity(16, "#ef4444")} label="Attempts" value={overview.total_attempts} sub="login attempts" color="#ef4444" />
              <StatCard icon={I.globe(16, "#3b82f6")} label="Unique IPs" value={overview.unique_ips} sub="distinct sources" color="#3b82f6" />
              <StatCard icon={I.check(16, "#22c55e")} label="Success Rate" value={`${overview.success_rate}%`} sub={`${overview.success_count} successful`} color="#22c55e" />
              <StatCard icon={I.terminal(16, "#f97316")} label="Sessions" value={overview.total_sessions} sub={`${overview.total_downloads} downloads`} color="#f97316" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {/* Hourly */}
              <div style={CS}>
                <div style={LS}>{I.clock(12, "rgba(255,255,255,0.6)")} Attacks by hour (IST)</div>
                <HourChart hourly={timeline} />
              </div>
              {/* Kill chain */}
              <div style={CS}>
                <div style={LS}>{I.skull(12, "rgba(255,255,255,0.6)")} Attack kill chain</div>
                {[
                  { key: "login_attempt", label: "Login attempt", color: "#6b7280" },
                  { key: "login_success", label: "Login success", color: "#eab308" },
                  { key: "recon", label: "Recon", color: "#f97316" },
                  { key: "download", label: "Download", color: "#ef4444" },
                  { key: "execute", label: "Execute", color: "#dc2626" },
                  { key: "persist", label: "Persist", color: "#991b1b" },
                ].map(s => { const v = killChain[s.key]||0; const mx = Math.max(...Object.values(killChain),1); return (
                  <div key={s.key} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 6, height: 6, borderRadius: 1, background: s.color }} /><span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{s.label}</span></div>
                      <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "rgba(255,255,255,0.65)" }}>{v}</span>
                    </div>
                    <div style={{ height: 4, background: "rgba(255,255,255,0.03)", borderRadius: 2 }}><div style={{ width: mx > 0 ? (v/mx*100)+"%" : "0%", height: "100%", background: s.color, borderRadius: 2, transition: "width 0.5s" }} /></div>
                  </div>
                ); })}
              </div>
              {/* Password strength */}
              <div style={CS}>
                <div style={LS}>{I.lock(12, "rgba(255,255,255,0.6)")} Password strength</div>
                {[{ key: "weak", label: "Weak", color: "#ef4444" },{ key: "medium", label: "Medium", color: "#eab308" },{ key: "strong", label: "Strong", color: "#22c55e" }].map(c => {
                  const total = (pwdStrength.weak||0)+(pwdStrength.medium||0)+(pwdStrength.strong||0); const v = pwdStrength[c.key]||0; const pct = total > 0 ? Math.round(v/total*100) : 0;
                  return (
                    <div key={c.key} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 12, color: c.color, fontWeight: 500 }}>{c.label}</span>
                        <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "rgba(255,255,255,0.65)" }}>{v} ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,0.03)", borderRadius: 3 }}><div style={{ width: pct+"%", height: "100%", background: c.color, borderRadius: 3, opacity: 0.7 }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Top usernames row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={CS}>
                <div style={LS}>{I.key(12, "rgba(255,255,255,0.6)")} Top usernames</div>
                {credentials.top_usernames.slice(0, 6).map(([u, c]) => (
                  <div key={u} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <code style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#f97316", minWidth: 60 }}>{u}</code>
                    <div style={{ flex: 1 }}><MiniBar value={c} max={credentials.top_usernames[0]?.[1]||1} /></div>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "rgba(255,255,255,0.75)", minWidth: 18, textAlign: "right" }}>{c}</span>
                  </div>
                ))}
              </div>
              <div style={CS}>
                <div style={LS}>{I.lock(12, "rgba(255,255,255,0.6)")} Top passwords</div>
                {credentials.top_passwords.slice(0, 6).map(([p, c]) => (
                  <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <code style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#ef4444", minWidth: 60 }}>{p}</code>
                    <div style={{ flex: 1 }}><MiniBar value={c} max={credentials.top_passwords[0]?.[1]||1} color="#ef4444" /></div>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "rgba(255,255,255,0.75)", minWidth: 18, textAlign: "right" }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ ANALYTICS ═══ */}
        {activeTab === "analytics" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* World Map */}
            <div style={CS}>
              <div style={LS}>{I.globe(12, "rgba(255,255,255,0.6)")} Attack origins</div>
              <WorldMap geoData={geoData} />
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
                {geoData.map((loc, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontFamily: "var(--mono)" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#f97316" }} />
                    <span style={{ color: "rgba(255,255,255,0.7)" }}>{loc.country}</span>
                    <span style={{ color: "rgba(255,255,255,0.7)" }}>{loc.ip}</span>
                    <span style={{ color: "#f97316" }}>{loc.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14 }}>
              {/* Heatmap */}
              <div style={CS}>
                <div style={LS}>{I.activity(12, "rgba(255,255,255,0.6)")} Attack heatmap (day x hour, IST)</div>
                {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => (
                  <div key={day} style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 2 }}>
                    <span style={{ width: 28, fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "var(--mono)", textAlign: "right", paddingRight: 5 }}>{day}</span>
                    {Array.from({length:24},(_,h) => { const v = heatmapData[day+"-"+h]||0; const mx = Math.max(...Object.values(heatmapData),1); const op = v > 0 ? 0.15+(v/mx)*0.85 : 0;
                      return <div key={h} title={`${day} ${String(h).padStart(2,"0")}:00 — ${v}`} style={{ flex: 1, height: 16, borderRadius: 2, minWidth: 12, background: v > 0 ? `rgba(249,115,22,${op})` : "rgba(255,255,255,0.03)", cursor: v > 0 ? "pointer" : "default" }} />;
                    })}
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 4 }}>
                  <span style={{ width: 28 }} />
                  {Array.from({length:24},(_,h) => <div key={h} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "var(--mono)", minWidth: 12 }}>{h%3===0 ? String(h).padStart(2,"0") : ""}</div>)}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)" }}>Less</span>
                  {[0.05,0.2,0.4,0.7,0.9].map((op,i) => <div key={i} style={{ width: 12, height: 12, borderRadius: 2, background: `rgba(249,115,22,${op})` }} />)}
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)" }}>More</span>
                </div>
              </div>
              {/* Session Durations */}
              <div style={CS}>
                <div style={LS}>{I.clock(12, "rgba(255,255,255,0.6)")} Session durations</div>
                {sessionDurations.length === 0 ? <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, textAlign: "center", padding: 16 }}>No data</p> : sessionDurations.map((s,i) => {
                  const mx = Math.max(...sessionDurations.map(d => d.duration),1); const m = Math.floor(s.duration/60); const sc = Math.round(s.duration%60);
                  return (
                    <div key={i} style={{ marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <code style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#f97316" }}>{s.src_ip}</code>
                          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)" }}>{s.cmds} cmds</span>
                        </div>
                        <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "rgba(255,255,255,0.65)" }}>{m > 0 ? m+"m ":""}{sc}s</span>
                      </div>
                      <div style={{ height: 4, background: "rgba(255,255,255,0.03)", borderRadius: 2 }}><div style={{ width: (s.duration/mx*100)+"%", height: "100%", background: s.duration > 120 ? "#ef4444" : s.duration > 30 ? "#eab308" : "#22c55e", borderRadius: 2 }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Command Frequency */}
            <div style={CS}>
              <div style={LS}>{I.terminal(12, "rgba(255,255,255,0.6)")} Top commands</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
                {cmdFreq.slice(0, 16).map(([cmd, count], i) => {
                  const mx = cmdFreq[0]?.[1]||1;
                  return (
                    <div key={cmd} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                      <span style={{ width: 14, fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)", textAlign: "right" }}>{i+1}</span>
                      <code style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#f97316", minWidth: 70 }}>{cmd}</code>
                      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.03)", borderRadius: 2 }}><div style={{ width: (count/mx*100)+"%", height: "100%", background: "rgba(249,115,22,0.5)", borderRadius: 2 }} /></div>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "rgba(255,255,255,0.75)", minWidth: 16, textAlign: "right" }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══ CREDENTIALS ═══ */}
        {activeTab === "credentials" && (
          <div style={CS}>
            <div style={LS}>{I.activity(12, "rgba(255,255,255,0.6)")} All login attempts</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Timestamp","Source IP","Username","Password","Result"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 10px", color: "rgba(255,255,255,0.75)", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>{h}</th>)}
                </tr></thead>
                <tbody>{attempts.map((a,i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.025)" }}>
                    <td style={{ padding: "6px 10px", fontFamily: "var(--mono)", color: "rgba(255,255,255,0.75)", fontSize: 11 }}>{a.timestamp ? new Date(a.timestamp).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}) : "—"}</td>
                    <td style={{ padding: "6px 10px", fontFamily: "var(--mono)", color: "rgba(255,255,255,0.75)" }}>{a.src_ip}</td>
                    <td style={{ padding: "6px 10px" }}><code style={{ color: "#f97316", background: "rgba(249,115,22,0.06)", padding: "1px 5px", borderRadius: 2, fontFamily: "var(--mono)", fontSize: 11 }}>{a.username}</code></td>
                    <td style={{ padding: "6px 10px" }}><code style={{ color: "#ef4444", background: "rgba(239,68,68,0.06)", padding: "1px 5px", borderRadius: 2, fontFamily: "var(--mono)", fontSize: 11 }}>{a.password}</code></td>
                    <td style={{ padding: "6px 10px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, padding: "2px 6px", borderRadius: 2, fontFamily: "var(--mono)", fontWeight: 500, background: a.success ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", color: a.success ? "#22c55e" : "#ef4444" }}>{a.success ? I.check(9,"#22c55e") : I.x(9,"#ef4444")} {a.success ? "OK" : "FAIL"}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ SESSIONS ═══ */}
        {activeTab === "sessions" && (
          <div style={{ display: "grid", gridTemplateColumns: selectedSession ? "1fr 1.2fr" : "1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sessions.length === 0 ? <div style={{ ...CS, textAlign: "center", padding: 40, color: "rgba(255,255,255,0.7)" }}>No sessions yet</div> : sessions.map(s => (
                <div key={s.id} className="ch" onClick={() => setSelectedSession(s)} style={{ ...CS, padding: 14, cursor: "pointer", borderColor: selectedSession?.id === s.id ? "rgba(249,115,22,0.25)" : "rgba(255,255,255,0.06)", background: selectedSession?.id === s.id ? "rgba(249,115,22,0.03)" : "rgba(255,255,255,0.03)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{I.terminal(12,"#f97316")}<code style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#f97316" }}>{s.src_ip}</code><span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)" }}>{s.id}</span></div>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)" }}>{s.commands.length} cmds</span>
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)", marginBottom: 5 }}>{s.start ? new Date(s.start).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}) : ""}</div>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{s.commands.slice(0, 5).map((c,i) => <code key={i} style={{ fontSize: 10, fontFamily: "var(--mono)", color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.03)", padding: "1px 4px", borderRadius: 2 }}>{c.input?.length > 18 ? c.input.slice(0,18)+"…" : c.input}</code>)}{s.commands.length > 5 && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>+{s.commands.length-5}</span>}</div>
                </div>
              ))}
            </div>
            {selectedSession && (
              <div style={{ ...CS, position: "sticky", top: 20, alignSelf: "start" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{I.terminal(15,"#f97316")}<span style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>Session {selectedSession.id}</span></div>
                  <button onClick={() => setSelectedSession(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>{I.x(15)}</button>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginBottom: 14, fontFamily: "var(--mono)" }}>{selectedSession.src_ip} · {selectedSession.start ? new Date(selectedSession.start).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}) : ""}</div>
                {selectedSession.credentials.length > 0 && <div style={{ marginBottom: 14 }}><div style={{ ...LS, marginBottom: 6 }}>Credentials</div>{selectedSession.credentials.map((c,i) => <div key={i} style={{ fontSize: 11, padding: "2px 0", fontFamily: "var(--mono)", display: "flex", alignItems: "center", gap: 5 }}><span style={{ color: "#f97316" }}>{c.username}</span><span style={{ color: "rgba(255,255,255,0.2)" }}>/</span><span style={{ color: "#ef4444" }}>{c.password}</span>{c.success ? I.check(11,"#22c55e") : I.x(11,"#ef4444")}</div>)}</div>}
                <div style={{ ...LS, marginBottom: 8 }}>Commands</div>
                <div style={{ background: "#0c0d0e", borderRadius: 5, padding: 12, fontFamily: "var(--mono)", fontSize: 11, border: "1px solid rgba(255,255,255,0.04)", maxHeight: 350, overflow: "auto" }}>
                  {selectedSession.commands.map((cmd,i) => <div key={i} style={{ padding: "2px 0" }}><span style={{ color: "#22c55e" }}>root@{HOSTNAME}</span><span style={{ color: "rgba(255,255,255,0.2)" }}>:~$ </span><span style={{ color: "rgba(255,255,255,0.7)" }}>{cmd.input}</span></div>)}
                </div>
                {selectedSession.downloads.length > 0 && <div style={{ marginTop: 14 }}><div style={{ ...LS, marginBottom: 6 }}>{I.download(12,"rgba(255,255,255,0.6)")} Downloads</div>{selectedSession.downloads.map((d,i) => <div key={i} style={{ fontSize: 12, color: "#ef4444", fontFamily: "var(--mono)", padding: "2px 0" }}>{d.url}<br/><span style={{ color: "rgba(255,255,255,0.7)" }}>SHA256: {d.shasum}</span></div>)}</div>}
              </div>
            )}
          </div>
        )}

        {/* ═══ DOWNLOADS ═══ */}
        {activeTab === "downloads" && (
          <div style={CS}>
            <div style={LS}>{I.download(12, "rgba(255,255,255,0.6)")} Captured downloads</div>
            {downloads.length === 0 ? <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, textAlign: "center", padding: 24 }}>No downloads captured</p> : downloads.map((f,i) => (
              <div key={i} style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><code style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#ef4444" }}>{f.url}</code><span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)" }}>{f.timestamp ? new Date(f.timestamp).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}) : ""}</span></div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)" }}>Session: {f.session} · SHA256: {f.shasum}</div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ AUTO-CLASSIFY ═══ */}
        {activeTab === "classify" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div><div style={{ fontSize: 14, color: "#fff", fontWeight: 600, marginBottom: 3 }}>Auto-classify sessions</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>Analyze all sessions with Gemini AI</div></div>
              <button onClick={classifyAll} disabled={classifyLoading} style={{ padding: "9px 18px", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 6, cursor: classifyLoading ? "wait" : "pointer", background: classifyLoading ? "rgba(255,255,255,0.03)" : "rgba(249,115,22,0.06)", color: "#f97316", fontFamily: "var(--display)", fontWeight: 500, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>{I.zap(13,"#f97316")} {classifyLoading ? "Classifying..." : "Classify All"}</button>
            </div>
            {classifyError && <div style={{ ...CS, borderColor: "rgba(239,68,68,0.15)", marginBottom: 12 }}><span style={{ color: "#ef4444", fontSize: 12 }}>{classifyError}</span></div>}
            {classifyLoading && <div style={{ ...CS, textAlign: "center", padding: 36 }}><div style={{ fontSize: 12, color: "#f97316", animation: "pulse 1.5s ease infinite", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{I.cpu(14,"#f97316")} Analyzing...</div></div>}
            {classifications.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{classifications.map((c,i) => (
              <div key={i} className="ch" style={{ ...CS, padding: 16, borderLeft: `2px solid ${sevColor(c.severity)}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{atkIcon(c.attack_type)}<code style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#f97316" }}>{c.src_ip}</code><span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)" }}>{c.session_id}</span></div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 2, fontWeight: 500, fontFamily: "var(--mono)", background: sevColor(c.severity)+"12", color: sevColor(c.severity), textTransform: "uppercase" }}>{c.severity}</span><span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)" }}>{c.cmd_count} cmds</span></div>
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 2, background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.65)", fontFamily: "var(--mono)" }}>{(c.attack_type||"").replace(/_/g," ")}</span>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 2, background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.65)", fontFamily: "var(--mono)" }}>{(c.skill_level||"").replace(/_/g," ")}</span>
                </div>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>{c.summary}</p>
              </div>
            ))}</div>}
            {!classifyLoading && classifications.length === 0 && !classifyError && <div style={{ ...CS, textAlign: "center", padding: 40 }}>{I.zap(24,"rgba(255,255,255,0.08)")}<p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 10 }}>Click "Classify All" to analyze sessions</p></div>}
          </div>
        )}

        {/* ═══ AI ANALYSIS ═══ */}
        {activeTab === "gemini" && (
          <div>
            <div style={{ ...CS, marginBottom: 18 }}>
              <div style={{ ...LS, marginBottom: 10 }}>{I.brain(12, "rgba(255,255,255,0.6)")} Gemini API key</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="password" placeholder="AIza..." value={geminiKey} onChange={e => updateGeminiKey(e.target.value)} style={{ flex: 1, padding: "8px 11px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4, color: "#fff", fontFamily: "var(--mono)", fontSize: 12, outline: "none" }} />
                {geminiKey && <button onClick={() => updateGeminiKey("")} style={{ padding: "8px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 4, color: "#ef4444", cursor: "pointer", fontFamily: "var(--display)", fontWeight: 500, fontSize: 12 }}>Clear</button>}
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 6 }}>Free key at aistudio.google.com · Uses Gemini 2.5 Flash (analysis) + Flash-Lite (adaptive responses)</p>
              {geminiKey && <p style={{ fontSize: 12, color: "#22c55e", marginTop: 4, fontFamily: "var(--mono)" }}>Key active — used by AI Analysis, Auto-Classify, and Adaptive Honeypot</p>}
            </div>
            <div style={{ fontSize: 13, color: "#fff", fontWeight: 600, marginBottom: 12 }}>Select session</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
              {sessions.map(s => (
                <button key={s.id} className="ch" onClick={() => { setSelectedSession(s); analyzeWithGemini(s); }} style={{ ...CS, padding: 12, textAlign: "left", cursor: "pointer", color: "inherit", borderColor: selectedSession?.id === s.id ? "rgba(249,115,22,0.25)" : "rgba(255,255,255,0.06)", background: selectedSession?.id === s.id ? "rgba(249,115,22,0.03)" : "rgba(255,255,255,0.03)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><code style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#f97316" }}>{s.src_ip}</code><span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--mono)" }}>{s.id}</span></div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{s.commands.length} commands</div>
                </button>
              ))}
            </div>
            {geminiLoading && <div style={{ ...CS, textAlign: "center", padding: 36 }}><div style={{ fontSize: 12, color: "#f97316", animation: "pulse 1.5s ease infinite", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{I.brain(14,"#f97316")} Analyzing...</div></div>}
            {geminiError && <div style={{ ...CS, borderColor: "rgba(239,68,68,0.15)" }}><span style={{ color: "#ef4444", fontSize: 12 }}>{geminiError}</span></div>}
            {geminiAnalysis && (
              <div style={{ ...CS, animation: "fadeUp 0.3s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
                  {I.brain(15,"#f97316")}
                  <span style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>Analysis</span>
                  {selectedSession && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontFamily: "var(--mono)", marginLeft: 4 }}>{selectedSession.id} · {selectedSession.src_ip}</span>}
                </div>
                <div>{renderMd(geminiAnalysis)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", padding: "12px 24px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", fontFamily: "var(--mono)" }}>Ouroboros · Custom SSH Honeypot · Cybersecurity Course Project 2026</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", fontFamily: "var(--mono)" }}>Gemini 2.5 Flash + Flash-Lite · Adaptive Response Engine</span>
      </div>
    </div>
  );
}
