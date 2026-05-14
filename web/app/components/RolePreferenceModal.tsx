"use client";
import { useEffect, useState } from "react";
import { X, Check, Shield, Swords, Crosshair, Sparkles, HandHeart } from "lucide-react";
import { DOTA_ROLES, type DotaRole } from "@/lib/types";

type Props = {
  tournamentId: string;
  uid: string;
  initialRoles?: DotaRole[];
  // If true, this opened on its own (the registered-but-unset auto-prompt).
  // Show a slightly softer "we need this to shuffle properly" framing.
  autoPrompt?: boolean;
  onClose: () => void;
  onSaved: (roles: DotaRole[]) => void;
};

const ROLE_ICON: Record<DotaRole, React.ComponentType<{ size?: number }>> = {
  safe_lane: Swords,
  mid: Crosshair,
  off_lane: Shield,
  soft_support: Sparkles,
  hard_support: HandHeart,
};

const ROLE_BLURB: Record<DotaRole, string> = {
  safe_lane: "Carry. Farm-priority. Win the late game.",
  mid: "Solo lane. Tempo controller. Roam early.",
  off_lane: "Tanky initiator. Soak pressure. Set picks.",
  soft_support: "Roamer. Vision + kills. Mid-game ganks.",
  hard_support: "Wards + saves. Babysit Pos 1. Sacrifice farm.",
};

