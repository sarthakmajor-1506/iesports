'use client';
import { COLORS } from '../data/colors';
import type { MatchState } from '../data/types';

export default function EconomyBar({ state, displayRound }: { state: MatchState; displayRound?: number }) {
  const round = displayRound ?? state.currentRound;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 20px',
      background: COLORS.bgRaised,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      marginBottom: 16,
      color: COLORS.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
        <span style={{ color: COLORS.textMuted, fontSize: 13 }}>Round</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{round} / 7</span>
      </div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
        <span style={{ color: COLORS.accent, fontWeight: 700 }}>YOU {state.playerScore}</span>
        <span style={{ color: COLORS.textDim }}>vs</span>
        <span style={{ color: COLORS.danger, fontWeight: 700 }}>AI {state.aiScore}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
        <span style={{ color: COLORS.textMuted, fontSize: 13 }}>Gold</span>
        <span style={{ color: COLORS.warning, fontWeight: 800, fontSize: 18 }}>
          {state.player.gold}
        </span>
      </div>
    </div>
  );
}
