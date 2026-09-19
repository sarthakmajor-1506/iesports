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
    case "ban":     // downward thud — triangle, not sawtooth: a sawtooth this
                    // low is a rasp on a phone speaker rather than a thud
      tone(t, 300, 0.2, { type: "triangle", gain: 0.09, to: 70 });
      break;
    case "correct": // major third, up
      tone(t, 660, 0.1, { type: "sine", gain: 0.1 });
      tone(t + 0.09, 990, 0.16, { type: "sine", gain: 0.1 });
      break;
    case "wrong":   // minor second, down — triangle for the same reason as `ban`
      tone(t, 300, 0.14, { type: "triangle", gain: 0.07 });
      tone(t + 0.1, 200, 0.2, { type: "triangle", gain: 0.06 });
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
  // The speaker governs the music too, which is most of what it is for now —
  // four 200ms cues were not worth a control in the header.
  if (m) teardown(); else if (phase) start(phase);
  listeners.forEach((fn) => fn(m));
}

/* ------------------------------------------------------------------ music */

/**
 * The bed under the game — a real track, or nothing at all.
 *
 * THERE IS NO SYNTHESISED FALLBACK ANY MORE, DELIBERATELY. There used to be:
 * two sawtooth oscillators a fifth apart under a sweeping lowpass, meant as
 * "the low tense hum a drafting screen wants". On a phone speaker a 55Hz
 * sawtooth is not atmosphere, it is a buzz, and it was reported as exactly
 * that. A game that hums unpleasantly is worse than a quiet one, so when there
 * is no track to play, nothing plays.
 *
 * ON THE REAL SOUNDTRACK. Dota 2's music is Valve's, composed under contract
 * and sold as a separate product on Steam. It cannot be ripped from the client
 * or a video host and served from a site that takes entry fees, so it is not
 * shipped here and never will be. What this does instead is play a file the
 * operator drops in:
 *
 *   public/draftlab/audio/menu.mp3    plays on the menu and between games
 *   public/draftlab/audio/draft.mp3   plays while a draft is on the clock
 *
 * Drop either file in and it is used immediately, at the volume below, with no
 * code change and no deploy of this file. A missing one is silent, not broken.
 */

export type MusicPhase = "menu" | "draft";

const TRACKS: Record<MusicPhase, string> = {
  menu: "/draftlab/audio/menu.mp3",
  draft: "/draftlab/audio/draft.mp3",
};
/** Deliberately well under the cues: this sits behind the game, not on it. */
const TRACK_VOLUME: Record<MusicPhase, number> = { menu: 0.22, draft: 0.3 };

let phase: MusicPhase | null = null;
let el: HTMLAudioElement | null = null;

function teardown() {
  if (el) {
    el.pause();
    el.src = "";
    el = null;
  }
}

function start(p: MusicPhase) {
  teardown();
  if (muted) return;
  if (typeof window === "undefined") return;

  const src = TRACKS[p];
  const a = new Audio(src);
  a.loop = true;
  a.volume = TRACK_VOLUME[p];
  a.preload = "auto";
  // A missing file is the expected case until someone licenses a track. It is
  // silence, not an error: nothing is logged and nothing is substituted.
  a.onerror = () => { if (el === a) el = null; };
  el = a;
  void a.play().catch(() => { if (el === a) el = null; });
}

/**
 * Start (or switch) the bed.
 *
 * Must be called from inside a tap: browsers will not let an AudioContext or an
 * <audio> element start before a gesture. Every call site here is a button, so
 * by the time this runs the gesture has already happened.
 */
export function startMusic(p: MusicPhase) {
  if (phase === p && el) return;
  phase = p;
  start(p);
}

export function stopMusic() {
  phase = null;
  teardown();
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

/* ------------------------------------------------------------------ sheet */

const THEME_KEY = "draft_sheet";
let night = false;
const themeListeners = new Set<(n: boolean) => void>();

/**
 * The theme is applied as an attribute on <html>, and the CSS keys off that.
 *
 * The obvious version — React state driving a className on the frame — was
 * subtly broken: the flag is read by two components (the frame and the toggle),
 * each held its own `useState`, and the server render has no localStorage, so
 * they hydrated with different values and disagreed about which way the switch
 * pointed. One attribute on the document has no such split: whoever sets it,
 * every rule in the sheet sees the same value on the next paint.
 *
 * Paper is the default now, and the preference moved to a new key. The old one
 * stored "light"/"dark" against the opposite meaning, so reusing it would have
 * opened everyone who had ever touched the switch in the wrong mode.
 */
function apply(n: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.draftTheme = n ? "night" : "paper";
}

export function isNight() { return night; }

export function setNight(n: boolean) {
  night = n;
  apply(n);
  try { localStorage.setItem(THEME_KEY, n ? "night" : "paper"); } catch {}
  themeListeners.forEach((fn) => fn(n));
}

/**
 * Reads the stored preference on mount rather than during render, so the server
 * and the first client paint always agree. The cost is one frame on paper before
 * a night player's choice lands, which is cheaper than the hydration mismatch
 * the alternative produced.
 */
export function useNight(): [boolean, (n: boolean) => void] {
  const [n, setN] = useState(night);
  useEffect(() => {
    let stored = false;
    try { stored = localStorage.getItem(THEME_KEY) === "night"; } catch { stored = false; }
    if (stored !== night) { night = stored; }
    apply(night);
    setN(night);
    themeListeners.add(setN);
    return () => { themeListeners.delete(setN); };
  }, []);
  return [n, useCallback((v: boolean) => setNight(v), [])];
}