export default function RolePreferenceModal({
  tournamentId,
  uid,
  initialRoles,
  autoPrompt,
  onClose,
  onSaved,
}: Props) {
  const [selected, setSelected] = useState<Set<DotaRole>>(
    new Set(initialRoles || [])
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const toggle = (role: DotaRole) => {
    setErr(null);
    const next = new Set(selected);
    if (next.has(role)) {
      next.delete(role);
    } else {
      if (next.size >= 5) return; // soft cap
      next.add(role);
    }
    setSelected(next);
  };

  const count = selected.size;
  const valid = count >= 2 && count <= 5;

  const handleSave = async () => {
    if (!valid) {
      setErr(count < 2 ? "Pick at least 2 roles" : "You can pick up to 5 roles");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const ordered = DOTA_ROLES.filter(r => selected.has(r.slug)).map(r => r.slug);
      const res = await fetch("/api/dota/role-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId, uid, roles: ordered }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      onSaved(ordered);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes rpm-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rpm-rise { from { opacity: 0; transform: translateY(20px) scale(0.97); }
                              to   { opacity: 1; transform: translateY(0)    scale(1); } }
        @keyframes rpm-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(161,43,31,0.45);}
                               50%     { box-shadow: 0 0 0 14px rgba(161,43,31,0);}}

        .rpm-backdrop {
          position: fixed; inset: 0; z-index: 9000;
          background: rgba(8, 5, 5, 0.82);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
          animation: rpm-fade .25s ease;
        }
        .rpm-card {
          width: 100%; max-width: 720px;
          max-height: calc(100vh - 32px);
          overflow-y: auto;
          background: linear-gradient(155deg, #1a0e0e 0%, #0d0707 100%);
          border: 1px solid rgba(161,43,31,0.45);
          border-radius: 20px;
          box-shadow: 0 30px 90px rgba(0,0,0,0.7), 0 0 40px rgba(161,43,31,0.25);
          animation: rpm-rise .35s cubic-bezier(.16,1,.3,1);
          position: relative;
        }
        .rpm-close {
          position: absolute; top: 14px; right: 14px;
          width: 36px; height: 36px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 50%;
          color: rgba(255,255,255,0.7);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all .15s;
        }
        .rpm-close:hover { background: rgba(161,43,31,0.2); color: #fff; border-color: rgba(161,43,31,0.5); }

        .rpm-head {
          padding: 30px 28px 18px;
          text-align: center;
          background-image:
            radial-gradient(ellipse at top, rgba(161,43,31,0.25) 0%, transparent 60%),
            linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%);
          border-radius: 20px 20px 0 0;
        }
        .rpm-eyebrow {
          font-size: 0.72rem; font-weight: 800; letter-spacing: 0.22em;
          color: #ff7560; text-transform: uppercase;
          margin-bottom: 10px;
        }
        .rpm-title {
          font-size: 1.85rem; font-weight: 900;
          color: #fff; letter-spacing: -0.02em; line-height: 1.15;
          margin-bottom: 8px;
        }
        .rpm-title span { color: #A12B1F; }
        .rpm-sub {
          font-size: 0.88rem; color: rgba(255,255,255,0.55);
          line-height: 1.5; max-width: 480px; margin: 0 auto;
        }
        .rpm-auto-banner {
          margin: 14px auto 0; max-width: 540px;
          padding: 9px 14px;
          background: rgba(161,43,31,0.15);
          border: 1px solid rgba(161,43,31,0.4);
          border-radius: 8px;
          font-size: 0.78rem; color: #ffb8ac;
          text-align: center;
          animation: rpm-pulse 2.2s ease-out infinite;
        }

        .rpm-grid {
          padding: 22px 24px 8px;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
        }

        .rpm-tile {
          position: relative;
          padding: 16px 10px 14px;
          background: rgba(255,255,255,0.03);
          border: 1.5px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          cursor: pointer;
          transition: all .2s cubic-bezier(.4,0,.2,1);
          text-align: center;
          color: rgba(255,255,255,0.7);
          font-family: inherit;
          display: flex; flex-direction: column; align-items: center; gap: 7px;
          overflow: hidden;
        }
        .rpm-tile::before {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(161,43,31,0.15) 0%, transparent 60%);
          opacity: 0; transition: opacity .2s;
          pointer-events: none;
        }
        .rpm-tile:hover {
          border-color: rgba(161,43,31,0.4);
          color: #fff;
          transform: translateY(-2px);
        }
        .rpm-tile:hover::before { opacity: 1; }
        .rpm-tile.selected {
          background: linear-gradient(160deg, rgba(161,43,31,0.32) 0%, rgba(122,31,21,0.18) 100%);
          border-color: #A12B1F;
          color: #fff;
          box-shadow: 0 6px 24px rgba(161,43,31,0.35), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .rpm-tile.selected::before { opacity: 1; }

        .rpm-tile-num {
          font-size: 0.62rem; font-weight: 800; letter-spacing: 0.1em;
          color: rgba(255,255,255,0.4);
          text-transform: uppercase;
        }
        .rpm-tile.selected .rpm-tile-num { color: #ff9d8a; }
        .rpm-tile-icon {
          width: 40px; height: 40px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .rpm-tile.selected .rpm-tile-icon {
          background: linear-gradient(135deg, #A12B1F 0%, #7A1F15 100%);
          border-color: rgba(255,255,255,0.2);
          color: #fff;
        }
        .rpm-tile-label {
          font-size: 0.82rem; font-weight: 700;
          line-height: 1.15;
        }
        .rpm-tile-check {
          position: absolute; top: 8px; right: 8px;
          width: 20px; height: 20px; border-radius: 50%;
          background: #A12B1F; color: #fff;
          display: flex; align-items: center; justify-content: center;
          opacity: 0; transform: scale(0.5);
          transition: all .2s cubic-bezier(.4,0,.2,1);
        }
        .rpm-tile.selected .rpm-tile-check { opacity: 1; transform: scale(1); }

        .rpm-blurb {
          padding: 6px 28px 14px;
          min-height: 44px;
          font-size: 0.84rem;
          color: rgba(255,255,255,0.55);
          text-align: center;
          font-style: italic;
          transition: opacity .2s;
        }

        .rpm-foot {
          padding: 18px 28px 28px;
          display: flex; flex-direction: column; gap: 12px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .rpm-counter {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          font-size: 0.82rem; color: rgba(255,255,255,0.55);
        }
        .rpm-counter-num {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 26px; height: 26px; padding: 0 8px;
          border-radius: 13px;
          background: rgba(161,43,31,0.2);
          border: 1px solid rgba(161,43,31,0.4);
          color: #fff; font-weight: 800;
        }
        .rpm-counter-num.valid { background: rgba(34,197,94,0.2); border-color: rgba(34,197,94,0.5); color: #86efac; }
        .rpm-err {
          padding: 10px 14px;
          background: rgba(220,38,38,0.12);
          border: 1px solid rgba(220,38,38,0.3);
          border-radius: 8px;
          color: #fca5a5; font-size: 0.82rem;
          text-align: center;
        }
        .rpm-save {
          width: 100%; padding: 14px 28px;
          background: linear-gradient(135deg, #A12B1F 0%, #7A1F15 100%);
          color: #fff; border: none; border-radius: 100px;
          font-size: 0.95rem; font-weight: 800; letter-spacing: 0.02em;
          font-family: inherit; cursor: pointer;
          transition: all .2s;
          box-shadow: 0 6px 22px rgba(161,43,31,0.4);
        }
        .rpm-save:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(161,43,31,0.5);
        }
        .rpm-save:disabled {
          opacity: 0.4; cursor: not-allowed;
          box-shadow: none;
        }

        @media (max-width: 640px) {
          .rpm-backdrop { padding: 0; align-items: flex-end; }
          .rpm-card {
            max-height: 92vh;
            border-radius: 20px 20px 0 0;
            animation: rpm-rise .35s cubic-bezier(.16,1,.3,1);
          }
          .rpm-head { padding: 26px 18px 14px; }
          .rpm-title { font-size: 1.45rem; }
          .rpm-sub { font-size: 0.82rem; }
          .rpm-grid {
            padding: 18px 14px 6px;
            grid-template-columns: repeat(2, 1fr);
            gap: 9px;
          }
          .rpm-grid > .rpm-tile:nth-child(5) {
            grid-column: 1 / -1;
            flex-direction: row;
            justify-content: flex-start;
            gap: 14px;
            padding: 14px 16px;
            text-align: left;
          }
          .rpm-grid > .rpm-tile:nth-child(5) .rpm-tile-num { order: 3; margin-left: auto; }
          .rpm-tile { padding: 14px 8px 12px; }
          .rpm-tile-icon { width: 36px; height: 36px; }
          .rpm-tile-label { font-size: 0.78rem; }
          .rpm-blurb { padding: 4px 18px 12px; min-height: 56px; font-size: 0.8rem; }
          .rpm-foot { padding: 14px 18px 22px; }
          .rpm-save { padding: 13px 24px; font-size: 0.9rem; }
        }
      `}</style>

      <div className="rpm-backdrop" onClick={() => !saving && onClose()}>
        <div className="rpm-card" onClick={(e) => e.stopPropagation()}>
          <button className="rpm-close" onClick={onClose} disabled={saving} aria-label="Close">
            <X size={18} />
          </button>

          <div className="rpm-head">
            <div className="rpm-eyebrow">Pick Your Positions</div>
            <div className="rpm-title">Which roles can you <span>play?</span></div>
            <div className="rpm-sub">
              We use this to balance the teams in shuffle. Pick every role you&apos;re comfortable
              with — your flexibility helps you get matched faster.
            </div>
            {autoPrompt && (
              <div className="rpm-auto-banner">
                You haven&apos;t picked your roles yet — we need this before shuffle.
              </div>
            )}
          </div>

          <div className="rpm-grid">
            {DOTA_ROLES.map(({ slug, label, short }) => {
              const Icon = ROLE_ICON[slug];
              const isSelected = selected.has(slug);
              return (
                <button
                  key={slug}
                  className={`rpm-tile${isSelected ? " selected" : ""}`}
                  onClick={() => toggle(slug)}
                  aria-pressed={isSelected}
                  type="button"
                >
                  <div className="rpm-tile-num">{short}</div>
                  <div className="rpm-tile-icon">
                    <Icon size={20} />
                  </div>
                  <div className="rpm-tile-label">{label}</div>
                  <div className="rpm-tile-check"><Check size={12} strokeWidth={3} /></div>
                </button>
              );
            })}
          </div>

          <div className="rpm-blurb">
            {(() => {
              if (count === 0) {
                return "Tap a role to begin — you need at least 2 picks.";
              }
              if (count === 1) {
                const only = DOTA_ROLES.find(r => selected.has(r.slug))!;
                return `Just ${only.label}? Pick one more — shuffle needs a backup.`;
              }
              const picked = DOTA_ROLES.filter(r => selected.has(r.slug));
              const labels = picked.map(r => r.label);
              const list = labels.length === 2
                ? `${labels[0]} + ${labels[1]}`
                : `${labels.slice(0, -1).join(", ")} + ${labels.slice(-1)}`;
              if (count === 5) return `${list} — true flex pick! Fastest matchmaking. 💪`;
              if (count === 4) return `${list} — high flex. You'll fit almost any team.`;
              if (count === 3) return `${list} — solid range.`;
              return `${list} — minimum picked. More roles = faster match.`;
            })()}
          </div>

          <div className="rpm-foot">
            {err && <div className="rpm-err">{err}</div>}
            <div className="rpm-counter">
              Selected
              <span className={`rpm-counter-num${valid ? " valid" : ""}`}>{count}</span>
              of 5 &middot; <em style={{fontStyle:"normal",opacity:0.8}}>min 2</em>
            </div>
            <button
              className="rpm-save"
              onClick={handleSave}
              disabled={!valid || saving}
            >
              {saving ? "Saving…" : `Save ${count > 0 ? `${count} role${count===1?"":"s"}` : "Roles"}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
