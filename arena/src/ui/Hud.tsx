/**
 * HUD — lớp phủ trong trận đấu.
 *
 * Tất cả số liệu đến từ Arena.snapshot(): máu, cooldown, combo, trạng thái
 * hai bên, thanh niệm chiêu của đối thủ, và thanh cast của người chơi.
 */

import type { HudSnapshot } from '../engine/arena';

export interface LogLine {
  id: number;
  text: string;
  color: string;
  kind: 'hit' | 'status' | 'info' | 'ult';
}

interface Props {
  hud: HudSnapshot;
  playerName: string;
  playerColor: string;
  playerMoves: { id: string; name: string; kanji: string; key: string; ultimate?: boolean }[];
  logs: LogLine[];
  onLock: () => void;
  onQuit: () => void;
}

export default function Hud({
  hud, playerName, playerColor, playerMoves, logs, onLock, onQuit,
}: Props) {
  const pHpPct = (hud.playerHp / hud.playerMaxHp) * 100;
  const eHpPct = (hud.enemyHp / hud.enemyMaxHp) * 100;
  const lowHp = pHpPct <= 28;

  return (
    <div className="pointer-events-none fixed inset-0 select-none">
      {/* ------------------------------------------------- vignette */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          background: lowHp
            ? 'radial-gradient(circle at 50% 50%, transparent 42%, rgba(190,20,40,0.42) 100%)'
            : 'radial-gradient(circle at 50% 50%, transparent 55%, rgba(0,0,0,0.5) 100%)',
        }}
      />

      {/* ------------------------------------------------- crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-6 w-6">
          <span className="absolute left-1/2 top-0 h-1.5 w-px -translate-x-1/2 bg-white/70" />
          <span className="absolute bottom-0 left-1/2 h-1.5 w-px -translate-x-1/2 bg-white/70" />
          <span className="absolute left-0 top-1/2 h-px w-1.5 -translate-y-1/2 bg-white/70" />
          <span className="absolute right-0 top-1/2 h-px w-1.5 -translate-y-1/2 bg-white/70" />
          <span
            className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: playerColor, boxShadow: `0 0 8px ${playerColor}` }}
          />
        </div>
      </div>

      {/* ------------------------------------------------- top: HP bars */}
      <div className="absolute inset-x-0 top-0 px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="mx-auto flex max-w-[1240px] items-start gap-3 sm:gap-6">
          {/* player */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: playerColor }}>
                {playerName}
              </span>
              <span className="mono text-[10px] text-[#8b9ab8]">
                {Math.ceil(hud.playerHp)} / {hud.playerMaxHp}
              </span>
              {hud.combo > 1 && (
                <span
                  className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-black"
                  style={{ color: playerColor }}
                >
                  {hud.combo}× COMBO
                </span>
              )}
            </div>
            <Bar pct={pHpPct} color={playerColor} right={false} />
            {/* status của người chơi */}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {hud.statuses.map((s, i) => (
                <StatusPill key={i} label={s.label} color={s.color} remaining={s.remaining} total={s.total} />
              ))}
            </div>
          </div>

          {/* center marker */}
          <div className="shrink-0 pt-1 text-center">
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#4d5c76]">VS</div>
            <div className="mono mt-0.5 text-[9px] text-[#3f4c63]">{hud.fps} FPS</div>
          </div>

          {/* enemy */}
          <div className="min-w-0 flex-1 text-right">
            <div className="mb-1 flex items-baseline justify-end gap-2">
              <span className="mono text-[10px] text-[#8b9ab8]">
                {Math.ceil(hud.enemyHp)} / {hud.enemyMaxHp}
              </span>
              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: hud.enemyColor }}>
                {hud.enemyName}
              </span>
            </div>
            <Bar pct={eHpPct} color={hud.enemyColor} right />
            <div className="mt-1.5 flex flex-wrap justify-end gap-1">
              {hud.enemyStatuses.map((s, i) => (
                <StatusPill key={i} label={s.label} color={s.color} remaining={s.remaining} total={s.total} />
              ))}
            </div>
          </div>
        </div>

        {/* enemy windup warning */}
        {hud.enemyWindup && (
          <div className="mx-auto mt-3 max-w-md px-2">
            <div
              className="rounded-lg border px-3 py-1.5 backdrop-blur-sm"
              style={{
                borderColor: `${hud.enemyWindup.color}66`,
                background: `${hud.enemyWindup.color}18`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-bold uppercase tracking-wider" style={{ color: hud.enemyWindup.color }}>
                  ⚠ {hud.enemyWindup.moveName}
                </span>
                <span className="mono shrink-0 text-[10px] text-[#c6d4ef]">
                  {hud.enemyWindup.remaining.toFixed(2)}s
                </span>
              </div>
              <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full"
                  style={{
                    width: `${(1 - hud.enemyWindup.remaining / hud.enemyWindup.total) * 100}%`,
                    background: hud.enemyWindup.color,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------- damage popup */}
      {hud.lastHit && (
        <div
          key={hud.lastHit.id}
          className="absolute left-1/2 top-[38%] -translate-x-1/2"
          style={{ animation: 'floatHit 1.1s ease-out forwards' }}
        >
          <div
            className="text-center font-black drop-shadow-lg"
            style={{ color: hud.lastHit.color, fontSize: 34, lineHeight: 1 }}
          >
            -{hud.lastHit.damage}
          </div>
          <div className="mt-1 text-center text-[10px] font-bold uppercase tracking-wider text-white/70">
            {hud.lastHit.moveName}
          </div>
        </div>
      )}

      {/* ------------------------------------------------- cast bar */}
      {hud.castBar && (
        <div className="absolute inset-x-0 bottom-[122px] sm:bottom-[112px]">
          <div className="mx-auto max-w-sm px-4">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: hud.castBar.color }}>
                {hud.castBar.kanji}
              </span>
              <span className="text-[10px] font-semibold text-[#c6d4ef]">{hud.castBar.name}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-black/50">
              <div
                className="h-full transition-none"
                style={{ width: `${hud.castBar.k * 100}%`, background: hud.castBar.color, boxShadow: `0 0 10px ${hud.castBar.color}` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------- log feed */}
      <div className="absolute left-3 top-[104px] w-[228px] space-y-1 sm:left-6">
        {logs.slice(-6).map((l) => (
          <div
            key={l.id}
            className="truncate rounded px-2 py-0.5 text-[10.5px] backdrop-blur-sm"
            style={{
              background: 'rgba(6,9,15,0.55)',
              color: l.color,
              borderLeft: `2px solid ${l.color}`,
              opacity: 0.92,
            }}
          >
            {l.text}
          </div>
        ))}
      </div>

      {/* ------------------------------------------------- distance gauge */}
      <div className="absolute right-3 top-[104px] text-right sm:right-6">
        <div className="mono text-[10px] text-[#6d7d99]">
          KHOẢNG CÁCH <span className="text-[13px] font-bold text-[#c6d4ef]">{hud.distance.toFixed(1)}</span>m
        </div>
      </div>

      {/* ------------------------------------------------- skill bar */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 px-3 pb-3 sm:px-6 sm:pb-4">
        <div className="mx-auto flex max-w-[1240px] items-end gap-2 sm:gap-3">
          <button
            onClick={onQuit}
            className="shrink-0 rounded-lg border border-white/15 bg-black/50 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-[#8b9ab8] backdrop-blur transition hover:border-white/35 hover:text-white"
          >
            Thoát
          </button>

          <div className="flex flex-1 justify-center gap-1.5 sm:gap-2">
            {hud.cooldowns.map((cd) => {
              const meta = playerMoves.find((m) => m.id === cd.id);
              const k = cd.total > 0 ? cd.remaining / cd.total : 0;
              return (
                <div
                  key={cd.id}
                  className="relative w-[62px] shrink-0 overflow-hidden rounded-lg border backdrop-blur-sm sm:w-[74px]"
                  style={{
                    borderColor: cd.ready ? `${cd.color}88` : 'rgba(255,255,255,0.1)',
                    background: cd.ready ? `${cd.color}1c` : 'rgba(6,9,15,0.62)',
                    opacity: cd.ready ? 1 : 0.62,
                  }}
                >
                  <div className="px-1 pt-1.5 text-center">
                    <div className="text-[9px] font-black uppercase tracking-wider" style={{ color: cd.ready ? cd.color : '#5d6d88' }}>
                      {cd.key}
                    </div>
                    <div className="mono mt-0.5 line-clamp-2 min-h-[20px] px-0.5 text-[8.5px] leading-[1.15] text-[#a9b9d6]">
                      {meta?.kanji || cd.name}
                    </div>
                  </div>
                  <div className="mt-1 h-[3px] overflow-hidden bg-black/50">
                    <div
                      className="h-full"
                      style={{
                        width: `${(1 - k) * 100}%`,
                        background: cd.color,
                        opacity: cd.ready ? 1 : 0.5,
                      }}
                    />
                  </div>
                  {!cd.ready && (
                    <div className="mono absolute inset-0 flex items-center justify-center text-[15px] font-black text-white/60">
                      {cd.remaining.toFixed(1)}
                    </div>
                  )}
                  {cd.ultimate && (
                    <span
                      className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full"
                      style={{ background: cd.color, animation: 'glowBreath 2s infinite' }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden shrink-0 text-right sm:block">
            <div className="text-[9px] uppercase tracking-wider text-[#4d5c76]">HP</div>
            <div className="mono text-[13px] font-bold" style={{ color: playerColor }}>
              {Math.ceil(pHpPct)}%
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------- pointer lock hint */}
      {!hud.locked && (
        <button
          onClick={onLock}
          className="pointer-events-auto absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/62 backdrop-blur-sm"
        >
          <div className="text-[15px] font-extrabold uppercase tracking-[0.22em] text-white">
            Nhấp để khoá chuột
          </div>
          <div className="max-w-sm px-6 text-center text-[12px] leading-relaxed text-[#93a3c0]">
            WASD di chuyển · chuột để ngắm · phím số để ra chiêu<br />
            Nhấn <kbd className="rounded bg-white/15 px-1">ESC</kbd> để mở khoá chuột
          </div>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ bits */

function Bar({ pct, color, right }: { pct: number; color: string; right: boolean }) {
  return (
    <div className="relative h-2.5 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/10">
      <div
        className="absolute inset-y-0 transition-[width] duration-200"
        style={{
          width: `${pct}%`,
          [right ? 'right' : 'left']: 0,
          background: `linear-gradient(${right ? '270deg' : '90deg'}, ${color}88, ${color})`,
          boxShadow: `0 0 14px ${color}66`,
        }}
      />
    </div>
  );
}

function StatusPill({
  label, color, remaining, total,
}: { label: string; color: string; remaining: number; total: number }) {
  const k = total > 0 ? remaining / total : 0;
  return (
    <span
      className="relative overflow-hidden rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
      style={{ borderColor: `${color}77`, color }}
    >
      <span
        className="absolute inset-y-0 left-0 opacity-25"
        style={{ width: `${k * 100}%`, background: color }}
      />
      <span className="relative">{label}</span>
    </span>
  );
}
