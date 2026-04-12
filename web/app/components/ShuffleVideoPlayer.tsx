"use client";

import { useRef, useState, useCallback } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { ShuffleRevealComposition, getShuffleDuration } from "./remotion/ShuffleReveal";
import type { ShuffleTeam } from "./remotion/ShuffleReveal";

interface Props {
  tournamentName: string;
  teams: ShuffleTeam[];
  teamCount: number;
}

const FPS = 30;
const ENCODE_W = 1920;
const ENCODE_H = 1080;

export default function ShuffleVideoPlayer({ tournamentName, teams, teamCount }: Props) {
  const playerRef = useRef<PlayerRef>(null);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);

  const membersPerTeam = teams.length > 0 ? teams[0].members.length : 5;
  const totalFrames = getShuffleDuration(teamCount, membersPerTeam);

  const downloadMp4 = useCallback(async () => {
    if (recording) return;
    setRecording(true);
    setProgress(0);

    try {
      const player = playerRef.current;
      const container = player?.getContainerNode();
      if (!player || !container) throw new Error("Player not ready");
      player.pause();

      const html2canvas = (await import("html2canvas")).default;
      const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
      const el = container as HTMLElement;

      // Capture every 3rd frame
      const STEP = 3;
      const captureCount = Math.ceil(totalFrames / STEP);
      const captureScale = ENCODE_W / el.clientWidth;
      const bitmaps: ImageBitmap[] = [];

      for (let k = 0; k < captureCount; k++) {
        const f = Math.min(k * STEP, totalFrames - 1);
        player.seekTo(f);
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        const canvas = await html2canvas(el, {
          width: el.clientWidth, height: el.clientHeight,
          scale: captureScale, backgroundColor: "#0A0F2A", logging: false, useCORS: true,
        });
        bitmaps.push(await createImageBitmap(canvas));
        setProgress(Math.round(((k + 1) / captureCount) * 50));
      }

      // Encode
      const target = new ArrayBufferTarget();
      const muxer = new Muxer({ target, video: { codec: "avc", width: ENCODE_W, height: ENCODE_H }, fastStart: "in-memory" });
      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error("VideoEncoder error:", e),
      });
      encoder.configure({ codec: "avc1.640028", width: ENCODE_W, height: ENCODE_H, bitrate: 10_000_000, framerate: FPS });

      const offscreen = new OffscreenCanvas(ENCODE_W, ENCODE_H);
      const ctx = offscreen.getContext("2d")!;

      for (let i = 0; i < totalFrames; i++) {
        const bIdx = Math.min(Math.floor(i / STEP), bitmaps.length - 1);
        ctx.clearRect(0, 0, ENCODE_W, ENCODE_H);
        ctx.drawImage(bitmaps[bIdx], 0, 0, ENCODE_W, ENCODE_H);
        const vf = new VideoFrame(offscreen, { timestamp: (i / FPS) * 1_000_000, duration: (1 / FPS) * 1_000_000 });
        encoder.encode(vf, { keyFrame: i % 60 === 0 });
        vf.close();
        if (i % 10 === 0) setProgress(50 + Math.round((i / totalFrames) * 48));
      }

      await encoder.flush();
      muxer.finalize();
      bitmaps.forEach(b => b.close());

      const blob = new Blob([target.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tournamentName.replace(/\s+/g, "_")}_shuffle.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      setProgress(100);
    } catch (e: any) {
      console.error("MP4 export error:", e);
      alert("MP4 export failed: " + (e.message || "Unknown error. Try screen recording instead."));
    } finally {
      setRecording(false);
      playerRef.current?.play();
    }
  }, [recording, totalFrames, tournamentName]);

  return (
    <div>
      <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 30px rgba(0,0,0,0.5)" }}>
        <Player
          ref={playerRef}
          component={ShuffleRevealComposition as any}
          inputProps={{ tournamentName, game: "valorant" as const, teams }}
          durationInFrames={totalFrames}
          fps={FPS}
          compositionWidth={1920}
          compositionHeight={1080}
          style={{ width: "100%", aspectRatio: "16/9" }}
          controls
          autoPlay
        />
      </div>

      {/* Download button */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <button
          disabled={recording}
          onClick={downloadMp4}
          style={{
            padding: "8px 20px", borderRadius: 8, border: "1px solid rgba(60,203,255,0.3)",
            background: recording ? "rgba(60,203,255,0.05)" : "rgba(60,203,255,0.12)",
            color: recording ? "#555" : "#3CCBFF", fontSize: "0.78rem", fontWeight: 700,
            cursor: recording ? "default" : "pointer", fontFamily: "inherit",
          }}
        >
          {recording ? `Exporting... ${progress}%` : "Download MP4"}
        </button>
        {recording && (
          <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "#3CCBFF", borderRadius: 2, transition: "width 0.3s" }} />
          </div>
        )}
        {!recording && (
          <span style={{ fontSize: "0.62rem", color: "#555" }}>
            {teamCount} teams · {Math.round(totalFrames / FPS)}s · 1920×1080
          </span>
        )}
      </div>
    </div>
  );
}
