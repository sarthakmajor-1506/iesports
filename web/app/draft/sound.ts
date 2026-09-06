"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Draft — sound.
 *
 * Synthesised with the Web Audio API rather than shipped as files. Four short
 * cues do not justify four network requests and a few hundred KB on a phone, and
 * an oscillator envelope gives a cleaner, more consistent result at this length
 * than a compressed sample would.
 *
 * The context is created lazily on the first cue, because a browser will not let
 * one start before a user gesture — every call site here is inside a tap, so by
 * the time a sound is asked for the gesture has already happened.
 *
 * Muting persists. A game that makes noise is fine; a game that makes noise
 * again after you told it not to is not.
 */

type Cue = "pick" | "ban" | "correct" | "wrong" | "tick" | "win";

const KEY = "draft_muted";
let ctx: AudioContext | null = null;
let muted = false;
const listeners = new Set<(m: boolean) => void>();

if (typeof window !== "undefined") {
  try { muted = localStorage.getItem(KEY) === "1"; } catch { muted = false; }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One enveloped oscillator. `to` sweeps the pitch, which is what sells a whoosh. */
function tone(
  at: number, freq: number, dur: number,
  { type = "sine", gain = 0.12, to }: { type?: OscillatorType; gain?: number; to?: number } = {}
) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const amp = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + dur);
  // A tiny attack instead of an instant one — a hard start clicks on phone speakers.
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(amp).connect(a.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

export function play(cue: Cue) {
  if (muted) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  switch (cue) {
    case "pick":    // soft upward whoosh
      tone(t, 220, 0.16, { type: "sine", gain: 0.09, to: 660 });
      tone(t + 0.01, 880, 0.1, { type: "triangle", gain: 0.05 });
      break;
    case "ban":     // downward thud
      tone(t, 300, 0.2, { type: "sawtooth", gain: 0.08, to: 70 });
      break;
    case "correct": // major third, up
      tone(t, 660, 0.1, { type: "sine", gain: 0.1 });
      tone(t + 0.09, 990, 0.16, { type: "sine", gain: 0.1 });
      break;
    case "wrong":   // minor second, down
      tone(t, 300, 0.14, { type: "square", gain: 0.06 });
      tone(t + 0.1, 200, 0.2, { type: "square", gain: 0.05 });
      break;
    case "tick":    // clock, last seconds
      tone(t, 1400, 0.04, { type: "square", gain: 0.035 });
      break;
    case "win":     // little fanfare
      [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.09, f, 0.26, { type: "triangle", gain: 0.09 }));
      break;
  }
}

export function isMuted() { return muted; }

export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(KEY, m ? "1" : "0"); } catch {}
  listeners.forEach((fn) => fn(m));
}

/** Subscribes a component to the mute flag so every speaker icon agrees. */
export function useMuted(): [boolean, (m: boolean) => void] {
  const [m, setM] = useState(muted);
  useEffect(() => {
    setM(muted);
    listeners.add(setM);
    return () => { listeners.delete(setM); };
  }, []);
  const set = useCallback((v: boolean) => { setMuted(v); if (!v) play("pick"); }, []);
  return [m, set];
}

/* ------------------------------------------------------------------ theme */

const THEME_KEY = "draft_theme";
let light = false;
const themeListeners = new Set<(l: boolean) => void>();

/**
 * The theme is applied as an attribute on <html>, and the CSS keys off that.
 *
 * The obvious version — React state driving a className on the frame — was
 * subtly broken: the flag is read by two components (the frame and the toggle),
 * each held its own `useState`, and the server render has no localStorage, so
 * they hydrated with different values and disagreed about which way the switch
 * pointed. One attribute on the document has no such split: whoever sets it,
 * every rule in the sheet sees the same value on the next paint.
 */
function apply(l: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.draftTheme = l ? "light" : "dark";
}

export function isLight() { return light; }

export function setLight(l: boolean) {
  light = l;
  apply(l);
  try { localStorage.setItem(THEME_KEY, l ? "light" : "dark"); } catch {}
  themeListeners.forEach((fn) => fn(l));
}

/**
 * Reads the stored preference on mount rather than during render, so the server
 * and the first client paint always agree. The cost is one frame in the default
 * theme before a light-mode player's choice lands, which is cheaper than the
 * hydration mismatch the alternative produced.
 */
export function useLight(): [boolean, (l: boolean) => void] {
  const [l, setL] = useState(light);
  useEffect(() => {
    let stored = false;
    try { stored = localStorage.getItem(THEME_KEY) === "light"; } catch { stored = false; }
    if (stored !== light) { light = stored; }
    apply(light);
    setL(light);
    themeListeners.add(setL);
    return () => { themeListeners.delete(setL); };
  }, []);
  return [l, useCallback((v: boolean) => setLight(v), [])];
}
