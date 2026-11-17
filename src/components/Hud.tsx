import { useEffect, useRef, useState, type RefObject } from 'react';
import { MOVES, type HudState, type MoveId, type MoveInfo } from '../game/moveData';

export interface CardState {
  info: MoveInfo;
  n: number;
}

interface Props {
  hud: HudState;
  card: CardState | null;
  cinematic: boolean;
  muted: boolean;
  help: boolean;
  reticleRef: RefObject<HTMLDivElement | null>;
  onToggleMute: () => void;
  onToggleHelp: () => void;
  onCast: (id: MoveId) => void;
  onStep: () => void;
}

const GLYPH: Record<MoveId, string> = {
  magatama: '玉',
  murakumo: '劍',
  kagami: '鏡',
  amaterasu: '照',
  iwato: '岩',
};

export function Hud({ hud, card, cinematic, muted, help, reticleRef, onToggleMute, onToggleHelp, onCast, onStep }: Props) {
  const prev = useRef<number[]>(MOVES.map(() => 0));
  const [flash, setFlash] = useState<number[]>(MOVES.map(() => 0));

  useEffect(() => {
    let changed = false;
    const next = [...flash];
    hud.cd.forEach((c, i) => {
      if (prev.current[i] > 0 && c === 0 && MOVES[i].cooldown > 1) {
        next[i]++;
        changed = true;
      }
    });
    prev.current = hud.cd;
    if (changed) setFlash(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hud.cd]);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none">
      {/* cinematic bars */}
      <div className={`bar ${cinematic ? 'on' : ''}`} style={{ top: 0 }} />
      <div className={`bar ${cinematic ? 'on' : ''}`} style={{ bottom: 0 }} />

      {/* anime speed lines on cast */}
      {card && <div key={'sl' + card.n} className="speedlines" />}

      {/* reticle */}
      <div ref={reticleRef} className={`reticle ${hud.locked ? 'locked' : ''}`} style={{ transform: 'translate(-100px,-100px)' }}>
        <div className="reticle-ring" />
        <div className="reticle-dot" />
      </div>

      {/* stats */}
      <div className="absolute left-4 top-4 flex flex-col gap-2 sm:left-7 sm:top-6">
        <div className="glass flex items-center gap-3 rounded-lg px-4 py-2">
          <div className="font-kanji text-2xl text-amber-300">沈</div>
          <div className="leading-none">
            <div className="font-hud text-[11px] tracking-[0.3em] text-white/60">TÀU BỊ ĐÁNH CHÌM</div>
            <div className="font-hud text-3xl font-bold text-white">{hud.sunk}</div>
          </div>
        </div>
        {hud.combo > 1 && (
          <div key={hud.combo} className="combo-pop font-hud flex items-baseline gap-2 pl-2">
            <span className="gold-text text-5xl font-extrabold italic">×{hud.combo}</span>
            <span className="text-xs font-semibold tracking-[0.35em] text-amber-200">COMBO</span>
          </div>
        )}
      </div>

      {/* top-right buttons */}
      <div className="absolute right-4 top-4 flex gap-2 sm:right-7 sm:top-6">
        <button onClick={(e) => { onToggleMute(); e.currentTarget.blur(); }} className="glass pointer-events-auto rounded-lg px-3 py-2 text-xs font-semibold tracking-wider text-amber-100 hover:text-white">
          {muted ? '🔇 TẮT TIẾNG' : '🔊 ÂM THANH'}
        </button>
        <button onClick={(e) => { onToggleHelp(); e.currentTarget.blur(); }} className="glass pointer-events-auto rounded-lg px-3 py-2 text-xs font-semibold tracking-wider text-amber-100 hover:text-white">
          ? HƯỚNG DẪN
        </button>
      </div>

      {/* move title card */}
      {card && (
        <div key={card.n} className="card absolute left-[5vw] top-[34%] max-w-[90vw]" style={{ ['--c' as string]: card.info.color }}>
          <div className="font-hud mb-1 text-xs font-bold tracking-[0.5em] sm:text-sm" style={{ color: card.info.color }}>
            {card.info.tag}
          </div>
          <div className="card-kanji gold-text font-kanji text-[15vw] leading-[1.02] sm:text-[8.5rem]" style={{ filter: `drop-shadow(0 0 26px ${card.info.color})` }}>
            {card.info.kanji}
          </div>
          <div className="card-line mt-2 w-[min(78vw,640px)]" />
          <div className="card-sub font-hud mt-2 text-2xl font-bold uppercase tracking-[0.22em] text-white sm:text-4xl" style={{ textShadow: '0 2px 14px rgba(0,0,0,.8)' }}>
            {card.info.romaji}
          </div>
          <div className="card-sub2 mt-1 text-sm font-medium text-amber-100/90 sm:text-lg" style={{ textShadow: '0 2px 10px rgba(0,0,0,.9)' }}>
            {card.info.vi} · <span className="text-white/70">{card.info.desc}</span>
          </div>
        </div>
      )}

      {/* subtitle */}
      {card && (
        <div key={'sub' + card.n} className="subtitle absolute bottom-[19%] left-0 right-0 text-center sm:bottom-[22%]">
          <div className="font-kanji text-xl text-white sm:text-3xl">「{card.info.quoteJa}」</div>
          <div className="mt-1 text-sm italic text-amber-100/90 sm:text-lg">{card.info.quoteVi}</div>
        </div>
      )}

      {/* skill bar */}
      <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-2 sm:bottom-6">
        <div className="flex items-end gap-2 sm:gap-3">
          {MOVES.map((m, i) => {
            const cd = hud.cd[i];
            const active = hud.active === m.id;
            return (
              <button
                key={`${m.id}-${flash[i]}`}
                onClick={(e) => { onCast(m.id); e.currentTarget.blur(); }}
                className={`slot ${active ? 'active' : ''} ${flash[i] ? 'ready-flash' : ''}`}
                style={{ ['--c' as string]: m.color }}
                title={`${m.romaji} — ${m.vi}`}
              >
                <div className="slot-border" />
                <div className="slot-inner" />
                <div className="slot-body" style={{ background: 'transparent' }}>
                  <div className="cd" style={{ ['--p' as string]: `${cd * 360}deg` }} />
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="font-kanji text-4xl leading-none sm:text-[44px]" style={{ color: m.color, textShadow: `0 0 16px ${m.color}` }}>
                    {GLYPH[m.id]}
                  </div>
                  <div className="font-hud mt-1 max-w-[70px] truncate text-[9px] font-semibold uppercase tracking-wide text-white/75 sm:text-[10px]">
                    {m.romaji.split(' ').slice(0, 2).join(' ')}
                  </div>
                </div>
                <div className="keycap absolute -top-2.5 left-1/2 -translate-x-1/2" style={{ minWidth: 22, height: 22, fontSize: 12 }}>
                  {m.key}
                </div>
                {cd > 0 && (
                  <div className="font-hud absolute bottom-1 right-2 text-sm font-bold text-white/90">
                    {Math.ceil(cd * m.cooldown)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <button onClick={(e) => { onStep(); e.currentTarget.blur(); }} className="glass pointer-events-auto flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] text-white/80 hover:text-white">
          <span className="keycap" style={{ minWidth: 20, height: 20, fontSize: 11 }}>SHIFT</span>
          <span className="tracking-[0.2em]"><span className="font-kanji">光速移動</span> · <span className="font-hud">BƯỚC ÁNH SÁNG</span></span>
        </button>
      </div>

      {/* help */}
      {help && (
        <div className="glass pointer-events-auto absolute bottom-28 left-4 max-w-sm rounded-xl p-4 text-sm sm:left-7" onClick={onToggleHelp}>
          <div className="font-hud mb-2 text-sm font-bold tracking-[0.3em] text-amber-300">ĐIỀU KHIỂN</div>
          <ul className="space-y-1.5 text-[13px] text-white/85">
            <li><span className="keycap">Chuột</span> ngắm — tâm ngắm chuyển đỏ khi khóa mục tiêu</li>
            <li><span className="keycap">Giữ chuột trái</span> mưa đạn ánh sáng</li>
            <li><span className="keycap">Chuột phải</span> kiếm ánh sáng chém chữ X</li>
            <li><span className="keycap">Space</span> phản chiếu & cước tốc độ ánh sáng</li>
            <li><span className="keycap">4</span> chớp sáng + mưa cột sáng · <span className="keycap">5</span> laser tối thượng</li>
            <li><span className="keycap">Shift</span> / <span className="keycap">A</span><span className="keycap">D</span> bước ánh sáng</li>
          </ul>
          <div className="mt-2 text-[11px] text-white/45">Nhấp để đóng</div>
        </div>
      )}
    </div>
  );
}
