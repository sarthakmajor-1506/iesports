"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { ShuffleRevealComposition, getShuffleDuration } from "./remotion/ShuffleReveal";
import type { ShuffleTeam } from "./remotion/ShuffleReveal";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

interface Props {
  tournamentName: string;
  teams: ShuffleTeam[];
  teamCount: number;
  /** Tournament ID — required for caching the rendered video to Firebase Storage. */
  tournamentId?: string;
  /** Existing Firebase Storage URL for this tournament's reel, if already rendered. */
  cachedVideoUrl?: string;
  /** Admin secret used to call /api/admin/save-shuffle-video after upload. */
  adminKey?: string;
  /** Fired after a successful upload + save so the parent can refresh state. */
  onCacheSaved?: (url: string) => void;
}

const FPS = 30;
const ENCODE_W = 1080;
const ENCODE_H = 1920;

export default function ShuffleVideoPlayer({
  tournamentName,
  teams,
  teamCount,
  tournamentId,
  cachedVideoUrl,
  adminKey,
  onCacheSaved,
}: Props) {
  const playerRef = useRef<PlayerRef>(null);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [localCachedUrl, setLocalCachedUrl] = useState<string | null>(cachedVideoUrl || null);

  // Sync prop → state when the parent updates the cached URL
  useEffect(() => {
    if (cachedVideoUrl) setLocalCachedUrl(cachedVideoUrl);
  }, [cachedVideoUrl]);

  const membersPerTeam = teams.length > 0 ? teams[0].members.length : 5;
  const totalFrames = getShuffleDuration(teamCount, membersPerTeam);
  const durationSec = Math.round(totalFrames / FPS);

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Fetch the cached file as a blob so the browser saves it instead of opening it
  // inline. Falls back to a direct URL download if CORS blocks the blob fetch.
  const downloadFromCache = useCallback(async () => {
    if (!localCachedUrl || recording) return;
    setRecording(true);
    setProgress(0);
    setStatus("Fetching cached video...");
    try {
      const res = await fetch(localCachedUrl);
      if (!res.ok) throw new Error(`storage fetch ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${tournamentName.replace(/\s+/g, "_")}_shuffle.mp4`);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setStatus("Done!");
      setProgress(100);
    } catch (e) {
      console.warn("[ShuffleVideoPlayer] cache fetch failed, falling back to direct URL:", e);
      triggerDownload(localCachedUrl, `${tournamentName.replace(/\s+/g, "_")}_shuffle.mp4`);
    } finally {
      setRecording(false);
      setTimeout(() => setStatus(""), 3000);
    }
  }, [localCachedUrl, recording, tournamentName]);

  const renderAndDownload = useCallback(async () => {
    if (recording) return;
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

      // ── Pre-load all avatar images ─────────────────────────────────────────
      // Without this, html2canvas captures the shuffle scene + early team-draft
      // frames before avatar URLs have actually been fetched, and either renders
      // missing-image placeholders or taints the canvas. Pre-loading warms the
      // browser cache so by the time we capture, every avatar is decoded.
      setStatus("Loading avatars...");
      const avatarUrls = Array.from(new Set(
        teams.flatMap(t => t.members.map(m => m.avatar)).filter(Boolean) as string[]
      ));
      await Promise.all(avatarUrls.map(url => new Promise<void>(resolve => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.referrerPolicy = "no-referrer";
        const done = () => resolve();
        img.onload = done;
        img.onerror = done; // a single broken avatar must not block the render
        img.src = url;
        // hard cap so a slow CDN can't stall the whole pipeline
        setTimeout(done, 4000);
      })));

      // html2canvas-pro is a maintained fork of html2canvas that correctly
      // traverses CSS `transform: scale()` and `marginLeft/Top` on parent
      // elements. The original v1.4.1 doesn't, which produced the
      // blue-screen / zoomed-in / missing-content bugs.
      const html2canvas = (await import("html2canvas-pro")).default;
      const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
      const el = container as HTMLElement;

      // ── Find Remotion's inner composition root ───────────────────────────
      // The Player nests the composition inside a div sized at the natural
      // composition dimensions (1080×1920) with `transform: scale(...)` to
      // fit the visible preview. We capture from THIS element rather than
      // the outer player container so the play/seek controls UI (a sibling
      // of the composition) is automatically excluded from the recording.
      const findCompositionRoot = (root: HTMLElement): HTMLElement | null => {
        const all = root.querySelectorAll<HTMLElement>("div");
        for (const node of Array.from(all)) {
          const w = parseFloat(node.style.width || "");
          const h = parseFloat(node.style.height || "");
          if (w === ENCODE_W && h === ENCODE_H) return node;
        }
        return null;
      };
      const compositionRoot = findCompositionRoot(el);
      if (!compositionRoot) {
        throw new Error("Could not locate Remotion composition root (width=" + ENCODE_W + "). Player DOM may have changed.");
      }

      // Capture every 2nd frame; each unique frame is duplicated in the encode pass.
      const STEP = 2;
      const captureCount = Math.ceil(totalFrames / STEP);

      setStatus(`Capturing ${captureCount} keyframes...`);

      const bitmaps: ImageBitmap[] = [];
      const BATCH = 50;

      for (let k = 0; k < captureCount; k++) {
        const f = Math.min(k * STEP, totalFrames - 1);
        player.seekTo(f);
        // 60ms gives Remotion time to reconcile + the browser to paint.
        // 2 RAFs (~32ms) was too short and produced black/missing-content frames.
        await new Promise<void>(r => setTimeout(r, 60));
        try {
          // html2canvas-pro reads the element's natural composition size
          // (1080×1920) through the parent transform and renders correctly.
          const canvas = await html2canvas(compositionRoot, {
            width: ENCODE_W,
            height: ENCODE_H,
            backgroundColor: "#0A0F2A",
            logging: false,
            useCORS: true,
            allowTaint: true,
          });
          bitmaps.push(await createImageBitmap(canvas));
        } catch (captureErr) {
          console.warn("Frame capture failed at", k, captureErr);
          if (bitmaps.length > 0) bitmaps.push(bitmaps[bitmaps.length - 1]);
        }
        setProgress(Math.round(((k + 1) / captureCount) * 45));
        setStatus(`Capturing frame ${k + 1}/${captureCount}`);
        if (k % BATCH === 0 && k > 0) {
          await new Promise(r => setTimeout(r, 10));
        }
      }

      if (bitmaps.length === 0) throw new Error("No frames captured. Check browser console for CORS errors.");

      setStatus("Encoding video...");
      setProgress(46);

      const encW = ENCODE_W;
      const encH = ENCODE_H;

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({ target, video: { codec: "avc", width: encW, height: encH }, fastStart: "in-memory" });
      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error("VideoEncoder error:", e),
      });

      try {
        encoder.configure({ codec: "avc1.640028", width: encW, height: encH, bitrate: 7_000_000, framerate: FPS });
      } catch {
        encoder.configure({ codec: "avc1.42001e", width: encW, height: encH, bitrate: 4_500_000, framerate: FPS });
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
          await new Promise(r => setTimeout(r, 0));
        }
      }

      setStatus("Finalizing...");
      await encoder.flush();
      muxer.finalize();
      bitmaps.forEach(b => b.close());

      const blob = new Blob([target.buffer], { type: "video/mp4" });

      // Trigger the local download immediately so the admin doesn't wait on the
      // upload before getting the file.
      const blobUrl = URL.createObjectURL(blob);
      triggerDownload(blobUrl, `${tournamentName.replace(/\s+/g, "_")}_shuffle.mp4`);

      // ── Cache the rendered video to Firebase Storage so future downloads
      //    skip the entire render pipeline and just fetch the file.
      if (tournamentId && adminKey) {
        try {
          setStatus("Uploading to cloud...");
          setProgress(98);
          const path = `tournament-videos/valorant/${tournamentId}.mp4`;
          const sref = storageRef(storage, path);
          await uploadBytes(sref, blob, {
            contentType: "video/mp4",
            customMetadata: { tournamentId, generatedAt: new Date().toISOString() },
          });
          const downloadUrl = await getDownloadURL(sref);

          const saveRes = await fetch("/api/admin/save-shuffle-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ adminKey, tournamentId, videoUrl: downloadUrl }),
          });
          if (!saveRes.ok) {
            const err = await saveRes.json().catch(() => ({}));
            throw new Error(err.error || `save failed (${saveRes.status})`);
          }

          setLocalCachedUrl(downloadUrl);
          onCacheSaved?.(downloadUrl);
          setStatus("Cached for instant downloads");
        } catch (uploadErr) {
          console.warn("[ShuffleVideoPlayer] cache upload failed:", uploadErr);
          setStatus("Done (cache failed — check console)");
        }
      } else {
        setStatus("Done!");
      }

      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
      setProgress(100);
    } catch (e: any) {
      console.error("MP4 export error:", e, e?.stack);
      const msg = e?.message || e?.name || (typeof e === "string" ? e : "Unknown error");
      alert("MP4 export failed: " + msg + "\n\nCheck browser console (F12) for details.\nTip: Use screen recording as an alternative (OBS or built-in screen recorder).");
    } finally {
      setRecording(false);
      setTimeout(() => setStatus(""), 4000);
      playerRef.current?.play();
    }
  }, [recording, totalFrames, tournamentName, teams, tournamentId, adminKey, onCacheSaved]);

  // Choose the primary action based on whether a cached video already exists
  const isCached = !!localCachedUrl;
  const onClickPrimary = isCached ? downloadFromCache : renderAndDownload;
  const primaryLabel = recording
    ? `Working... ${progress}%`
    : isCached
      ? "Download MP4 (cached)"
      : "Render & Download MP4";

  return (
    <div>
      <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 30px rgba(0,0,0,0.5)" }}>
        <Player
          ref={playerRef}
          component={ShuffleRevealComposition as any}
          inputProps={{ tournamentName, game: "valorant" as const, teams }}
          durationInFrames={totalFrames}
          fps={FPS}
          compositionWidth={1080}
          compositionHeight={1920}
          style={{ width: "100%", maxWidth: 540, margin: "0 auto", aspectRatio: "9/16" }}
          controls
          autoPlay
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <button
          disabled={recording}
          onClick={onClickPrimary}
          style={{
            padding: "8px 20px", borderRadius: 8,
            border: `1px solid ${isCached ? "rgba(120,255,180,0.35)" : "rgba(60,203,255,0.3)"}`,
            background: recording
              ? "rgba(60,203,255,0.05)"
              : isCached ? "rgba(120,255,180,0.12)" : "rgba(60,203,255,0.12)",
            color: recording ? "#555" : (isCached ? "#78FFB4" : "#3CCBFF"),
            fontSize: "0.78rem", fontWeight: 700,
            cursor: recording ? "default" : "pointer", fontFamily: "inherit",
          }}
        >
          {primaryLabel}
        </button>
        {isCached && !recording && (
          <button
            onClick={renderAndDownload}
            disabled={recording}
            title="Re-render and overwrite the cached file"
            style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid #333",
              background: "transparent", color: "#888",
              fontSize: "0.7rem", fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Re-render
          </button>
        )}
        {recording && (
          <div style={{ flex: 1, minWidth: 100, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: isCached ? "#78FFB4" : "#3CCBFF", borderRadius: 2, transition: "width 0.3s" }} />
            </div>
            {status && <div style={{ fontSize: "0.6rem", color: "#555" }}>{status}</div>}
          </div>
        )}
        {!recording && (
          <span style={{ fontSize: "0.62rem", color: "#555" }}>
            {teamCount} teams · {durationSec}s · 1080×1920 · {isCached ? "✓ cached" : (status || "First render takes ~1 min")}
          </span>
        )}
      </div>
    </div>
  );
}
