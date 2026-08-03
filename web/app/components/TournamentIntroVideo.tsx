"use client";

/**
 * The explainer films, mounted on a tournament page.
 *
 * Two compositions: how the tournament works, and what else the entry buys.
 * On a phone they stack; on a desktop they sit side by side, which is the whole
 * reason the second film exists — a lone 4:5 frame on a 1440px viewport leaves
 * enormous dead space either side, and filling it with a second, shorter film
 * is better than stretching the first one or letting the gap sit empty.
 *
 * Played with @remotion/player rather than rendered MP4s: autoplay works with
 * no codec or muted-autoplay policy to fight, it costs kilobytes rather than
 * megabytes on a mobile connection, and both share the app's theme tokens so
 * they cannot drift from the UI. They only start once scrolled into view — an
 * animation playing to nobody is wasted battery.
 */

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { TournamentExplainer, type ExplainerProps } from "./remotion/TournamentExplainer";
import { PerksExplainer } from "./remotion/PerksExplainer";
import { GAME_THEME, type GameKey } from "@/app/lib/gameTheme";

const Player = dynamic(() => import("@remotion/player").then(m => m.Player), { ssr: false });

const MAIN_FRAMES = 900;   // 30s
const PERKS_FRAMES = 450;  // 15s — loops twice against the main film
const FPS = 30;

type Props = { game?: GameKey; tournament: any; finalTime?: string };

const dayLabel = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
};
const shortLabel = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
};

export default function TournamentIntroVideo({ game = "cs2", tournament, finalTime = "22:30" }: Props) {
  const T = GAME_THEME[game];
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(
      es => es.forEach(e => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }),
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const entryFee = Number(tournament?.entryFee) || 0;

  const mainProps: ExplainerProps = {
    game,
    tournamentName: tournament?.name || "Tournament",
    dateLabel: dayLabel(tournament?.startDate),
    prizePool: String(tournament?.prizePool || "").replace(/^₹/, "") || "0",
    entryFee,
    totalSlots: Number(tournament?.totalSlots) || 20,
    deadlineLabel: shortLabel(tournament?.registrationDeadline),
    finalTime,
  };

  const frame = (children: React.ReactNode) => (
    <div style={{
      position: "relative", borderRadius: 18, overflow: "hidden",
      border: `1px solid ${T.line}`, background: "#070707",
      boxShadow: "0 18px 60px rgba(0,0,0,.55)",
    }}>{children}</div>
  );

  return (
    <div ref={wrapRef} className="tiv-wrap">
      <style>{`
        .tiv-wrap { display:flex; flex-direction:column; gap:16px; align-items:center; margin:0 auto 30px; width:100%; }
        .tiv-col { width:100%; max-width:400px; }
        .tiv-cap { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:9px; }
        /* Side by side only when there is genuinely room for two 4:5 frames. */
        @media (min-width: 940px) {
          .tiv-wrap { flex-direction:row; align-items:flex-start; justify-content:center; gap:22px; max-width:900px; }
          .tiv-col { flex:1 1 0; max-width:420px; }
        }
      `}</style>

      {/* how it works */}
      <div className="tiv-col">
        {frame(visible ? (
          <Player
            key={`m${replay}`}
            component={TournamentExplainer as any}
            inputProps={mainProps as any}
            durationInFrames={MAIN_FRAMES}
            fps={FPS} compositionWidth={720} compositionHeight={900}
            autoPlay loop controls={false}
            style={{ width: "100%", display: "block" }}
          />
        ) : <div style={{ width: "100%", aspectRatio: "720 / 900" }} />)}
        <div className="tiv-cap">
          <span style={{ fontSize: 11.5, color: "#666" }}>How it works · 30s</span>
          <button onClick={() => setReplay(r => r + 1)} style={{
            background: "none", border: "1px solid #222", borderRadius: 100, padding: "5px 13px",
            color: "#888", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
          }}>Replay</button>
        </div>
      </div>

      {/* what else you get */}
      <div className="tiv-col">
        {frame(visible ? (
          <Player
            key={`p${replay}`}
            component={PerksExplainer as any}
            inputProps={{ game, entryFee } as any}
            durationInFrames={PERKS_FRAMES}
            fps={FPS} compositionWidth={720} compositionHeight={900}
            autoPlay loop controls={false}
            style={{ width: "100%", display: "block" }}
          />
        ) : <div style={{ width: "100%", aspectRatio: "720 / 900" }} />)}
        <div className="tiv-cap">
          <span style={{ fontSize: 11.5, color: "#666" }}>What else you get · 15s</span>
        </div>
      </div>
    </div>
  );
}
