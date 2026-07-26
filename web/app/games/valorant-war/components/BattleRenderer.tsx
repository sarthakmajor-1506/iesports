// v6: bigger canvas with prominent A/B/C/M site rings on the Haven minimap.
// Agents float at zone positions; smooth movement tweens with motion trails
// showing where attackers came from.
'use client';
import { useEffect, useRef, useState } from 'react';
import { COLORS } from '../data/colors';
import { getAgent } from '../data/agents';
import { getArmor } from '../data/armors';
import { getUtility } from '../data/utilities';
import { ZONE_LABELS } from '../data/zones';
import { HAVEN_MINIMAP_URL } from '../data/maps';
import {
  HAVEN_ZONE_POS, HAVEN_CALLOUTS,
  ATTACKER_SPAWN_POS, DEFENDER_SPAWN_POS,
} from '../data/havenLayout';
import { NODE_POS, pathFindForSide } from '../data/havenGraph';
import type { GraphNode } from '../data/havenGraph';
import type { Zone } from '../data/zones';
import type { BattleEvent, AgentSlot, Side, TeamRole } from '../data/types';

interface Props {
  events: BattleEvent[];
  playerRoster: AgentSlot[];
  aiRoster: AgentSlot[];
  playerRole: TeamRole;
  focusSite: Zone | null;
  onComplete: () => void;
}

const W = 920;
const H = 760;
const HEADER = 40;
const STAGE_SIZE = H - HEADER;    // square stage area for the map

const SITE_MARKER_R = 56;
const PORTRAIT_R = 22;
const ROW_OFFSET = 80;            // distance from zone center to AI/player row
const COL_GAP = 6;
const HP_BAR_W = 50;
const HP_BAR_H = 4;

// v10 timings — paths take longer for cinematic feel
const T_ROUND_START = 2400;       // covers full spawn → site walk-in
const T_TICK = 40;
const T_MOVE_PER_SEGMENT = 380;   // ms to walk one segment of the nav path
const T_ENTER_PER_SEGMENT = 520;  // slower walk-in from spawn
const T_ABILITY = 480;
const T_ATTACK = 220;
const T_ELIMINATE = 540;
const T_ROUND_END = 1500;
const T_FINAL = 700;

const PULSE_LIFE = 200;
const SHAKE_LIFE = 220;
const DEATH_FADE = 600;
const TRAIL_LIFE = 900;
const HIT_STOP_MS = 90;           // freeze playback briefly on big hits
const SLOWMO_MS = 280;
const SLOWMO_SCALE = 0.45;
const AFTERIMAGE_FRAMES = 5;      // motion trail clones

interface AgentRuntime {
  side: Side;
  slotIdx: number;
  agentId: string;
  zone: Zone;
  // v10 path-based movement
  path: GraphNode[];               // nodes to traverse
  pathStarted: number;
  pathDuration: number;            // total ms to walk the path
  // Spawn-entrance
  enterStarted: number;
  hp: number;
  maxHp: number;
  utilityId: string | null;
  flashed: boolean;
  eliminated: boolean;
  deathBorn: number;
  pulseBorn: number;
  shakeBorn: number;
  // Anticipation / firing animation
  fireStarted: number;
  // Last N positions for afterimage trail
  trailPositions: { x: number; y: number; t: number }[];
  smokeActive: boolean;
  reconActive: boolean;
  stimActive: boolean;
  healPulseBorn: number;
  fragHitBorn: number;
}

interface Floater {
  id: number;
  text: string;
  side: Side;
  slotIdx: number;
  color: string;
  born: number;
}

interface AttackBeam {
  attackerSide: Side; attackerSlot: number;
  defenderSide: Side; defenderSlot: number;
  born: number;
  missed: boolean;
}

// Motion trail: fading dotted breadcrumb showing where an agent moved from
interface MotionTrail {
  side: Side; slotIdx: number;
  fromZone: Zone; toZone: Zone;
  born: number;
}

// Particle system — sparks, dust, blood, smoke, ult auras
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  color: string;
  born: number;
  life: number;       // ms
  drag: number;       // velocity multiplier per frame (e.g. 0.94)
  gravity: number;    // y-accel per frame
  glow?: boolean;
}

// Ultimate ring: expanding circle anchored to an agent's current position
interface UltRing {
  side: Side; slotIdx: number;
  x: number; y: number;     // resolved at draw time
  color: string;
  born: number;
  maxR: number;
}

// Revive pillar: green column rising on revived ally
interface RevivePillar {
  side: Side; slotIdx: number;
  born: number;
}

function maxHpFor(slot: AgentSlot): number {
  const a = getAgent(slot.agentId);
  const ar = getArmor(slot.armorId);
  let hp = a.baseHp + ar.hpBonus;
  if (slot.utilityId && getUtility(slot.utilityId).effect === 'heal_30') hp += 30;
  return hp;
}

const imageCache: Map<string, HTMLImageElement> = new Map();
function loadImage(url: string): HTMLImageElement {
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    imageCache.set(url, img);
  }
  return img;
}

function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }

// ---------- Particle spawn helpers ----------
function spawnSparks(
  pool: Particle[], x: number, y: number, color: string, count = 8,
) {
  const now = performance.now();
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 3.5;
    pool.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 1.5 + Math.random() * 1.5,
      color, born: now,
      life: 320 + Math.random() * 220,
      drag: 0.92, gravity: 0.06,
      glow: true,
    });
  }
}

