"use client";

/**
 * Mounts the explainer on a tournament page.
 *
 * Uses @remotion/player rather than a rendered MP4 for the on-page version:
 * autoplay actually works (no codec or muted-autoplay policy to fight), it is
 * kilobytes instead of megabytes on a mobile connection, and it stays pixel-
 * accurate to the site because it shares the same theme tokens. The same
 * composition can be rendered to a real MP4 for WhatsApp and Instagram without
 * being written twice.
 *
 * It only starts once scrolled into view — an animation playing to nobody in a
 * background tab is wasted battery, and on a phone the Overview section is
 * often below the fold on load.
 */

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { TournamentExplainer, type ExplainerProps } from "./remotion/TournamentExplainer";
import { GAME_THEME, type GameKey } from "@/app/lib/gameTheme";

// The Player touches window on import, so it must not be server-rendered.
const Player = dynamic(() => import("@remotion/player").then(m => m.Player), { ssr: false });

const DURATION = 900; // 30s @ 30fps
const FPS = 30;

type Props = {
  game?: GameKey;
  tournament: any;
  finalTime?: string;
};

/** "2026-09-13T11:00:00+05:30" → "Sunday 13 September" */
function formatDayLabel(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
}

function formatShort(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export default function TournamentIntroVideo({ game = "cs2", tournament, finalTime = "17:00" }: Props) {
  const T = GAME_THEME[game];
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }),
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const inputProps: ExplainerProps = {
    game,
    tournamentName: tournament?.name || "Tournament",
    dateLabel: formatDayLabel(tournament?.startDate),
    prizePool: String(tournament?.prizePool || "").replace(/^₹/, "") || "0",
    entryFee: Number(tournament?.entryFee) || 0,
    totalSlots: Number(tournament?.totalSlots) || 20,
    deadlineLabel: formatShort(tournament?.registrationDeadline),
    finalTime,
  };

  return (
    <div ref={wrapRef} style={{ margin: "0 auto 28px", maxWidth: 400, width: "100%" }}>
      <div style={{
        position: "relative", borderRadius: 18, overflow: "hidden",
        border: `1px solid ${T.line}`, background: "#070707",
        boxShadow: `0 18px 60px rgba(0,0,0,.55)`,
      }}>
        {visible ? (
          <Player
            key={replayKey}
            component={TournamentExplainer as any}
            inputProps={inputProps as any}
            durationInFrames={DURATION}
            fps={FPS}
            compositionWidth={720}
            compositionHeight={900}
            autoPlay
            loop
            controls={false}
            style={{ width: "100%", display: "block" }}
          />
        ) : (
          // Reserve the exact aspect so nothing jumps when it mounts.
          <div style={{ width: "100%", aspectRatio: "720 / 900" }} />
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 9, gap: 10 }}>
        <span style={{ fontSize: 11.5, color: "#666" }}>How the tournament runs · 30s</span>
        <button onClick={() => setReplayKey(k => k + 1)} style={{
          background: "none", border: "1px solid #222", borderRadius: 100, padding: "5px 13px",
          color: "#888", fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
        }}>Replay</button>
      </div>
    </div>
  );
}
