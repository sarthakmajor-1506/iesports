"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { LiveMatch, HeroRef } from "@/lib/dotaLive";

// OBS browser-source overlay: BPCL-style Captains Mode draft board.
// Transparent background — add as a Browser Source at 1920x1080.
// URL: /overlay/draft?dotaMatchId=8840753040&t1=Radiant%20Team&t2=Dire%20Team&bo=3&logo1=URL&logo2=URL
export default function DraftOverlayPage() {
  return (
    <Suspense fallback={null}>
      <style>{`html,body{background:transparent !important;margin:0;}`}</style>
      <DraftOverlay />
    </Suspense>
  );
}

function DraftOverlay() {
  const sp = useSearchParams();
  const tournamentId = sp.get("tournamentId") || "";
  const matchId = sp.get("matchId") || "";
  const dotaMatchId = sp.get("dotaMatchId") || "";
  // manual fallbacks when not resolving from a tournament match
  const t1m = sp.get("t1") || "Radiant";
  const t2m = sp.get("t2") || "Dire";
  const bom = sp.get("bo") || "1";
  const logo1m = sp.get("logo1") || "";
  const logo2m = sp.get("logo2") || "";

  const [data, setData] = useState<(LiveMatch & { meta?: any }) | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const query = tournamentId && matchId
    ? `tournamentId=${encodeURIComponent(tournamentId)}&matchId=${encodeURIComponent(matchId)}`
    : `dotaMatchId=${encodeURIComponent(dotaMatchId)}`;

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/dota/live?${query}`, { cache: "no-store" });
        const j = (await r.json()) as LiveMatch & { meta?: any };
        if (alive) setData(j);
      } catch { /* keep last */ }
    };
    poll();
    timer.current = setInterval(poll, 8000); // overlay refresh; server caches 25s
    return () => { alive = false; if (timer.current) clearInterval(timer.current); };
  }, [query]);

  const meta = data?.meta;
  const t1 = meta?.radiantName || t1m;
  const t2 = meta?.direName || t2m;
  const bo = String(meta?.bestOf || bom);
  const logo1 = meta?.radiantLogo || logo1m;
  const logo2 = meta?.direLogo || logo2m;

  const d = data?.draft;
  const radiant = d?.radiant || { picks: [], bans: [] };
  const dire = d?.dire || { picks: [], bans: [] };
  const totalPicks = radiant.picks.length + dire.picks.length;
  const inGame = (data?.durationSec || 0) > 0;
  const status = inGame ? "LIVE" : totalPicks >= 10 ? "DRAFT COMPLETE" : "DRAFTING";
  // series score when resolved from a tournament match; else live kills
  const rScore = meta ? meta.radiantSeriesScore : (data?.radiant?.score ?? 0);
  const dScore = meta ? meta.direSeriesScore : (data?.dire?.score ?? 0);

  return (
    <div style={{ position: "fixed", inset: 0, fontFamily: "'Inter',system-ui,sans-serif", color: "#fff", pointerEvents: "none" }}>
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: 230,
        display: "grid", gridTemplateColumns: "1fr 360px 1fr", alignItems: "end",
      }}>
        {/* RADIANT (left) */}
        <TeamPanel side="radiant" accent="#34d399" bans={radiant.bans} picks={radiant.picks} align="left" />

        {/* CENTER */}
        <div style={{
          height: 230, background: "linear-gradient(180deg, rgba(10,10,12,0) 0%, rgba(10,10,12,0.92) 35%)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: "0 0 22px",
          clipPath: "polygon(8% 0, 92% 0, 100% 100%, 0% 100%)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, color: "#c9a227" }}>BO{bo}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, margin: "10px 0 6px" }}>
            <Logo url={logo1} name={t1} accent="#34d399" />
            <span style={{ fontSize: 22, fontWeight: 900, color: "#9aa" }}>VS</span>
            <Logo url={logo2} name={t2} accent="#f87171" />
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 2 }}>{rScore} <span style={{ color: "#777" }}>-</span> {dScore}</div>
          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, letterSpacing: 2, color: status === "LIVE" ? "#f87171" : "#c9a227" }}>
            {status === "LIVE" ? "🔴 " : ""}{status}
          </div>
        </div>

        {/* DIRE (right) */}
        <TeamPanel side="dire" accent="#f87171" bans={dire.bans} picks={dire.picks} align="right" />
      </div>

      {/* brand wordmark */}
      <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", fontSize: 10, letterSpacing: 4, color: "rgba(255,255,255,0.45)", fontWeight: 700 }}>
        iesports
      </div>
    </div>
  );
}

function TeamPanel({ side, accent, bans, picks, align }: { side: string; accent: string; bans: HeroRef[]; picks: HeroRef[]; align: "left" | "right" }) {
  const dir = align === "left" ? "row" : "row-reverse";
  return (
    <div style={{
      height: 230, padding: "0 24px 20px",
      background: `linear-gradient(180deg, rgba(10,10,12,0) 0%, rgba(10,10,12,0.9) 45%)`,
      display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8,
    }}>
      {/* bans row */}
      <div style={{ display: "flex", flexDirection: dir, gap: 6, alignItems: "center" }}>
        {Array.from({ length: 7 }).map((_, i) => {
          const h = bans[i];
          return (
            <div key={i} style={{ position: "relative", width: 46, height: 26, borderRadius: 4, overflow: "hidden", border: `1px solid ${accent}55`, background: "#1a1a1e", filter: h ? "grayscale(1) brightness(0.6)" : "none" }}>
              {h?.icon && <img src={h.icon} alt={h.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              {h && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#f43f5e", fontWeight: 900, fontSize: 18, textShadow: "0 0 4px #000" }}>✕</span>}
            </div>
          );
        })}
      </div>
      {/* picks row */}
      <div style={{ display: "flex", flexDirection: dir, gap: 8, alignItems: "flex-end" }}>
        {Array.from({ length: 5 }).map((_, i) => {
          const h = picks[i];
          return (
            <div key={i} style={{ width: 78, height: 100, borderRadius: 6, overflow: "hidden", border: `2px solid ${h ? accent : accent + "33"}`, background: "#15151a", boxShadow: h ? `0 0 10px ${accent}55` : "none", position: "relative" }}>
              {h?.portrait
                ? <img src={h.portrait} alt={h.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: accent + "66", fontSize: 22 }}>◆</div>}
              {h && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, fontSize: 8.5, fontWeight: 700, textAlign: "center", padding: "2px 1px", background: "rgba(0,0,0,0.7)", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Logo({ url, name, accent }: { url: string; name: string; accent: string }) {
  if (url) return <img src={url} alt={name} style={{ width: 54, height: 54, objectFit: "contain", borderRadius: 8 }} />;
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
  return <div style={{ width: 54, height: 54, borderRadius: 8, border: `2px solid ${accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: accent }}>{initials}</div>;
}