function spawnExplosion(
  pool: Particle[], x: number, y: number, color: string, count = 24,
) {
  const now = performance.now();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const speed = 2 + Math.random() * 5;
    pool.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 2 + Math.random() * 2.5,
      color, born: now,
      life: 600 + Math.random() * 400,
      drag: 0.88, gravity: 0.08,
      glow: true,
    });
  }
  // Smoke residue
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.4 + Math.random() * 1.0;
    pool.push({
      x: x + (Math.random() - 0.5) * 12,
      y: y + (Math.random() - 0.5) * 12,
      vx: Math.cos(angle) * speed,
      vy: -0.6 - Math.random() * 0.8,
      size: 8 + Math.random() * 6,
      color: 'rgba(120,120,130,0.5)',
      born: now,
      life: 1100 + Math.random() * 400,
      drag: 0.95, gravity: -0.02,
    });
  }
}

function spawnDustTrail(pool: Particle[], x: number, y: number) {
  const now = performance.now();
  for (let i = 0; i < 4; i++) {
    pool.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y + 6 + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.2 - Math.random() * 0.4,
      size: 3 + Math.random() * 2,
      color: 'rgba(180,180,180,0.35)',
      born: now,
      life: 600,
      drag: 0.94, gravity: -0.01,
    });
  }
}

function makeRuntime(side: Side, slotIdx: number, slot: AgentSlot): AgentRuntime {
  const utility = slot.utilityId ? getUtility(slot.utilityId) : null;
  const eff = utility?.effect;
  return {
    side, slotIdx, agentId: slot.agentId,
    zone: slot.zone ?? 'Mid',
    path: [],
    pathStarted: 0,
    pathDuration: 0,
    enterStarted: 0,
    hp: maxHpFor(slot), maxHp: maxHpFor(slot),
    utilityId: slot.utilityId,
    flashed: false,
    eliminated: false, deathBorn: 0, pulseBorn: 0, shakeBorn: 0,
    fireStarted: 0,
    trailPositions: [],
    smokeActive: eff === 'dodge_30',
    reconActive: eff === 'recon_dmg_30',
    stimActive: eff === 'stim_team_15',
    healPulseBorn: 0,
    fragHitBorn: 0,
  };
}

