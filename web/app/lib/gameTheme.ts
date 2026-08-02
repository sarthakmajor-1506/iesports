// Per-game accent palette.
//
// Each game keeps the hue it already owned on the site — Valorant cyan, CS2
// amber, Dota red — but saturated and lifted so it reads as a light source on a
// near-black background rather than a muted UI tint. `acc2` is the darker stop
// for the vertical gradient on primary buttons; `ctaFg` is a very dark tint of
// the accent rather than pure black, so the label sits in the same colour
// family as the button instead of punching a hole in it.

export type GameKey = "valorant" | "cs2" | "dota2";

export type GameTheme = {
  label: string;
  acc: string;    // primary accent
  acc2: string;   // gradient end / pressed state
  ctaFg: string;  // text on a filled accent button
  soft: string;   // accent at low alpha — chips, tinted panels
  line: string;   // accent at mid alpha — borders that should glow slightly
  glow: string;   // box-shadow colour under primary buttons
};

export const GAME_THEME: Record<GameKey, GameTheme> = {
  valorant: {
    label: "VALORANT",
    acc: "#3CE0FF",
    acc2: "#0FA3DC",
    ctaFg: "#04141c",
    soft: "rgba(60,224,255,0.12)",
    line: "rgba(60,224,255,0.30)",
    glow: "rgba(60,224,255,0.30)",
  },
  cs2: {
    label: "CS2",
    acc: "#FFB627",
    acc2: "#E08703",
    ctaFg: "#1c1200",
    soft: "rgba(255,182,39,0.12)",
    line: "rgba(255,182,39,0.30)",
    glow: "rgba(255,182,39,0.28)",
  },
  dota2: {
    label: "DOTA 2",
    acc: "#FF5340",
    acc2: "#C4271A",
    ctaFg: "#1e0603",
    soft: "rgba(255,83,64,0.12)",
    line: "rgba(255,83,64,0.30)",
    glow: "rgba(255,83,64,0.28)",
  },
};

/** Shared neutrals, so surfaces stay consistent across the three games. */
export const UI = {
  bg: "#080808",
  surface: "#0e0e0e",
  surfaceAlt: "#0a0a0a",
  border: "#1a1a1a",
  borderSoft: "#141414",
  borderHover: "#2a2a2a",
  text: "#fff",
  dim: "#8a8a8a",
  dimmer: "#777",
  faint: "#555",
  ok: "#4ade80",
  warn: "#fbbf24",
  bad: "#f87171",
};
