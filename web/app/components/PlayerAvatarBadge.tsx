"use client";

/**
 * PlayerAvatarBadge — wraps any player avatar with the Crown (current
 * bracket MVP) or Trophy (current tournament champion) icon when the
 * underlying user doc has those honor fields set.
 *
 * Honor fields live on the user doc (see lib/types.ts → User, fields
 * `mvpBracket`, `isChampion`, `honorTournamentId`) and are stamped /
 * cleared by scripts/markTournamentHonors.ts at the end of every
 * tournament. They are explicitly point-in-time, not cumulative.
 *
 * Trophy beats Crown — a champion who is also bracket MVP shows the trophy.
 *
 * Usage:
 *   <PlayerAvatarBadge
 *     mvpBracket={user.mvpBracket}
 *     isChampion={user.isChampion}
 *     size={96}
 *   >
 *     <img src={avatarUrl} ... />
 *   </PlayerAvatarBadge>
 */

import React from "react";

export interface PlayerAvatarBadgeProps {
  mvpBracket?: string | null;
  isChampion?: boolean | null;
  /** Avatar visual size in pixels. The icon is scaled relative to this. */
  size: number;
  children: React.ReactNode;
  /** Optional override for icon size — defaults to ~38% of the avatar. */
  iconSize?: number;
  /** If true, the icon is anchored at the top edge of the avatar instead of
   * floating above. Use for tight layouts where headroom is scarce. */
  inset?: boolean;
  /** Tooltip override (defaults to a sensible auto string). */
  title?: string;
}

const ICON_COLOR = "#FFD700";
const ICON_GLOW = "rgba(255,215,0,0.7)";

function Crown({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 32 28" fill="none" style={{ filter: `drop-shadow(0 0 6px ${ICON_GLOW}) drop-shadow(0 2px 4px rgba(0,0,0,0.6))` }}>
      <path
        d="M3 22 L1 6 L9 12 L16 2 L23 12 L31 6 L29 22 Z"
        fill={ICON_COLOR}
        stroke="#fff"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <rect x="3" y="22" width="26" height="4" rx="1" fill={ICON_COLOR} stroke="#fff" strokeWidth={1.5} />
      <circle cx="16" cy="2" r="1.8" fill="#fff" />
      <circle cx="1" cy="6" r="1.6" fill="#fff" />
      <circle cx="31" cy="6" r="1.6" fill="#fff" />
    </svg>
  );
}

function Trophy({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ filter: `drop-shadow(0 0 6px ${ICON_GLOW}) drop-shadow(0 2px 4px rgba(0,0,0,0.6))` }}>
      <path
        d="M9 4 H23 V11 C23 16 20 19 16 19 C12 19 9 16 9 11 Z"
        fill={ICON_COLOR}
        stroke="#fff"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <path d="M9 7 C5 7 4 9 4 11 C4 13 6 14 8 14" stroke={ICON_COLOR} strokeWidth={2} fill="none" strokeLinecap="round" />
      <path d="M23 7 C27 7 28 9 28 11 C28 13 26 14 24 14" stroke={ICON_COLOR} strokeWidth={2} fill="none" strokeLinecap="round" />
      <rect x="14" y="19" width="4" height="4" fill={ICON_COLOR} stroke="#fff" strokeWidth={1.2} />
      <rect x="10" y="23" width="12" height="3" rx="1" fill={ICON_COLOR} stroke="#fff" strokeWidth={1.2} />
      <rect x="8" y="26" width="16" height="3" rx="1" fill={ICON_COLOR} stroke="#fff" strokeWidth={1.2} />
    </svg>
  );
}

export function PlayerAvatarBadge({
  mvpBracket,
  isChampion,
  size,
  children,
  iconSize,
  inset = false,
  title,
}: PlayerAvatarBadgeProps) {
  const showTrophy = !!isChampion;
  const showCrown = !showTrophy && !!mvpBracket;
  const honored = showTrophy || showCrown;
  const computedIconSize = iconSize ?? Math.max(14, Math.round(size * 0.42));

  // Auto tooltip — admin can pass `title` to override.
  const autoTitle = showTrophy
    ? "Last tournament champion"
    : showCrown
      ? `${mvpBracket} bracket MVP last tournament`
      : undefined;

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        // Reserve headroom for the badge so it doesn't get clipped by parent
        // overflow. Caller's existing margin compensation should account for
        // this when laying things out.
        // We don't add padding because that would shift the avatar — instead
        // the badge floats above with a negative top.
      }}
      title={title ?? autoTitle}
    >
      {children}
      {honored && (
        <div
          style={{
            position: "absolute",
            top: inset ? -Math.round(computedIconSize * 0.35) : -Math.round(computedIconSize * 0.7),
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          {showTrophy ? <Trophy size={computedIconSize} /> : <Crown size={computedIconSize} />}
        </div>
      )}
    </div>
  );
}
