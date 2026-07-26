// v7: square map container so zones land on Haven's actual bombsites in
// the displayIcon. Riot callout labels overlay the map at known places.
'use client';
import { COLORS } from '../data/colors';
import { ZONE_LABELS } from '../data/zones';
import { HAVEN_MINIMAP_URL } from '../data/maps';
import {
  HAVEN_ZONE_POS, SITE_MARKER_R, HAVEN_CALLOUTS,
  ATTACKER_SPAWN_POS, DEFENDER_SPAWN_POS,
} from '../data/havenLayout';
import type { Zone } from '../data/zones';
import type { AgentSlot, Side, TeamRole } from '../data/types';
import { useViewport } from '../lib/useViewport';
import { getAgent } from '../data/agents';
import { getArmor } from '../data/armors';
import { getUtility } from '../data/utilities';

interface Props {
  playerRoster: AgentSlot[];
  aiRoster: AgentSlot[];
  playerRole: TeamRole | null;
  focusSite: Zone | null;
  showAi: boolean;
}

const STAGE_SIZE_DESKTOP = 640;
const STAGE_SIZE_MOBILE = 320;
const PORTRAIT_SIZE_DESKTOP = 38;
const PORTRAIT_SIZE_MOBILE = 28;
const HP_BAR_W_DESKTOP = 44;
const HP_BAR_W_MOBILE = 32;
const ROW_GAP = 8;
const COL_GAP = 5;

const ZONES_ORDER: Zone[] = ['A', 'B', 'C', 'Mid'];

function maxHpFor(slot: AgentSlot): number {
  const agent = getAgent(slot.agentId);
  const armor = getArmor(slot.armorId);
  let max = agent.baseHp + armor.hpBonus;
  if (slot.utilityId && getUtility(slot.utilityId).effect === 'heal_30') max += 15;
  return max;
}

