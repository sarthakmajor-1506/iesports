'use client';
import { COLORS } from '../data/colors';
import { ZONES, ZONE_LABELS, SITES } from '../data/zones';
import type { Zone } from '../data/zones';
import type { MatchState, PositionAction } from '../data/types';
import { getAgent } from '../data/agents';

interface Props {
  state: MatchState;
  onAction: (action: PositionAction) => Promise<void>;
  onPlay: () => Promise<void>;
  busy: boolean;
}

export default function PositionPanel({ state, onAction, onPlay, busy }: Props) {
  const allPositioned = state.player.roster.every(s => s.zone != null);
  const needsFocus = state.playerRole === 'attacker';
  const focusOK = !needsFocus || state.focusSite != null;
  const ready = allPositioned && focusOK && state.player.roster.length > 0;

  return (
    <div style={{
      background: COLORS.bgRaised,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      padding: 16,
      color: COLORS.text,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700,
        color: COLORS.textMuted, letterSpacing: '0.1em',
        marginBottom: 8,
      }}>
        POSITION YOUR AGENTS
      </div>
      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
        {state.playerRole === 'attacker'
          ? 'Pick zones to start. All your agents will advance toward the FOCUS site each tick.'
          : 'Pick zones to defend. Defenders stay put — the AI attacker will come to you.'}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {state.player.roster.map((slot, idx) => {
          const agent = getAgent(slot.agentId);
          return (
            <div key={idx} style={{
              display: 'grid',
              gridTemplateColumns: '160px 1fr',
              gap: 12, alignItems: 'center',
              padding: 8,
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 4,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={agent.iconUrl} alt="" style={{
                  width: 32, height: 32, borderRadius: 4,
                  background: COLORS.bgRaised, objectFit: 'cover',
                }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{agent.name}</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>
                    {agent.role}
                    {slot.zone && (
                      <span style={{ marginLeft: 8, color: COLORS.accent, fontWeight: 700 }}>
                        → {ZONE_LABELS[slot.zone]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {ZONES.map(z => (
                  <button
                    key={z}
                    onClick={() => onAction({ kind: 'set_zone', slotIdx: idx, zone: z })}
                    disabled={busy || slot.zone === z}
                    style={{
                      flex: 1, padding: '8px 0',
                      background: slot.zone === z ? COLORS.accent : 'transparent',
                      color: slot.zone === z ? COLORS.bg : COLORS.textMuted,
                      border: `1px solid ${slot.zone === z ? COLORS.accent : COLORS.border}`,
                      borderRadius: 3,
                      fontWeight: 700, fontSize: 11,
                      cursor: busy || slot.zone === z ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {z}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {needsFocus && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: COLORS.warning, letterSpacing: '0.1em',
            marginBottom: 8,
          }}>
            FOCUS SITE (where you push)
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {SITES.map(site => (
              <button
                key={site}
                onClick={() => onAction({ kind: 'set_focus', site })}
                disabled={busy}
                style={{
                  flex: 1, padding: '12px 0',
                  background: state.focusSite === site ? COLORS.warning : 'transparent',
                  color: state.focusSite === site ? COLORS.bg : COLORS.warning,
                  border: `2px solid ${COLORS.warning}`,
                  borderRadius: 4,
                  fontWeight: 800, fontSize: 13,
                  cursor: busy ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {site} SITE
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: ready ? COLORS.success : COLORS.textMuted }}>
          {ready ? '✓ Ready to engage'
            : !allPositioned ? `${state.player.roster.filter(s => s.zone == null).length} agent(s) unpositioned`
            : `Pick a focus site`}
        </div>
        <button
          onClick={onPlay}
          disabled={!ready || busy}
          style={{
            padding: '10px 28px',
            background: ready ? COLORS.accent : COLORS.bgHover,
            color: ready ? COLORS.bg : COLORS.textDim,
            border: 'none', borderRadius: 4,
            fontWeight: 800, fontSize: 14, letterSpacing: '0.05em',
            cursor: ready && !busy ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? '...' : 'BATTLE →'}
        </button>
      </div>
    </div>
  );
}