export default function BattleRenderer({
  events, playerRoster, aiRoster, playerRole, focusSite, onComplete,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [eventIdx, setEventIdx] = useState(0);

  const playerRef = useRef<AgentRuntime[]>(
    playerRoster.map((s, i) => makeRuntime('player', i, s))
  );
  const aiRef = useRef<AgentRuntime[]>(
    aiRoster.map((s, i) => makeRuntime('ai', i, s))
  );
  const floatersRef = useRef<Floater[]>([]);
  const beamsRef = useRef<AttackBeam[]>([]);
  const trailsRef = useRef<MotionTrail[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const ultRingsRef = useRef<UltRing[]>([]);
  const revivesRef = useRef<RevivePillar[]>([]);
  // Queue of particle requests from event handlers — actual spawn happens in
  // the raf loop where we know live agent positions.
  const particleQueueRef = useRef<{
    kind: 'sparks' | 'explosion' | 'dust';
    side: Side; slotIdx: number;
    color: string;
    consumed?: boolean;
  }[]>([]);
  const bannerRef = useRef<{ text: string; sub?: string; color?: string } | null>(null);
  const tickNumRef = useRef<number>(0);
  const completedRef = useRef(false);
  // Screen shake: amplitude (px) + start time
  const shakeRef = useRef<{ amp: number; born: number; duration: number }>({ amp: 0, born: 0, duration: 0 });
  // Full-screen flash (ultimate, kill)
  const flashRef = useRef<{ color: string; born: number; duration: number; alpha: number } | null>(null);
  // Hit-stop & slow-mo timing — used to scale event-playback durations
  const hitStopUntilRef = useRef<number>(0);
  const slowMoUntilRef = useRef<number>(0);

  // Preload images
  useEffect(() => {
    loadImage(HAVEN_MINIMAP_URL);
    for (const slot of [...playerRoster, ...aiRoster]) {
      loadImage(getAgent(slot.agentId).iconUrl);
    }
    const now = performance.now();
    for (const f of [...playerRef.current, ...aiRef.current]) {
      if (f.utilityId && getUtility(f.utilityId).effect === 'heal_30') {
        f.healPulseBorn = now;
      }
    }
  }, [playerRoster, aiRoster]);

  useEffect(() => {
    function applyFlashViz(slots: AgentSlot[], myTeam: AgentRuntime[], opposing: AgentRuntime[]) {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (!slot.utilityId) continue;
        if (getUtility(slot.utilityId).effect !== 'flash_zone') continue;
        const me = myTeam.find(f => f.slotIdx === i);
        if (!me) continue;
        // Flashbang now affects ALL same-zone enemies (not just one)
        for (const o of opposing.filter(o => o.zone === me.zone && o.hp > 0)) {
          o.flashed = true;
        }
      }
    }
    applyFlashViz(playerRoster, playerRef.current, aiRef.current);
    applyFlashViz(aiRoster, aiRef.current, playerRef.current);
  }, [playerRoster, aiRoster]);

  // Drive event playback
  useEffect(() => {
    if (completedRef.current) return;
    if (eventIdx >= events.length) {
      completedRef.current = true;
      const t = setTimeout(() => onComplete(), T_FINAL);
      return () => clearTimeout(t);
    }

    const ev = events[eventIdx];
    let cancelled = false;
    const next = () => { if (!cancelled) setEventIdx(i => i + 1); };
    let duration = T_TICK;

    if (ev.type === 'round_start') {
      bannerRef.current = {
        text: `ROUND ${ev.roundNumber}`,
        sub: `${ev.map} — ${playerRole === 'attacker' ? 'YOU ATTACK' : 'YOU DEFEND'}`,
      };
      const startTime = performance.now();
      for (const f of [...playerRef.current, ...aiRef.current]) {
        const myRole: TeamRole = (f.side === 'player' ? playerRole :
          (playerRole === 'attacker' ? 'defender' : 'attacker'));
        const spawnNode: GraphNode = myRole === 'attacker' ? 'ATTACKER_SPAWN' : 'DEFENDER_SPAWN';
        const path = pathFindForSide(spawnNode, f.zone as GraphNode, myRole);
        f.path = path;
        f.pathStarted = startTime;
        f.pathDuration = Math.max(1, path.length - 1) * T_ENTER_PER_SEGMENT;
        f.enterStarted = startTime;
      }
      duration = T_ROUND_START;
    } else if (ev.type === 'tick_start') {
      tickNumRef.current = ev.tick;
      bannerRef.current = null;
      duration = T_TICK;
    } else if (ev.type === 'move') {
      const team = ev.side === 'player' ? playerRef.current : aiRef.current;
      const f = team[ev.slotIdx];
      if (f) {
        // Determine the moving agent's role and use side-aware pathing
        const myRole: TeamRole = (f.side === 'player' ? playerRole :
          (playerRole === 'attacker' ? 'defender' : 'attacker'));
        const path = pathFindForSide(f.zone as GraphNode, ev.to as GraphNode, myRole);
        f.path = path;
        f.pathStarted = performance.now();
        f.pathDuration = Math.max(1, path.length - 1) * T_MOVE_PER_SEGMENT;
        f.zone = ev.to;
        trailsRef.current.push({
          side: f.side, slotIdx: f.slotIdx,
          fromZone: ev.from, toZone: ev.to,
          born: performance.now(),
        });
      }
      duration = Math.max(1, (f?.path.length ?? 2) - 1) * T_MOVE_PER_SEGMENT;
    } else if (ev.type === 'ability') {
      bannerRef.current = { text: `${getAgent(ev.agentId).name}: ${ev.abilityName}` };
      const team = ev.side === 'player' ? playerRef.current : aiRef.current;
      const f = team[ev.slotIdx];
      if (f) f.pulseBorn = performance.now();
      duration = T_ABILITY;
    } else if (ev.type === 'ultimate') {
      const team = ev.side === 'player' ? playerRef.current : aiRef.current;
      const f = team[ev.slotIdx];
      if (f) f.pulseBorn = performance.now();
      bannerRef.current = {
        text: `ULTIMATE`,
        sub: `${getAgent(ev.agentId).name}: ${ev.ultName}`,
        color: COLORS.ultPurple,
      };
      flashRef.current = {
        color: COLORS.ultGlow, born: performance.now(),
        duration: 320, alpha: 0.5,
      };
      // Mark a ring at the agent's current position — the raf loop will position it.
      // We use the agent's slot key; the ring renderer looks up live position.
      ultRingsRef.current.push({
        side: ev.side, slotIdx: ev.slotIdx,
        x: 0, y: 0,
        color: COLORS.ultPurple,
        born: performance.now(),
        maxR: 220,
      });
      duration = 900;
    } else if (ev.type === 'revive') {
      const team = ev.side === 'player' ? playerRef.current : aiRef.current;
      const f = team[ev.slotIdx];
      if (f) {
        f.hp = ev.hp;
        f.eliminated = false;
        f.deathBorn = 0;
        f.healPulseBorn = performance.now();
        revivesRef.current.push({
          side: ev.side, slotIdx: ev.slotIdx, born: performance.now(),
        });
      }
      duration = 700;
    } else if (ev.type === 'attack') {
      const now2 = performance.now();
      if (!ev.missed) {
        particleQueueRef.current.push({
          kind: 'sparks', side: ev.defender.side, slotIdx: ev.defender.slotIdx,
          color: COLORS.warning,
        });
      }
      const dTeam = ev.defender.side === 'player' ? playerRef.current : aiRef.current;
      const aTeam = ev.attacker.side === 'player' ? playerRef.current : aiRef.current;
      const d = dTeam[ev.defender.slotIdx];
      const a = aTeam[ev.attacker.slotIdx];
      if (d) d.hp = ev.defenderHpAfter;
      if (a) {
        a.pulseBorn = now2;
        a.fireStarted = now2;  // anticipation/recoil pose
      }
      if (d && !ev.missed) d.shakeBorn = now2;
      // Hit-stop on big damage (>= 20)
      if (!ev.missed && ev.damage >= 20) {
        hitStopUntilRef.current = now2 + HIT_STOP_MS;
      }

      const isPreTick = tickNumRef.current === 0;
      const aSlot = ev.attacker.side === 'player' ? playerRoster[ev.attacker.slotIdx] : aiRoster[ev.attacker.slotIdx];
      const aUtility = aSlot?.utilityId ? getUtility(aSlot.utilityId).effect : null;
      const isFrag = isPreTick && aUtility === 'frag_25';
      if (d && isFrag) d.fragHitBorn = performance.now();
      if (a?.flashed) a.flashed = false;

      floatersRef.current.push({
        id: Math.random(),
        text: ev.missed ? 'MISS' : (isFrag ? `FRAG -${ev.damage}` : `-${ev.damage}`),
        side: ev.defender.side, slotIdx: ev.defender.slotIdx,
        color: ev.missed ? COLORS.textDim : (isFrag ? COLORS.warning : COLORS.danger),
        born: performance.now(),
      });
      beamsRef.current.push({
        attackerSide: ev.attacker.side, attackerSlot: ev.attacker.slotIdx,
        defenderSide: ev.defender.side, defenderSlot: ev.defender.slotIdx,
        born: performance.now(), missed: ev.missed,
      });
      duration = T_ATTACK;
    } else if (ev.type === 'eliminate') {
      const now2 = performance.now();
      const team = ev.side === 'player' ? playerRef.current : aiRef.current;
      const f = team[ev.slotIdx];
      if (f) { f.hp = 0; f.eliminated = true; f.deathBorn = now2; }
      shakeRef.current = { amp: 11, born: now2, duration: 360 };
      flashRef.current = {
        color: 'rgba(255,82,82,0.6)', born: now2,
        duration: 200, alpha: 0.4,
      };
      particleQueueRef.current.push({
        kind: 'explosion', side: ev.side, slotIdx: ev.slotIdx,
        color: COLORS.danger,
      });
      // Slow-mo for next event(s)
      slowMoUntilRef.current = now2 + SLOWMO_MS;
      duration = T_ELIMINATE;
    } else if (ev.type === 'round_end') {
      const label =
        ev.winner === 'player' ? 'ROUND WON' :
        ev.winner === 'ai'     ? 'ROUND LOST' :
                                 'TIE';
      bannerRef.current = { text: label, sub: `kills ${ev.killCounts.player}–${ev.killCounts.ai}` };
      duration = T_ROUND_END;
    }

    // Apply hit-stop and slow-mo to event delay
    const now3 = performance.now();
    let scaledDuration = duration;
    if (now3 < hitStopUntilRef.current) {
      scaledDuration += (hitStopUntilRef.current - now3);
    }
    if (now3 < slowMoUntilRef.current) {
      scaledDuration = scaledDuration / SLOWMO_SCALE;  // event takes longer
    }

    const timer = setTimeout(next, scaledDuration);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [eventIdx, events, onComplete, playerRole, playerRoster, aiRoster]);

  useEffect(() => {
    let raf: number;
    function loop() {
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext('2d');
        if (ctx) {
          const now = performance.now();
          floatersRef.current = floatersRef.current.filter(f => now - f.born < 1100);
          beamsRef.current = beamsRef.current.filter(b => now - b.born < 320);
          trailsRef.current = trailsRef.current.filter(t => now - t.born < TRAIL_LIFE);
          // Particle physics
          const live: Particle[] = [];
          for (const p of particlesRef.current) {
            const age = now - p.born;
            if (age >= p.life) continue;
            p.x += p.vx; p.y += p.vy;
            p.vx *= p.drag;
            p.vy = p.vy * p.drag + p.gravity;
            live.push(p);
          }
          particlesRef.current = live;
          ultRingsRef.current = ultRingsRef.current.filter(r => now - r.born < 700);
          revivesRef.current = revivesRef.current.filter(r => now - r.born < 900);
          if (flashRef.current && now - flashRef.current.born > flashRef.current.duration) {
            flashRef.current = null;
          }
          drawScene(
            ctx, playerRef.current, aiRef.current,
            focusSite, playerRole, tickNumRef.current,
            bannerRef.current, floatersRef.current, beamsRef.current, trailsRef.current,
            particlesRef.current, ultRingsRef.current, revivesRef.current,
            shakeRef.current, flashRef.current,
            particleQueueRef.current,
            now,
          );
        }
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [focusSite, playerRole]);

  return (
    <div style={{
      background: COLORS.bgRaised,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      padding: 12,
    }}>
      <canvas
        ref={canvasRef}
        width={W} height={H}
        style={{ width: '100%', maxWidth: W, height: 'auto', display: 'block' }}
      />
    </div>
  );
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  players: AgentRuntime[],
  ais: AgentRuntime[],
  focusSite: Zone | null,
  playerRole: TeamRole,
  tickNum: number,
  banner: { text: string; sub?: string; color?: string } | null,
  floaters: Floater[],
  beams: AttackBeam[],
  trails: MotionTrail[],
  particles: Particle[],
  ultRings: UltRing[],
  revives: RevivePillar[],
  shake: { amp: number; born: number; duration: number },
  flash: { color: string; born: number; duration: number; alpha: number } | null,
  particleQueue: { kind: 'sparks' | 'explosion' | 'dust'; side: Side; slotIdx: number; color: string; consumed?: boolean }[],
  now: number,
) {
  // Apply screen shake (translate the entire scene)
  let shakeDx = 0, shakeDy = 0;
  if (shake.amp > 0 && now - shake.born < shake.duration) {
    const t = (now - shake.born) / shake.duration;
    const decay = 1 - t;
    shakeDx = (Math.random() - 0.5) * 2 * shake.amp * decay;
    shakeDy = (Math.random() - 0.5) * 2 * shake.amp * decay;
  }
  ctx.save();
  ctx.translate(shakeDx, shakeDy);

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(-30, -30, W + 60, H + 60);

  // Square map stage centered horizontally, below the header
  const stageX = (W - STAGE_SIZE) / 2;
  const stageY = HEADER;

  // Haven minimap fills the square stage exactly (so zone coords align directly)
  const haven = imageCache.get(HAVEN_MINIMAP_URL);
  if (haven && haven.complete && haven.naturalWidth > 0) {
    ctx.globalAlpha = 0.75;
    ctx.drawImage(haven, stageX, stageY, STAGE_SIZE, STAGE_SIZE);
    ctx.globalAlpha = 1;
    const grad = ctx.createRadialGradient(
      stageX + STAGE_SIZE / 2, stageY + STAGE_SIZE / 2, 100,
      stageX + STAGE_SIZE / 2, stageY + STAGE_SIZE / 2, STAGE_SIZE * 0.7
    );
    grad.addColorStop(0, 'rgba(15,25,35,0)');
    grad.addColorStop(1, 'rgba(15,25,35,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(stageX, stageY, STAGE_SIZE, STAGE_SIZE);
  }

  // Secondary callout labels (subtle text on map)
  for (const co of HAVEN_CALLOUTS) {
    const cx = stageX + co.xPct * STAGE_SIZE;
    const cy = stageY + co.yPct * STAGE_SIZE;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = 'bold 9px system-ui';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 4;
    ctx.fillText(co.name, cx, cy);
    ctx.shadowBlur = 0;
  }

  // Header
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 13px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(`HAVEN — ${playerRole === 'attacker' ? 'YOU ATTACK' : 'YOU DEFEND'}`, 16, 24);
  if (focusSite && playerRole === 'attacker') {
    ctx.fillStyle = COLORS.warning;
    ctx.fillText(`⚑ FOCUS: ${focusSite}`, 260, 24);
  }
  if (tickNum > 0) {
    ctx.fillStyle = COLORS.textMuted;
    ctx.textAlign = 'right';
    ctx.font = '12px system-ui';
    ctx.fillText(`TICK ${tickNum}`, W - 16, 24);
  }

  // Zone center fn — relative to the square map stage
  const zoneCenter = (zone: Zone): { x: number; y: number } => {
    const p = HAVEN_ZONE_POS[zone];
    return { x: stageX + p.xPct * STAGE_SIZE, y: stageY + p.yPct * STAGE_SIZE };
  };

  // Spawn pixel positions per side (from playerRole)
  const playerSpawnSrc = playerRole === 'attacker' ? ATTACKER_SPAWN_POS : DEFENDER_SPAWN_POS;
  const aiSpawnSrc     = playerRole === 'attacker' ? DEFENDER_SPAWN_POS : ATTACKER_SPAWN_POS;
  const spawn = {
    player: { x: stageX + playerSpawnSrc.xPct * STAGE_SIZE, y: stageY + playerSpawnSrc.yPct * STAGE_SIZE },
    ai:     { x: stageX + aiSpawnSrc.xPct     * STAGE_SIZE, y: stageY + aiSpawnSrc.yPct     * STAGE_SIZE },
  };

  // Draw spawn markers (defender LEFT cyan, attacker RIGHT red)
  drawSpawnMarker(ctx, spawn.player.x, spawn.player.y,
    playerRole === 'attacker' ? 'ATTACKER' : 'DEFENDER',
    playerRole === 'attacker' ? COLORS.danger : COLORS.accent);
  drawSpawnMarker(ctx, spawn.ai.x, spawn.ai.y,
    playerRole === 'attacker' ? 'DEFENDER' : 'ATTACKER',
    playerRole === 'attacker' ? COLORS.accent : COLORS.danger);

  // Site markers (rings with letter)
  (Object.keys(HAVEN_ZONE_POS) as Zone[]).forEach(zone => {
    const c = zoneCenter(zone);
    const isFocus = zone === focusSite && playerRole === 'attacker';
    drawSiteMarker(ctx, c.x, c.y, zone, isFocus, now);
  });

  // Motion trails (drawn under agents)
  for (const trail of trails) {
    const age = (now - trail.born) / TRAIL_LIFE;
    const alpha = Math.max(0, 1 - age);
    const fromC = zoneCenter(trail.fromZone);
    const toC   = zoneCenter(trail.toZone);
    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = trail.side === 'player' ? COLORS.accent : COLORS.danger;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -age * 30;
    ctx.beginPath();
    ctx.moveTo(fromC.x, fromC.y);
    ctx.lineTo(toC.x, toC.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // Build position map (path-aware)
  const stage = { x: stageX, y: stageY, size: STAGE_SIZE };
  const positions = new Map<string, { x: number; y: number }>();
  for (const f of [...ais, ...players]) {
    const pos = computeAgentPosition(f, ais, players, playerRole, spawn, stage, now, zoneCenter);
    positions.set(`${f.side}-${f.slotIdx}`, pos);
    // Record afterimage trail position (last N samples)
    f.trailPositions.push({ x: pos.x, y: pos.y, t: now });
    if (f.trailPositions.length > AFTERIMAGE_FRAMES * 4) {
      f.trailPositions.splice(0, f.trailPositions.length - AFTERIMAGE_FRAMES * 4);
    }
  }

  // Process queued particle spawns now that positions are known
  while (particleQueue.length > 0) {
    const req = particleQueue.shift()!;
    const pos = positions.get(`${req.side}-${req.slotIdx}`);
    if (!pos) continue;
    if (req.kind === 'sparks') spawnSparks(particles, pos.x, pos.y, req.color, 8);
    else if (req.kind === 'explosion') spawnExplosion(particles, pos.x, pos.y, req.color, 24);
    else if (req.kind === 'dust') spawnDustTrail(particles, pos.x, pos.y);
  }

  // Spawn dust trail for any agent currently in mid-path animation
  for (const f of [...ais, ...players]) {
    if (f.path.length >= 2 && now - f.pathStarted < f.pathDuration) {
      if (Math.random() < 0.25) {
        const pos = positions.get(`${f.side}-${f.slotIdx}`);
        if (pos) spawnDustTrail(particles, pos.x, pos.y);
      }
    }
  }

  for (const f of ais) {
    const pos = positions.get(`ai-${f.slotIdx}`)!;
    drawAgent(ctx, pos.x, pos.y, f, now);
  }
  for (const f of players) {
    const pos = positions.get(`player-${f.slotIdx}`)!;
    drawAgent(ctx, pos.x, pos.y, f, now);
  }

  // Attack beams — additive composite blending for true light bleed
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const beam of beams) {
    const aPos = positions.get(`${beam.attackerSide}-${beam.attackerSlot}`);
    const dPos = positions.get(`${beam.defenderSide}-${beam.defenderSlot}`);
    if (!aPos || !dPos) continue;
    const age = (now - beam.born) / 320;
    const alpha = Math.max(0, 1 - age);

    const dx = dPos.x - aPos.x;
    const dy = dPos.y - aPos.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len, py = dx / len;

    if (!beam.missed) {
      // Outer halo (wide, very faded)
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = COLORS.warning;
      ctx.lineWidth = 8;
      ctx.shadowColor = COLORS.warning;
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.moveTo(aPos.x, aPos.y);
      ctx.lineTo(dPos.x, dPos.y);
      ctx.stroke();

      // Bright core
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#fff8d6';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(aPos.x, aPos.y);
      ctx.lineTo(dPos.x, dPos.y);
      ctx.stroke();

      // Trailing offset bullets
      ctx.globalAlpha = alpha * 0.6;
      ctx.lineWidth = 1.2;
      for (const sgn of [-1, 1]) {
        const ox = px * 2.5 * sgn, oy = py * 2.5 * sgn;
        ctx.beginPath();
        ctx.moveTo(aPos.x + ox, aPos.y + oy);
        ctx.lineTo(dPos.x + ox, dPos.y + oy);
        ctx.stroke();
      }
    } else {
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = COLORS.textDim;
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(aPos.x, aPos.y);
      ctx.lineTo(dPos.x, dPos.y);
      ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();

  // Floaters
  for (const f of floaters) {
    const age = (now - f.born) / 1000;
    const alpha = Math.max(0, 1 - age);
    const dy = -age * 30;
    const pos = positions.get(`${f.side}-${f.slotIdx}`);
    if (!pos) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = f.color;
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 4;
    ctx.fillText(f.text, pos.x, pos.y - PORTRAIT_R - 8 + dy);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // ---- Particles (drawn over agents) ----
  for (const p of particles) {
    const age = now - p.born;
    const lifeT = age / p.life;
    const alpha = Math.max(0, 1 - lifeT);
    ctx.globalAlpha = alpha;
    if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 8; }
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    if (p.glow) ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;

  // ---- Revive pillars ----
  for (const r of revives) {
    const team = r.side === 'player' ? players : ais;
    const f = team[r.slotIdx];
    if (!f) continue;
    const pos = positions.get(`${r.side}-${r.slotIdx}`);
    if (!pos) continue;
    const age = (now - r.born) / 900;
    const alpha = Math.max(0, 1 - age);
    const h = 80 - age * 30;
    const grad = ctx.createLinearGradient(pos.x, pos.y, pos.x, pos.y - h);
    grad.addColorStop(0, `rgba(74,222,128,${0.7 * alpha})`);
    grad.addColorStop(1, 'rgba(74,222,128,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(pos.x - 24, pos.y - h, 48, h);
  }

  // ---- Ultimate rings (resolved to agent's live position) ----
  for (const r of ultRings) {
    const pos = positions.get(`${r.side}-${r.slotIdx}`);
    if (!pos) continue;
    const age = (now - r.born) / 700;
    const radius = 8 + age * r.maxR;
    const alpha = Math.max(0, 1 - age);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 4;
    ctx.shadowColor = r.color;
    ctx.shadowBlur = 16 * alpha;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    // Inner ring (offset)
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // ---- Banner ----
  if (banner) {
    const cy = H - 26;
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, cy - 20, W, 40);
    ctx.fillStyle = banner.color ?? COLORS.accent;
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = banner.color ?? COLORS.accent;
    ctx.shadowBlur = 12;
    ctx.fillText(banner.text + (banner.sub ? `  ·  ${banner.sub}` : ''), W / 2, cy);
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
  }

  // Close screen-shake transform
  ctx.restore();

  // ---- Full-screen flash (drawn AFTER restore so shake doesn't move it) ----
  if (flash) {
    const age = (now - flash.born) / flash.duration;
    const alpha = Math.max(0, flash.alpha * (1 - age));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = flash.color;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

function drawSpawnMarker(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  label: string,
  color: string,
) {
  // Soft fill
  const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 36);
  if (color === COLORS.accent) {
    grad.addColorStop(0, 'rgba(60,203,255,0.18)');
    grad.addColorStop(1, 'rgba(60,203,255,0)');
  } else {
    grad.addColorStop(0, 'rgba(255,82,82,0.18)');
    grad.addColorStop(1, 'rgba(255,82,82,0)');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 36, 0, Math.PI * 2);
  ctx.fill();

  // Dotted ring
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, 32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Home icon
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.font = 'bold 18px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 4;
  ctx.fillText('⌂', cx, cy);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.textBaseline = 'alphabetic';

  // Label
  ctx.fillStyle = color;
  ctx.font = 'bold 9px system-ui';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 4;
  ctx.fillText(label + ' SPAWN', cx, cy + 48);
  ctx.shadowBlur = 0;
}

function drawSiteMarker(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  zone: Zone,
  focus: boolean,
  now: number,
) {
  const ringColor = focus ? COLORS.warning :
    zone === 'Mid' ? 'rgba(255,255,255,0.55)' : COLORS.accent;

  // Soft fill
  const fillGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, SITE_MARKER_R);
  if (focus) {
    fillGrad.addColorStop(0, 'rgba(251,191,36,0.22)');
    fillGrad.addColorStop(0.7, 'rgba(251,191,36,0.06)');
    fillGrad.addColorStop(1, 'rgba(251,191,36,0)');
  } else if (zone === 'Mid') {
    fillGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
    fillGrad.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    fillGrad.addColorStop(0, 'rgba(60,203,255,0.12)');
    fillGrad.addColorStop(0.7, 'rgba(60,203,255,0.03)');
    fillGrad.addColorStop(1, 'rgba(60,203,255,0)');
  }
  ctx.fillStyle = fillGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, SITE_MARKER_R, 0, Math.PI * 2);
  ctx.fill();

  // Outer ring (animated dash for non-focus, solid + glow for focus)
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 2;
  if (focus) {
    ctx.shadowColor = COLORS.warning;
    ctx.shadowBlur = 18;
  } else {
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = (now / 80) % 12;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, SITE_MARKER_R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  // Letter
  ctx.fillStyle = focus ? COLORS.warning : ringColor;
  ctx.globalAlpha = 0.45;
  ctx.font = 'bold 36px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 6;
  ctx.fillText(zone === 'Mid' ? 'M' : zone, cx, cy);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.textBaseline = 'alphabetic';

  // Site label below ring
  ctx.fillStyle = focus ? COLORS.warning : 'rgba(255,255,255,0.55)';
  ctx.font = 'bold 10px system-ui';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 4;
  ctx.fillText(ZONE_LABELS[zone].toUpperCase() + (focus ? '  ⚑' : ''), cx, cy + SITE_MARKER_R + 14);
  ctx.shadowBlur = 0;
}

function computeAgentPosition(
  f: AgentRuntime,
  ais: AgentRuntime[],
  players: AgentRuntime[],
  playerRole: TeamRole,
  spawn: { player: { x: number; y: number }; ai: { x: number; y: number } },
  stage: { x: number; y: number; size: number },
  now: number,
  zoneCenter: (z: Zone) => { x: number; y: number },
): { x: number; y: number } {
  const finalPos = positionInZoneFor(f, f.zone, ais, players, zoneCenter);
  void spawn; void playerRole; // resolved via path graph

  // If a path animation is in progress, walk along the polyline at constant velocity
  if (f.path.length >= 2 && f.pathDuration > 0) {
    const elapsed = now - f.pathStarted;
    if (elapsed < f.pathDuration) {
      const t = elapsed / f.pathDuration;
      const eased = easeOutCubic(t);
      // Build polyline of pixel coords for path nodes
      const points: { x: number; y: number }[] = f.path.map(node => {
        const p = NODE_POS[node];
        return { x: stage.x + p.xPct * stage.size, y: stage.y + p.yPct * stage.size };
      });
      // Replace last node with the in-zone slot offset (so multiple agents fan out)
      points[points.length - 1] = finalPos;
      // Cumulative distances
      const segLens: number[] = [];
      let total = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const dx = points[i + 1].x - points[i].x;
        const dy = points[i + 1].y - points[i].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        segLens.push(d);
        total += d;
      }
      if (total === 0) return finalPos;
      // Walk `total * eased` pixels along the polyline
      let remaining = total * eased;
      for (let i = 0; i < segLens.length; i++) {
        if (remaining <= segLens[i]) {
          const frac = segLens[i] === 0 ? 0 : remaining / segLens[i];
          return {
            x: points[i].x + (points[i + 1].x - points[i].x) * frac,
            y: points[i].y + (points[i + 1].y - points[i].y) * frac,
          };
        }
        remaining -= segLens[i];
      }
      return points[points.length - 1];
    }
  }
  return finalPos;
}

function positionInZoneFor(
  f: AgentRuntime,
  zone: Zone,
  ais: AgentRuntime[],
  players: AgentRuntime[],
  zoneCenter: (z: Zone) => { x: number; y: number },
): { x: number; y: number } {
  const c = zoneCenter(zone);
  const sameSide = f.side === 'ai'
    ? ais.filter(a => a.zone === zone)
    : players.filter(p => p.zone === zone);
  const idx = sameSide.findIndex(x => x.slotIdx === f.slotIdx);
  const inZoneIdx = idx === -1 ? 0 : idx;
  const total = sameSide.length || 1;

  const portraitW = PORTRAIT_R * 2;
  const rowWidth = total * portraitW + (total - 1) * COL_GAP;
  const startX = -rowWidth / 2 + portraitW / 2;
  const dx = startX + inZoneIdx * (portraitW + COL_GAP);
  const dy = f.side === 'ai' ? -ROW_OFFSET : ROW_OFFSET;

  return { x: c.x + dx, y: c.y + dy };
}

function drawAgent(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  f: AgentRuntime,
  now: number,
) {
  const agent = getAgent(f.agentId);
  const max = f.maxHp;
  const pct = max > 0 ? f.hp / max : 0;

  let scale = 1;
  // Pulse: round scale (uniform)
  if (f.pulseBorn > 0) {
    const age = now - f.pulseBorn;
    if (age < PULSE_LIFE) scale = 1 + Math.sin((age / PULSE_LIFE) * Math.PI) * 0.18;
  }

  // Squash & stretch: defender squashes vertically when hit (industry "anim 12 principles")
  let scaleX = scale, scaleY = scale;
  if (f.shakeBorn > 0) {
    const age = now - f.shakeBorn;
    if (age < SHAKE_LIFE) {
      const t = age / SHAKE_LIFE;
      const squash = Math.sin(t * Math.PI) * 0.22; // peak squash mid-animation
      scaleX = scale * (1 + squash);   // wider
      scaleY = scale * (1 - squash);   // shorter
    }
  }

  // Anticipation/firing: attacker stretches horizontally toward target on shot
  if (f.fireStarted > 0) {
    const fireAge = now - f.fireStarted;
    if (fireAge < 220) {
      const t = fireAge / 220;
      // Quick lean back then forward (-1..+1)
      const lean = Math.sin(t * Math.PI * 2) * 0.12;
      scaleX = scaleX * (1 + Math.abs(lean));
      scaleY = scaleY * (1 - Math.abs(lean) * 0.4);
    }
  }

  let shakeDx = 0, shakeDy = 0;
  if (f.shakeBorn > 0) {
    const age = now - f.shakeBorn;
    if (age < SHAKE_LIFE) {
      const t = age / SHAKE_LIFE;
      const decay = 1 - t;
      shakeDx = Math.sin(t * 60) * 5 * decay;
      shakeDy = Math.cos(t * 50) * 3 * decay;
    }
  }

  let alpha = 1;
  if (f.eliminated) {
    if (f.deathBorn > 0 && now - f.deathBorn < DEATH_FADE) {
      alpha = 1 - ((now - f.deathBorn) / DEATH_FADE) * 0.7;
    } else {
      alpha = 0.3;
    }
  }

  // Afterimage trail (motion blur effect): draw a few faded clones at past positions
  // ONLY while the agent is moving (path animation in progress)
  if (f.path.length >= 2 && now - f.pathStarted < f.pathDuration && f.trailPositions.length > 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Sample N evenly-spaced past positions
    const samples = Math.min(AFTERIMAGE_FRAMES, f.trailPositions.length);
    for (let i = 1; i <= samples; i++) {
      const idx = Math.max(0, f.trailPositions.length - 1 - i * 2);
      const past = f.trailPositions[idx];
      if (!past) continue;
      const fade = 1 - (i / samples);
      ctx.globalAlpha = 0.18 * fade;
      const ringColor = f.side === 'player' ? COLORS.accent : COLORS.danger;
      ctx.fillStyle = ringColor;
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(past.x, past.y, PORTRAIT_R * (0.7 + fade * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ctx.save();
  ctx.translate(cx + shakeDx, cy + shakeDy);

  // Auras
  if (f.smokeActive && !f.eliminated) {
    const t = (now / 600) % 1;
    const r = PORTRAIT_R * 1.5 + Math.sin(t * Math.PI * 2) * 3;
    const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, r);
    grad.addColorStop(0, 'rgba(220,220,230,0.3)');
    grad.addColorStop(1, 'rgba(220,220,230,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  }
  if (f.reconActive && !f.eliminated) {
    const t = (now / 1500) % 1;
    ctx.strokeStyle = 'rgba(60,203,255,0.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = t * 30;
    ctx.beginPath(); ctx.arc(0, 0, PORTRAIT_R + 6, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (f.stimActive && !f.eliminated) {
    const t = (now / 700) % 1;
    const intensity = 0.18 + Math.sin(t * Math.PI * 2) * 0.07;
    ctx.shadowColor = '#ff8c42';
    ctx.shadowBlur = 14;
    ctx.fillStyle = `rgba(255,140,66,${intensity})`;
    ctx.beginPath(); ctx.arc(0, 0, PORTRAIT_R + 4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  if (f.healPulseBorn > 0 && now - f.healPulseBorn < 800) {
    const t = (now - f.healPulseBorn) / 800;
    const r = PORTRAIT_R + t * 30;
    ctx.strokeStyle = `rgba(74,222,128,${1 - t})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  }
  if (f.fragHitBorn > 0 && now - f.fragHitBorn < 500) {
    const t = (now - f.fragHitBorn) / 500;
    const r = 8 + t * 32;
    ctx.fillStyle = `rgba(251,191,36,${0.5 * (1 - t)})`;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,140,66,${1 - t})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.scale(scaleX, scaleY);
  ctx.globalAlpha = alpha;

  // Outer ring (side color) with neon glow
  const ringColor = f.side === 'player' ? COLORS.accent : COLORS.danger;

  // Soft outer glow halo
  if (!f.eliminated) {
    ctx.shadowColor = ringColor;
    ctx.shadowBlur = 14;
  }
  ctx.fillStyle = COLORS.bg;
  ctx.beginPath();
  ctx.arc(0, 0, PORTRAIT_R + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = ringColor;
  ctx.beginPath();
  ctx.arc(0, 0, PORTRAIT_R, 0, Math.PI * 2);
  ctx.stroke();

  const portrait = imageCache.get(agent.iconUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, PORTRAIT_R - 1, 0, Math.PI * 2);
  ctx.clip();
  if (portrait && portrait.complete && portrait.naturalWidth > 0) {
    ctx.drawImage(portrait, -PORTRAIT_R, -PORTRAIT_R, PORTRAIT_R * 2, PORTRAIT_R * 2);
  } else {
    ctx.fillStyle = COLORS.bgRaised;
    ctx.fillRect(-PORTRAIT_R, -PORTRAIT_R, PORTRAIT_R * 2, PORTRAIT_R * 2);
  }
  ctx.restore();

  // Utility dot
  if (f.utilityId) {
    ctx.fillStyle = COLORS.warning;
    ctx.strokeStyle = COLORS.bg;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(PORTRAIT_R - 5, PORTRAIT_R - 5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // HP bar below
  const barX = -HP_BAR_W / 2, barY = PORTRAIT_R + 4;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(barX - 1, barY - 1, HP_BAR_W + 2, HP_BAR_H + 2);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(barX, barY, HP_BAR_W, HP_BAR_H);
  ctx.fillStyle = pct > 0.5 ? COLORS.hpBar : pct > 0.25 ? COLORS.hpBarLow : COLORS.hpBarCrit;
  ctx.fillRect(barX, barY, Math.max(0, HP_BAR_W * pct), HP_BAR_H);

  // Name + HP text
  ctx.fillStyle = ringColor;
  ctx.font = 'bold 10px system-ui';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 3;
  ctx.fillText(`${agent.name}  ${f.hp}/${f.maxHp}`, 0, PORTRAIT_R + 20);
  ctx.shadowBlur = 0;

  if (f.flashed && !f.eliminated) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(0, 0, PORTRAIT_R, 0, Math.PI * 2);
    ctx.fill();
  }

  if (f.eliminated && now - f.deathBorn > DEATH_FADE) {
    ctx.strokeStyle = COLORS.danger;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-PORTRAIT_R + 6, -PORTRAIT_R + 6);
    ctx.lineTo(PORTRAIT_R - 6, PORTRAIT_R - 6);
    ctx.moveTo(PORTRAIT_R - 6, -PORTRAIT_R + 6);
    ctx.lineTo(-PORTRAIT_R + 6, PORTRAIT_R - 6);
    ctx.stroke();
  }

  ctx.restore();
}