export default function MapView({
  playerRoster, aiRoster, playerRole, focusSite, showAi,
}: Props) {
  const { isMobile, width } = useViewport();
  const STAGE_SIZE = isMobile
    ? Math.min(STAGE_SIZE_MOBILE, width - 56)
    : STAGE_SIZE_DESKTOP;
  const PORTRAIT_SIZE = isMobile ? PORTRAIT_SIZE_MOBILE : PORTRAIT_SIZE_DESKTOP;
  const HP_BAR_W = isMobile ? HP_BAR_W_MOBILE : HP_BAR_W_DESKTOP;
  const markerR = isMobile ? 32 : SITE_MARKER_R;
  return (
    <div style={{
      position: 'relative',
      background: COLORS.bgRaised,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 8,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: COLORS.text, letterSpacing: '0.1em',
        }}>
          HAVEN
        </div>
        {playerRole && (
          <div style={{ fontSize: 11, letterSpacing: '0.05em' }}>
            <span style={{ color: COLORS.accent, fontWeight: 700 }}>
              YOU: {playerRole.toUpperCase()}
            </span>
            {focusSite && playerRole === 'attacker' && (
              <span style={{ marginLeft: 12, color: COLORS.warning, fontWeight: 700 }}>
                ⚑ FOCUS: {focusSite}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'center',
        background: COLORS.bg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'relative',
          width: STAGE_SIZE, height: STAGE_SIZE,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={HAVEN_MINIMAP_URL}
            alt="Haven map"
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'contain',
              opacity: 0.75,
              filter: 'brightness(1.15) contrast(1.05) saturate(0.7)',
              pointerEvents: 'none',
            }}
          />

          {/* Spawn markers — defender LEFT, attacker RIGHT */}
          {[
            { pos: DEFENDER_SPAWN_POS, label: 'DEFENDER',  color: COLORS.accent },
            { pos: ATTACKER_SPAWN_POS, label: 'ATTACKER',  color: COLORS.danger },
          ].map(s => (
            <div key={`spawn-${s.label}`} style={{
              position: 'absolute',
              left: `calc(${s.pos.xPct * 100}% - 32px)`,
              top:  `calc(${s.pos.yPct * 100}% - 32px)`,
              width: 64, height: 64,
              pointerEvents: 'none',
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                borderRadius: '50%',
                border: `2px dotted ${s.color}`,
                background: `radial-gradient(circle, ${
                  s.color === COLORS.accent
                    ? 'rgba(60,203,255,0.10)' : 'rgba(255,82,82,0.10)'
                } 0%, transparent 70%)`,
              }} />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 900,
                color: s.color, opacity: 0.55,
                textShadow: '0 1px 4px rgba(0,0,0,0.95)',
              }}>
                ⌂
              </div>
              <div style={{
                position: 'absolute',
                left: '50%', top: '100%',
                transform: 'translate(-50%, 4px)',
                fontSize: 8, fontWeight: 800, letterSpacing: '0.2em',
                color: s.color, opacity: 0.85,
                textShadow: '0 1px 3px rgba(0,0,0,0.95)',
                whiteSpace: 'nowrap',
              }}>
                {s.label} SPAWN
              </div>
            </div>
          ))}

          {/* Secondary callouts (small text) */}
          {HAVEN_CALLOUTS.map(c => (
            <div key={`co-${c.name}`} style={{
              position: 'absolute',
              left: `calc(${c.xPct * 100}% - 40px)`,
              top:  `calc(${c.yPct * 100}% - 6px)`,
              width: 80, textAlign: 'center',
              fontSize: 8, fontWeight: 700, letterSpacing: '0.15em',
              color: 'rgba(255,255,255,0.45)',
              textShadow: '0 1px 3px rgba(0,0,0,0.95)',
              pointerEvents: 'none',
            }}>
              {c.name}
            </div>
          ))}

          {/* Site markers */}
          {ZONES_ORDER.map(zone => {
            const pos = HAVEN_ZONE_POS[zone];
            const isFocus = focusSite === zone && playerRole === 'attacker';
            const ringColor = isFocus ? COLORS.warning :
              zone === 'Mid' ? 'rgba(255,255,255,0.55)' : COLORS.accent;
            return (
              <div key={`mk-${zone}`} style={{
                position: 'absolute',
                left: `calc(${pos.xPct * 100}% - ${markerR}px)`,
                top:  `calc(${pos.yPct * 100}% - ${markerR}px)`,
                width: markerR * 2, height: markerR * 2,
                pointerEvents: 'none',
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  borderRadius: '50%',
                  border: `2px ${isFocus ? 'solid' : 'dashed'} ${ringColor}`,
                  background: isFocus
                    ? 'radial-gradient(circle, rgba(251,191,36,0.22) 0%, transparent 70%)'
                    : 'radial-gradient(circle, rgba(60,203,255,0.10) 0%, transparent 70%)',
                  boxShadow: isFocus
                    ? '0 0 28px rgba(251,191,36,0.5)'
                    : 'none',
                }} />
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, fontWeight: 900,
                  color: isFocus ? COLORS.warning : ringColor,
                  textShadow: '0 2px 6px rgba(0,0,0,0.95)',
                  opacity: 0.55,
                }}>
                  {zone === 'Mid' ? 'M' : zone}
                </div>
                <div style={{
                  position: 'absolute',
                  left: '50%', top: '100%',
                  transform: 'translate(-50%, 4px)',
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.2em',
                  color: isFocus ? COLORS.warning : 'rgba(255,255,255,0.7)',
                  textShadow: '0 1px 3px rgba(0,0,0,0.95)',
                  whiteSpace: 'nowrap',
                }}>
                  {ZONE_LABELS[zone].toUpperCase()}{isFocus ? ' ⚑' : ''}
                </div>
              </div>
            );
          })}

          {/* Agents */}
          {ZONES_ORDER.map(zone => {
            const pos = HAVEN_ZONE_POS[zone];
            const playerAgents = playerRoster
              .map((s, i) => ({ slot: s, idx: i }))
              .filter(x => x.slot.zone === zone);
            const aiAgents = showAi
              ? aiRoster.map((s, i) => ({ slot: s, idx: i })).filter(x => x.slot.zone === zone)
              : [];
            return (
              <div key={`agents-${zone}`}>
                {aiAgents.map((a, i) =>
                  renderPortrait({
                    key: `ai-${zone}-${i}`,
                    slot: a.slot, side: 'ai',
                    posPct: pos,
                    rowOffsetY: -markerR - PORTRAIT_SIZE - ROW_GAP,
                    colIdx: i, total: aiAgents.length,
                    PORTRAIT_SIZE, HP_BAR_W,
                  })
                )}
                {playerAgents.map((p, i) =>
                  renderPortrait({
                    key: `p-${zone}-${i}`,
                    slot: p.slot, side: 'player',
                    posPct: pos,
                    rowOffsetY: markerR + ROW_GAP,
                    colIdx: i, total: playerAgents.length,
                    PORTRAIT_SIZE, HP_BAR_W,
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface PortraitArgs {
  key: string;
  slot: AgentSlot;
  side: Side;
  posPct: { xPct: number; yPct: number };
  rowOffsetY: number;
  colIdx: number;
  total: number;
  PORTRAIT_SIZE: number;
  HP_BAR_W: number;
}

function renderPortrait({
  key, slot, side, posPct, rowOffsetY, colIdx, total, PORTRAIT_SIZE, HP_BAR_W,
}: PortraitArgs) {
  const agent = getAgent(slot.agentId);
  const utility = slot.utilityId ? getUtility(slot.utilityId) : null;
  const max = maxHpFor(slot);
  const ringColor = side === 'player' ? COLORS.accent : COLORS.danger;

  const rowWidth = total * PORTRAIT_SIZE + (total - 1) * COL_GAP;
  const startX = -rowWidth / 2 + PORTRAIT_SIZE / 2;
  const dx = startX + colIdx * (PORTRAIT_SIZE + COL_GAP);

  return (
    <div key={key} style={{
      position: 'absolute',
      left: `calc(${posPct.xPct * 100}% + ${dx}px - ${PORTRAIT_SIZE / 2}px)`,
      top:  `calc(${posPct.yPct * 100}% + ${rowOffsetY}px)`,
      width: PORTRAIT_SIZE,
      pointerEvents: 'none',
    }}>
      <div style={{
        width: PORTRAIT_SIZE, height: PORTRAIT_SIZE,
        borderRadius: '50%',
        border: `2.5px solid ${ringColor}`,
        background: COLORS.bg,
        boxShadow: `0 3px 8px rgba(0,0,0,0.7)`,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={agent.iconUrl} alt={agent.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {utility && (
          <span title={utility.name} style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 11, height: 11, borderRadius: '50%',
            background: COLORS.warning,
            border: `1.5px solid ${COLORS.bg}`,
          }} />
        )}
      </div>
      <div style={{
        marginTop: 3, height: 4, width: HP_BAR_W,
        marginLeft: (PORTRAIT_SIZE - HP_BAR_W) / 2,
        background: 'rgba(0,0,0,0.7)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{ width: '100%', height: '100%', background: COLORS.success }} />
      </div>
      <div style={{
        marginTop: 2, fontSize: 9, fontWeight: 700,
        color: ringColor, textAlign: 'center',
        textShadow: '0 1px 2px rgba(0,0,0,0.95)',
        whiteSpace: 'nowrap',
      }}>
        {agent.name}
        {utility && <span style={{ color: COLORS.warning, marginLeft: 3 }}>·{max}</span>}
      </div>
    </div>
  );
}
