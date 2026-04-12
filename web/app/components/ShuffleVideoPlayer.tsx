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
const ENCODE_W = 1280;
const ENCODE_H = 720;

export default function ShuffleVideoPlayer({ tournamentName, teams, teamCount }: Props) {
  const playerRef = useRef<PlayerRef>(null);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  const membersPerTeam = teams.length > 0 ? teams[0].members.length : 5;
  const totalFrames = getShuffleDuration(teamCount, membersPerTeam);
  const durationSec = Math.round(totalFrames / FPS);

  const downloadMp4 = useCallback(async () => {
    if (recording) return;

    // Check browser support
    if (typeof VideoEncoder === "undefined") {
      alert("Your browser doesn't support video encoding. Please use Chrome 94+ or use screen recording.");
      return;
    }

    setRecording(true);
    setProgress(0);
    setStatus("Preparing...");

    try {
      const player = playerRef.current;
      const container = player?.getContainerNode();
      if (!player || !container) throw new Error("Player not ready");
      player.pause();

      const html2canvas = (await import("html2canvas")).default;
      const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
      const el = container as HTMLElement;

      // Capture every 6th frame for performance (interpolated during encode)
      const STEP = 6;
      const captureCount = Math.ceil(totalFrames / STEP);
      const captureScale = ENCODE_W / el.clientWidth;

      setStatus(`Capturing ${captureCount} keyframes...`);

      // Capture in batches to avoid memory pressure
      const BATCH = 50;
      const bitmaps: ImageBitmap[] = [];

      for (let k = 0; k < captureCount; k++) {
        const f = Math.min(k * STEP, totalFrames - 1);
        player.seekTo(f);
        // Wait for 2 animation frames to ensure render
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        try {
          const canvas = await html2canvas(el, {
            width: el.clientWidth, height: el.clientHeight,
            scale: captureScale, backgroundColor: "#0A0F2A", logging: false,
            useCORS: true, allowTaint: true,
          });
          bitmaps.push(await createImageBitmap(canvas));
        } catch (captureErr) {
          console.warn("Frame capture failed at", k, captureErr);
          // Reuse last good frame
          if (bitmaps.length > 0) bitmaps.push(bitmaps[bitmaps.length - 1]);
        }
        setProgress(Math.round(((k + 1) / captureCount) * 45));
        setStatus(`Capturing frame ${k + 1}/${captureCount}`);

        // Yield to UI every batch
        if (k % BATCH === 0 && k > 0) {
          await new Promise(r => setTimeout(r, 10));
        }
      }

      if (bitmaps.length === 0) throw new Error("No frames captured. Check browser console for CORS errors.");

      setStatus("Encoding video...");
      setProgress(46);

      // Use actual captured size (may differ from ENCODE_W/H)
      const encW = ENCODE_W;
      const encH = ENCODE_H;

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({ target, video: { codec: "avc", width: encW, height: encH }, fastStart: "in-memory" });
      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error("VideoEncoder error:", e),
      });

      // Try H.264 High, fallback to Baseline
      try {
        encoder.configure({ codec: "avc1.640028", width: encW, height: encH, bitrate: 5_000_000, framerate: FPS });
      } catch {
        encoder.configure({ codec: "avc1.42001e", width: encW, height: encH, bitrate: 3_000_000, framerate: FPS });
      }

      const offscreen = new OffscreenCanvas(ENCODE_W, ENCODE_H);
      const ctx = offscreen.getContext("2d")!;

      for (let i = 0; i < totalFrames; i++) {
        const bIdx = Math.min(Math.floor(i / STEP), bitmaps.length - 1);
        ctx.clearRect(0, 0, ENCODE_W, ENCODE_H);
        ctx.drawImage(bitmaps[bIdx], 0, 0, ENCODE_W, ENCODE_H);
        const vf = new VideoFrame(offscreen, { timestamp: (i / FPS) * 1_000_000, duration: (1 / FPS) * 1_000_000 });
        encoder.encode(vf, { keyFrame: i % 90 === 0 });
        vf.close();
        if (i % 30 === 0) {
          setProgress(46 + Math.round((i / totalFrames) * 50));
          setStatus(`Encoding ${Math.round((i / totalFrames) * 100)}%`);
          // Yield to UI periodically
          await new Promise(r => setTimeout(r, 0));
        }
      }

      setStatus("Finalizing...");
      await encoder.flush();
      muxer.finalize();
      bitmaps.forEach(b => b.close());

      const blob = new Blob([target.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tournamentName.replace(/\s+/g, "_")}_shuffle.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setProgress(100);
      setStatus("Done!");
    } catch (e: any) {
      console.error("MP4 export error:", e, e?.stack);
      const msg = e?.message || e?.name || (typeof e === "string" ? e : "Unknown error");
      alert("MP4 export failed: " + msg + "\n\nCheck browser console (F12) for details.\nTip: Use screen recording as an alternative (OBS or built-in screen recorder).");
    } finally {
      setRecording(false);
      setTimeout(() => setStatus(""), 3000);
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

      {/* Download + info */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
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
          <div style={{ flex: 1, minWidth: 100, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "#3CCBFF", borderRadius: 2, transition: "width 0.3s" }} />
            </div>
            {status && <div style={{ fontSize: "0.6rem", color: "#555" }}>{status}</div>}
          </div>
        )}
        {!recording && (
          <span style={{ fontSize: "0.62rem", color: "#555" }}>
            {teamCount} teams · {durationSec}s · 1280×720 · {status || "Use Chrome for best results"}
          </span>
        )}
      </div>
    </div>
  );
}
