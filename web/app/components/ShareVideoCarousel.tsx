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
  { type: "schedule", label: "Schedule", emoji: "\u{1F4C5}", desc: "Key dates & times" },
  { type: "format", label: "Format & Flow", emoji: "\u2694\uFE0F", desc: "Signup to champion" },
];

const FPS = 30;
const DURATION_FRAMES = 150; // 5 seconds

interface ShareVideoCarouselProps {
  tournament: ShareSlideData;
  tournamentId: string;
  onToast: () => void;
}

export default function ShareVideoCarousel({
  tournament,
  tournamentId,
  onToast,
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
      const src = `/api/valorant/share-image?tournamentId=${tournamentId}&type=${current.type}`;
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
      const src = `/api/valorant/share-image?tournamentId=${tournamentId}&type=${current.type}`;
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

  // Two-phase video recording:
  // Phase 1: Capture all frames as ImageBitmaps (slow but accurate)
  // Phase 2: Encode at constant framerate using captureStream(0) + requestFrame()
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

      // ── Phase 1: Capture every frame as an ImageBitmap ──
      const frameBitmaps: ImageBitmap[] = [];

      for (let f = 0; f < DURATION_FRAMES; f++) {
        player.seekTo(f);

        // Wait for React to commit the render (double-rAF is more reliable than setTimeout)
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r()))
        );

        const captured = await html2canvas(container as HTMLElement, {
          width: (container as HTMLElement).clientWidth,
          height: (container as HTMLElement).clientHeight,
          scale: 1080 / (container as HTMLElement).clientWidth,
          backgroundColor: "#08060e",
          logging: false,
          useCORS: true,
        });

        const bitmap = await createImageBitmap(captured);
        frameBitmaps.push(bitmap);
        setRecordProgress(Math.round(((f + 1) / DURATION_FRAMES) * 85));
      }

      // ── Phase 2: Encode at constant framerate ──
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d")!;

      // captureStream(0) = manual frame push via requestFrame()
      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0];

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
        videoBitsPerSecond: 8_000_000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const done = new Promise<Blob>((resolve) => {
        recorder.onstop = () =>
          resolve(new Blob(chunks, { type: recorder.mimeType }));
      });

      recorder.start();

      for (let i = 0; i < frameBitmaps.length; i++) {
        ctx.clearRect(0, 0, 1080, 1080);
        ctx.drawImage(frameBitmaps[i], 0, 0, 1080, 1080);

        // Push this exact frame to the stream
        if ("requestFrame" in track) {
          (track as any).requestFrame();
        }

        // Hold for exactly one frame duration so MediaRecorder encodes at constant fps
        await new Promise((r) => setTimeout(r, 1000 / FPS));
        setRecordProgress(85 + Math.round(((i + 1) / frameBitmaps.length) * 15));
      }

      recorder.stop();
      const blob = await done;

      // Cleanup bitmaps
      frameBitmaps.forEach((b) => b.close());

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = `${(tournament.name || "tournament").replace(/\s+/g, "_")}_${current.type}.webm`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);

      // Resume playback
      player.seekTo(0);
      player.play();
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
          ref={playerRef}
          component={ShareSlideComposition}
          inputProps={{ tournament, type: current.type }}
          durationInFrames={DURATION_FRAMES}
          fps={FPS}
          compositionWidth={1080}
          compositionHeight={1080}
          loop
          autoPlay
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
              style={{ color: "#ff4655", animation: "spin 1s linear infinite" }}
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
                  background: "linear-gradient(90deg, #ff4655, #8b5cf6)",
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
