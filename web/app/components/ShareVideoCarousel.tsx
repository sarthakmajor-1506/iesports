"use client";
import React, { useState, useRef, useCallback } from "react";
import { Player, PlayerRef } from "@remotion/player";
import {
  ShareSlideComposition,
  type ShareSlideData,
} from "./remotion/ShareSlide";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Copy,
  Video,
  Loader2,
} from "lucide-react";

const SLIDES = [
  { type: "overview", label: "Tournament Overview", emoji: "\u{1F3AF}", desc: "Key stats & info" },
  { type: "register", label: "How to Register", emoji: "\u{1F4DD}", desc: "Solo registration" },
  { type: "ranks", label: "Ranks & Maps", emoji: "\u{1F3AF}", desc: "Eligible ranks & map pool" },
  { type: "teams", label: "Team Structure", emoji: "\u{1F465}", desc: "Format & roster" },
  { type: "format", label: "Format & Flow", emoji: "\u2694\uFE0F", desc: "Signup to champion" },
];

const FPS = 30;
const DURATION_FRAMES = 300; // 10 seconds at 30fps

interface ShareVideoCarouselProps {
  tournament: ShareSlideData;
  tournamentId: string;
  onToast: () => void;
  game?: "valorant" | "dota2";
}

export default function ShareVideoCarousel({
  tournament,
  tournamentId,
  onToast,
  game = "valorant",
}: ShareVideoCarouselProps) {
  const [slideIdx, setSlideIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const playerRef = useRef<PlayerRef>(null);
  const current = SLIDES[slideIdx] || SLIDES[0];

  // Download static PNG from the existing API route
  const [downloading, setDownloading] = useState(false);
  const downloadPng = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const src = `/api/valorant/share-image?tournamentId=${tournamentId}&type=${current.type}&game=${game}`;
      const res = await fetch(src);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = `${(tournament.name || "tournament").replace(/\s+/g, "_")}_${current.type}.png`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      // Delay revoke so browser can start the download
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      console.error("Image download failed:", err);
    } finally {
      setDownloading(false);
    }
  }, [tournamentId, current.type, tournament.name, downloading]);

  // Copy image to clipboard
  const [copying, setCopying] = useState(false);
  const copyImg = useCallback(async () => {
    if (copying) return;
    setCopying(true);
    try {
      const src = `/api/valorant/share-image?tournamentId=${tournamentId}&type=${current.type}&game=${game}`;
      const res = await fetch(src);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const blob = await res.blob();
      // clipboard.write needs image/png specifically
      const pngBlob = blob.type === "image/png" ? blob : new Blob([await blob.arrayBuffer()], { type: "image/png" });
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);
      onToast();
    } catch (err) {
      console.error("Copy image failed:", err);
      try { await navigator.clipboard.writeText(window.location.href); } catch {}
      onToast();
    } finally {
      setCopying(false);
    }
  }, [tournamentId, current.type, onToast, copying]);

  // MP4 video recording using WebCodecs VideoEncoder + mp4-muxer
  // Captures every 3rd frame via html2canvas, encodes H.264, outputs .mp4
  const CAPTURE_STEP = 3;
  const CAPTURE_COUNT = Math.ceil(DURATION_FRAMES / CAPTURE_STEP);
  const ENCODE_SIZE = 1080;

  const recordVideo = useCallback(async () => {
    if (recording) return;
    setRecording(true);
    setRecordProgress(0);

    try {
      const player = playerRef.current;
      const container = player?.getContainerNode();
      if (!player || !container) throw new Error("Player not ready");

      player.pause();
      const html2canvas = (await import("html2canvas")).default;
      const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
      const el = container as HTMLElement;
      const captureScale = ENCODE_SIZE / el.clientWidth;

      // ── Phase 1: Capture keyframes as ImageBitmaps ──
      const frameBitmaps: ImageBitmap[] = [];

      for (let k = 0; k < CAPTURE_COUNT; k++) {
        const f = k * CAPTURE_STEP;
        player.seekTo(Math.min(f, DURATION_FRAMES - 1));

        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r()))
        );

        const captured = await html2canvas(el, {
          width: el.clientWidth,
          height: el.clientHeight,
          scale: captureScale,
          backgroundColor: "#08060e",
          logging: false,
          useCORS: true,
        });

        const bitmap = await createImageBitmap(captured);
        frameBitmaps.push(bitmap);
        setRecordProgress(Math.round(((k + 1) / CAPTURE_COUNT) * 50));
      }

      // ── Phase 2: Encode to MP4 using WebCodecs + mp4-muxer ──
      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: {
          codec: "avc",
          width: ENCODE_SIZE,
          height: ENCODE_SIZE,
        },
        fastStart: "in-memory",
      });

      const encoder = new VideoEncoder({
        output: (chunk, meta) => {
          muxer.addVideoChunk(chunk, meta);
        },
        error: (e) => console.error("VideoEncoder error:", e),
      });

      encoder.configure({
        codec: "avc1.640028", // H.264 High Profile Level 4.0
        width: ENCODE_SIZE,
        height: ENCODE_SIZE,
        bitrate: 8_000_000,
        framerate: FPS,
      });

      // Draw each frame to an offscreen canvas and encode
      const offscreen = new OffscreenCanvas(ENCODE_SIZE, ENCODE_SIZE);
      const ctx = offscreen.getContext("2d")!;

      for (let i = 0; i < DURATION_FRAMES; i++) {
        const bitmapIdx = Math.min(
          Math.floor(i / CAPTURE_STEP),
          frameBitmaps.length - 1
        );
        ctx.clearRect(0, 0, ENCODE_SIZE, ENCODE_SIZE);
        ctx.drawImage(frameBitmaps[bitmapIdx], 0, 0, ENCODE_SIZE, ENCODE_SIZE);

        const frame = new VideoFrame(offscreen, {
          timestamp: (i * 1_000_000) / FPS, // microseconds
          duration: 1_000_000 / FPS,
        });

        const keyFrame = i % (FPS * 2) === 0; // keyframe every 2 seconds
        encoder.encode(frame, { keyFrame });
        frame.close();

        // Flush periodically to prevent memory buildup
        if (i % 30 === 29) await encoder.flush();

        setRecordProgress(50 + Math.round(((i + 1) / DURATION_FRAMES) * 48));
      }

      await encoder.flush();
      encoder.close();
      muxer.finalize();

      frameBitmaps.forEach((b) => b.close());

      const mp4Blob = new Blob([target.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(mp4Blob);
      const a = document.createElement("a");
      a.download = `${(tournament.name || "tournament").replace(/\s+/g, "_")}_${current.type}.mp4`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);

      player.seekTo(0);
      player.play();
      setRecordProgress(100);
    } catch (err) {
      console.error("Video recording failed:", err);
      downloadPng();
    } finally {
      setRecording(false);
      setRecordProgress(0);
    }
  }, [recording, current.type, tournament.name, downloadPng]);

  return (
    <div className="vtd-share-carousel">
      {/* Animated Player */}
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: 12,
          overflow: "hidden",
          background: "#08060e",
          position: "relative",
        }}
      >
        <Player
          key={slideIdx}
          ref={playerRef}
          component={ShareSlideComposition}
          inputProps={{ tournament, type: current.type }}
          durationInFrames={DURATION_FRAMES}
          fps={FPS}
          compositionWidth={1080}
          compositionHeight={1080}
          autoPlay
          loop
          style={{ width: "100%", height: "100%" }}
          controls={false}
        />

        {/* Recording overlay with progress */}
        {recording && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(8,6,14,0.75)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              zIndex: 10,
              borderRadius: 12,
            }}
          >
            <Loader2
              size={28}
              style={{ color: "#3CCBFF", animation: "spin 1s linear infinite" }}
            />
            <div style={{ color: "#fff", fontSize: "0.85rem", fontWeight: 700 }}>
              {recordProgress < 85 ? "Capturing frames..." : "Encoding video..."}
            </div>
            {/* Progress bar */}
            <div
              style={{
                width: "60%",
                height: 4,
                borderRadius: 2,
                background: "rgba(255,255,255,0.1)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${recordProgress}%`,
                  height: "100%",
                  borderRadius: 2,
                  background: "linear-gradient(90deg, #3CCBFF, #8b5cf6)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.7rem" }}>
              {recordProgress}%
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="vtd-share-carousel-nav">
        <button
          className="vtd-share-carousel-btn"
          disabled={slideIdx === 0}
          onClick={() => setSlideIdx((s) => Math.max(0, s - 1))}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="vtd-share-carousel-center">
          <span className="vtd-share-carousel-label">
            {current.emoji} {current.label}
          </span>
          <div
            style={{
              fontSize: "0.65rem",
              color: "#555550",
              marginBottom: 4,
            }}
          >
            {current.desc}
          </div>
          <div className="vtd-share-carousel-dots">
            {SLIDES.map((_, i) => (
              <div
                key={i}
                className={`vtd-share-carousel-dot${i === slideIdx ? " active" : ""}`}
                onClick={() => setSlideIdx(i)}
                style={{ cursor: "pointer" }}
              />
            ))}
          </div>
        </div>
        <button
          className="vtd-share-carousel-btn"
          disabled={slideIdx === SLIDES.length - 1}
          onClick={() => setSlideIdx((s) => Math.min(SLIDES.length - 1, s + 1))}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Actions */}
      <div className="vtd-share-carousel-actions">
        <button
          className="vtd-share-img-btn dl"
          onClick={downloadPng}
          disabled={downloading}
          style={downloading ? { opacity: 0.6, cursor: "not-allowed" } : {}}
        >
          {downloading ? (
            <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Download size={11} />
          )}
          {downloading ? "Downloading..." : "Image"}
        </button>
        <button
          className="vtd-share-img-btn dl"
          onClick={recordVideo}
          disabled={recording}
          style={recording ? { opacity: 0.6, cursor: "not-allowed" } : {}}
        >
          {recording ? (
            <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Video size={11} />
          )}
          {recording ? `${recordProgress}%` : "Video"}
        </button>
        <button
          className="vtd-share-img-btn cp"
          onClick={copyImg}
          disabled={copying}
          style={copying ? { opacity: 0.6, cursor: "not-allowed" } : {}}
        >
          {copying ? (
            <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Copy size={11} />
          )}
          {copying ? "Copying..." : "Copy"}
        </button>
      </div>
    </div>
  );
}
