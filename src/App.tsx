import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from './game/engine';
import { MOVES } from './game/moves';

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [active, setActive] = useState(-1);
  const [started, setStarted] = useState(false);
  const [sound, setSound] = useState(true);
  const [selected, setSelected] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!hostRef.current || !overlayRef.current) return;
    let eng: Engine | null = null;
    try {
      eng = new Engine(hostRef.current, overlayRef.current, {
        onMoveStart: (i) => setActive(i),
        onMoveEnd: () => setActive(-1),
      });
      engineRef.current = eng;
      (window as unknown as { __engine: Engine }).__engine = eng;
    } catch (e) {
      setErr(String(e));
    }
    return () => {
      eng?.dispose();
      engineRef.current = null;
    };
  }, []);

  const fire = useCallback((i: number) => {
    const e = engineRef.current;
    if (!e) return;
    if (e.trigger(i)) {
      setSelected(i);
      setStarted(true);
      if (reticleRef.current) reticleRef.current.style.setProperty('--rc', MOVES[i].color);
    }
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const n = parseInt(ev.key, 10);
      if (n >= 1 && n <= MOVES.length) fire(n - 1);
      if (ev.code === 'Space') {
        ev.preventDefault();
        fire(selected);
      }
      if (ev.key.toLowerCase() === 'm') toggleSound();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toggleSound = () => {
    setSound((s) => {
      engineRef.current?.sfx.init();
      engineRef.current?.sfx.setEnabled(!s);
      return !s;
    });
  };

  const onMove = (ev: React.PointerEvent) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    engineRef.current?.setPointer((x / r.width) * 2 - 1, -((y / r.height) * 2 - 1));
    if (reticleRef.current) reticleRef.current.style.transform = `translate(${x}px, ${y}px)`;
  };

  const start = () => {
    engineRef.current?.sfx.init();
    setStarted(true);
  };

  const cur = MOVES[active >= 0 ? active : selected];

  return (
    <div className={`relative h-full w-full overflow-hidden bg-black ${active >= 0 ? 'cine' : ''}`}>
      <div
        ref={hostRef}
        className="absolute inset-0"
        onPointerMove={onMove}
        onPointerDown={(ev) => {
          onMove(ev);
          if (started) fire(selected);
        }}
        style={{ cursor: 'none' }}
      />

      {/* comic-text / banner layer */}
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-20 overflow-hidden" />
      <div className="letterbox-top" />
      <div className="letterbox-bot" />

      <div ref={reticleRef} className="reticle" style={{ ['--rc' as string]: cur.color, opacity: started ? 1 : 0, transform: 'translate(50vw, 50vh)' }}>
        <i />
        <b />
      </div>

      {/* top-left logo */}
      <div className="pointer-events-none absolute left-5 top-4 z-10 select-none sm:left-8 sm:top-6">
        <div className="font-[Bangers] text-[11px] tracking-[0.5em] text-amber-200/80 sm:text-xs">ONE PIECE · 1st PERSON</div>
        <div className="title-glow font-[Dela_Gothic_One] text-2xl leading-none sm:text-4xl">GUM-GUM FURY</div>
      </div>

      {/* sound toggle */}
      <button
        onClick={toggleSound}
        className="absolute right-4 top-4 z-30 flex h-10 items-center gap-2 rounded-full border border-white/20 bg-black/40 px-4 text-xs font-semibold tracking-widest text-white/90 backdrop-blur transition hover:bg-black/60 sm:right-8 sm:top-6"
      >
        <span className={`inline-block h-2 w-2 rounded-full ${sound ? 'bg-emerald-400' : 'bg-red-500'}`} />
        {sound ? 'ÂM THANH' : 'TẮT TIẾNG'} <kbd className="rounded bg-white/15 px-1.5 py-0.5 text-[10px]">M</kbd>
      </button>

      {/* hint */}
      {started && active < 0 && (
        <div className="pointer-events-none absolute left-1/2 top-[14%] z-10 -translate-x-1/2 text-center text-[11px] font-medium tracking-[0.25em] text-white/75 sm:text-xs">
          DI CHUỘT ĐỂ NHẮM · CLICK / SPACE ĐỂ TUNG CHIÊU · PHÍM 1–6
        </div>
      )}

      {/* move bar */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-2 pb-3 sm:pb-5">
        {active >= 0 && (
          <div className="mb-1 flex items-center gap-3 text-[11px] tracking-[0.3em]" style={{ color: cur.color }}>
            <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: cur.color }} />
            ĐANG TUNG CHIÊU · {cur.en}
          </div>
        )}
        <div className="flex w-full max-w-[1200px] items-stretch justify-center gap-1.5 sm:gap-2.5">
          {MOVES.map((m, i) => {
            const on = active === i;
            return (
              <button
                key={m.id}
                disabled={active >= 0 && !on}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => fire(i)}
                className={`move-card group flex min-w-0 flex-1 flex-col items-start justify-between overflow-hidden px-3 pb-2 pt-2.5 text-left sm:px-4 sm:pb-2.5 ${on ? 'is-active' : ''}`}
                style={{
                  background: `linear-gradient(160deg, ${m.color}${on ? 'ee' : 'cc'} 0%, #14080e 78%)`,
                  boxShadow: `inset 0 0 0 1.5px ${m.color}`,
                  minHeight: 76,
                }}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="rounded-sm bg-black/70 px-1.5 py-0.5 font-[Bangers] text-sm leading-none tracking-widest text-white">{m.key}</span>
                  <span className="hidden font-[Bangers] text-[10px] tracking-[0.2em] text-white/80 sm:block">{m.gear}</span>
                </div>
                <div className="mt-1.5 w-full">
                  <div className="truncate font-[Dela_Gothic_One] text-[11px] leading-tight text-white sm:text-[15px]" style={{ textShadow: '0 2px 0 rgba(0,0,0,.6)' }}>
                    {m.jp}
                  </div>
                  <div className="hidden truncate font-[Bangers] text-[11px] tracking-[0.12em] text-white/80 md:block">{m.en.replace('GOMU GOMU NO ', '')}</div>
                  <div className="mt-0.5 hidden truncate text-[10px] text-white/60 lg:block">{m.blurb}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* intro */}
      {!started && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(10,4,16,.35),rgba(6,2,10,.82))] backdrop-blur-[2px]">
          <div className="float-in mx-4 max-w-2xl text-center">
            <div className="font-[Bangers] text-sm tracking-[0.6em] text-amber-200/90">ONE PIECE · FIRST PERSON</div>
            <h1 className="title-glow mt-2 font-[Dela_Gothic_One] text-5xl leading-[1.05] sm:text-8xl">GUM-GUM<br />FURY</h1>
            <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
              Nhìn qua đôi mắt của Luffy. Sáu tuyệt chiêu từ Pistol đến <b className="text-sky-200">Gear 5 · Bajrang Gun</b> – tung ra ngay trước mặt bạn.
            </p>
            <button
              onClick={start}
              className="group relative mt-8 inline-flex items-center gap-3 rounded-sm bg-gradient-to-b from-amber-300 to-orange-500 px-10 py-4 font-[Dela_Gothic_One] text-lg text-[#2a0c04] shadow-[0_6px_0_#7a2a0a,0_0_40px_rgba(255,140,40,.55)] transition active:translate-y-1 active:shadow-[0_2px_0_#7a2a0a]"
              style={{ clipPath: 'polygon(4% 0,100% 0,96% 100%,0 100%)' }}
            >
              <span className="pulse-ring absolute inset-0 border-2 border-amber-200" style={{ clipPath: 'polygon(4% 0,100% 0,96% 100%,0 100%)' }} />
              BẮT ĐẦU · 出航
            </button>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-[11px] tracking-[0.2em] text-white/55">
              <span>CHUỘT · NHẮM</span>
              <span>CLICK · TUNG CHIÊU</span>
              <span>1–6 · CHỌN CHIÊU</span>
              <span>🔊 BẬT LOA</span>
            </div>
          </div>
        </div>
      )}

      {err && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-8 text-center text-white">
          Không thể khởi tạo WebGL: {err}
        </div>
      )}
    </div>
  );
}
