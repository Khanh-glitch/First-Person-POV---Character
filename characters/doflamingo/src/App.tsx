import { useCallback, useEffect, useRef, useState } from "react";
import { Engine, type EngineEvent } from "./engine/Engine";
import { MOVE_LIST } from "./engine/moves";
import { audio } from "./engine/Audio";

interface Sfx {
  id: number;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  rot: number;
}
interface Title {
  key: number;
  kanji: string;
  romaji: string;
  en: string;
  color: string;
}

let sfxId = 0;

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [started, setStarted] = useState(false);
  const [cinema, setCinema] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [title, setTitle] = useState<Title | null>(null);
  const [sfx, setSfx] = useState<Sfx[]>([]);
  const [muted, setMuted] = useState(false);
  const [auto, setAuto] = useState(false);
  const [shades, setShades] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [webglError, setWebglError] = useState(false);

  useEffect(() => {
    const mount = mountRef.current!;
    const overlay = overlayRef.current!;
    let engine: Engine;
    try {
      engine = new Engine(mount, overlay);
    } catch (err) {
      console.error(err);
      setWebglError(true);
      return;
    }
    engineRef.current = engine;
    (window as any).__engine = engine;
    const off = engine.on((e: EngineEvent) => {
      if (e.type === "title") {
        setActive(e.id);
        setTitle({ key: Date.now(), kanji: e.kanji, romaji: e.romaji, en: e.en, color: e.color });
      } else if (e.type === "sfx") {
        const id = ++sfxId;
        setSfx((s) => [...s.slice(-10), { id, ...e }]);
        setTimeout(() => setSfx((s) => s.filter((x) => x.id !== id)), 1300);
      } else if (e.type === "cinema") setCinema(e.on);
      else if (e.type === "moveEnd") setActive(null);
    });
    const onResize = () => engine.resize(mount.clientWidth, mount.clientHeight);
    window.addEventListener("resize", onResize);
    return () => {
      off();
      window.removeEventListener("resize", onResize);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!title) return;
    const k = title.key;
    const id = setTimeout(() => setTitle((t) => (t && t.key === k ? null : t)), 3200);
    return () => clearTimeout(id);
  }, [title]);

  const play = useCallback((id: string) => {
    engineRef.current?.play(id);
    setShowHelp(false);
  }, []);

  const start = () => {
    audio.init();
    setStarted(true);
    setTimeout(() => engineRef.current?.play("laugh"), 400);
  };

  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      const m = MOVE_LIST.find((x) => x.key === e.key);
      if (m) play(m.id);
      else if (e.key === "f" || e.key === "F") play("laugh");
      else if (e.key === "r" || e.key === "R") engineRef.current?.world.restore();
      else if (e.key === "g" || e.key === "G") setShades((s) => !s);
      else if (e.key === "m" || e.key === "M") toggleMute();
      else if (e.key === " ") {
        e.preventDefault();
        toggleAuto();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggleMute = () => {
    setMuted((m) => {
      audio.setMuted(!m);
      return !m;
    });
  };
  const toggleAuto = () => {
    setAuto((a) => {
      engineRef.current?.startAutoplay(!a);
      return !a;
    });
    setShowHelp(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    engineRef.current?.setMouse(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!started) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    engineRef.current?.clickShoot(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-black text-white">
      {/* 3D */}
      <div ref={mountRef} className="absolute inset-0 cursor-crosshair" onPointerMove={onPointerMove} onPointerDown={onPointerDown} />
      <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none mix-blend-screen" />

      {/* sunglasses lens */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          opacity: shades ? 1 : 0,
          background:
            "radial-gradient(ellipse 34% 46% at 30% 48%, rgba(255,80,40,0.10) 60%, rgba(120,0,40,0.55) 100%), radial-gradient(ellipse 34% 46% at 70% 48%, rgba(255,80,40,0.10) 60%, rgba(120,0,40,0.55) 100%)",
          mixBlendMode: "multiply",
        }}
      />

      {/* crosshair */}
      {started && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity" style={{ opacity: cinema ? 0 : 0.7 }}>
          <div className="w-5 h-5 relative">
            <div className="absolute left-1/2 top-0 w-px h-1.5 bg-pink-200" />
            <div className="absolute left-1/2 bottom-0 w-px h-1.5 bg-pink-200" />
            <div className="absolute top-1/2 left-0 h-px w-1.5 bg-pink-200" />
            <div className="absolute top-1/2 right-0 h-px w-1.5 bg-pink-200" />
            <div className="absolute left-1/2 top-1/2 w-1 h-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-300" />
          </div>
        </div>
      )}

      {/* letterbox */}
      <div className="absolute left-0 right-0 top-0 bg-black pointer-events-none transition-all duration-700 ease-out z-20" style={{ height: cinema ? "9vh" : 0 }} />
      <div className="absolute left-0 right-0 bottom-0 bg-black pointer-events-none transition-all duration-700 ease-out z-20" style={{ height: cinema ? "9vh" : 0 }} />

      {/* SFX */}
      <div className="absolute inset-0 pointer-events-none z-30">
        {sfx.map((s) => (
          <div
            key={s.id}
            className="sfx"
            style={
              {
                left: `${s.x * 100}%`,
                top: `${s.y * 100}%`,
                fontSize: `clamp(28px, ${s.size * 5.2}vw, ${s.size * 110}px)`,
                color: s.color,
                "--r": `${s.rot}deg`,
              } as React.CSSProperties
            }
          >
            {s.text}
          </div>
        ))}
      </div>

      {/* Title card */}
      {title && (
        <div key={title.key} className="title-card absolute left-[4vw] top-[16vh] z-30 pointer-events-none">
          <div className="relative">
            <div className="title-band absolute -left-[6vw] -right-[4vw] top-[18%] bottom-[8%]" style={{ background: `linear-gradient(90deg, ${title.color}ee, ${title.color}55 70%, transparent)` }} />
            <div className="title-band absolute -left-[6vw] right-[20%] top-[86%] h-[3px] bg-white" style={{ animationDelay: "0.1s" }} />
            <div className="relative px-2">
              <div className="title-sub font-bebas tracking-[0.35em] text-white/90 text-[clamp(12px,1.3vw,20px)] drop-shadow">
                ドンキホーテ・ドフラミンゴ — 糸糸の実
              </div>
              <div
                className="title-kanji font-mincho leading-none text-white"
                style={{
                  fontSize: "clamp(56px, 9vw, 150px)",
                  textShadow: `0 0 30px ${title.color}, 0.04em 0.05em 0 #12040c, -0.02em -0.02em 0 #12040c`,
                  WebkitTextStroke: "2px #12040c",
                }}
              >
                {title.kanji}
              </div>
              <div className="title-sub flex items-baseline gap-4 mt-1" style={{ animationDelay: "0.45s" }}>
                <span className="font-bebas text-[clamp(26px,3.4vw,54px)] tracking-wider text-white drop-shadow-[0_2px_0_#12040c]">{title.romaji}</span>
                <span className="font-vn font-semibold text-[clamp(12px,1.2vw,18px)] uppercase tracking-[0.3em] text-white/80">{title.en}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HUD top */}
      {started && (
        <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-4 md:p-6 z-40 pointer-events-none">
          <div className="transition-opacity duration-500" style={{ opacity: cinema ? 0 : 1 }}>
            <div className="font-bebas text-2xl md:text-3xl tracking-[0.2em] shimmer-text leading-none">DONQUIXOTE DOFLAMINGO</div>
            <div className="text-[11px] md:text-xs text-pink-100/70 tracking-[0.35em] mt-1 font-jp">天夜叉 · イトイトの実</div>
          </div>
          <div className="flex gap-2 pointer-events-auto">
            <HudBtn on={auto} onClick={toggleAuto} label={auto ? "■ Dừng trình diễn" : "▶ Trình diễn"} hint="Space" />
            <HudBtn onClick={() => play("laugh")} label="フッフッフッ" hint="F" />
            <HudBtn on={shades} onClick={() => setShades((s) => !s)} label="Kính" hint="G" />
            <HudBtn onClick={() => engineRef.current?.world.restore()} label="Hồi phục" hint="R" />
            <HudBtn on={!muted} onClick={toggleMute} label={muted ? "🔇" : "🔊"} hint="M" />
          </div>
        </div>
      )}

      {/* Move bar */}
      {started && (
        <div className="absolute left-0 right-0 bottom-0 z-40 p-3 md:p-5 transition-all duration-500 pointer-events-none" style={{ opacity: cinema ? 0 : 1, transform: cinema ? "translateY(30px)" : "none" }}>
          {showHelp && (
            <div className="text-center mb-3 text-[12px] md:text-sm text-pink-50/80 tracking-wide">
              <span className="px-3 py-1 rounded-full bg-black/40 backdrop-blur border border-white/10">
                Nhấn <b className="text-pink-300">1–8</b> để tung tuyệt chiêu · <b className="text-pink-300">Click</b> để bắn chỉ · Di chuột để nhìn quanh · <b className="text-pink-300">Space</b> trình diễn tự động
              </span>
            </div>
          )}
          <div className="mx-auto max-w-[1400px] grid grid-cols-4 lg:grid-cols-8 gap-2 pointer-events-auto">
            {MOVE_LIST.map((m) => {
              const isActive = active === m.id;
              return (
                <button
                  key={m.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    play(m.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`group relative text-left rounded-lg overflow-hidden px-3 py-2 md:py-2.5 bg-gradient-to-br from-black/70 to-[#2a0a1e]/70 backdrop-blur-md transition-all duration-200 hover:-translate-y-1 ${isActive ? "card-active -translate-y-1" : "card-glow"}`}
                  style={{ "--c": m.color } as React.CSSProperties}
                >
                  <div className="absolute inset-y-0 left-0 w-[3px] transition-all group-hover:w-[5px]" style={{ background: m.color, boxShadow: `0 0 12px ${m.color}` }} />
                  <div className="absolute -right-2 -bottom-4 font-mincho text-5xl md:text-6xl opacity-[0.08] group-hover:opacity-20 transition-opacity whitespace-nowrap" style={{ color: m.color }}>
                    {m.kanji.slice(-2)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bebas text-xs w-5 h-5 grid place-items-center rounded bg-white/10 text-white/80">{m.key}</span>
                    <span className="font-jp text-[13px] md:text-[15px] truncate" style={{ color: m.color }}>
                      {m.kanji}
                    </span>
                  </div>
                  <div className="font-bebas tracking-wider text-[15px] md:text-lg leading-tight mt-0.5 text-white truncate">{m.romaji}</div>
                  <div className="text-[10px] md:text-[11px] text-white/50 truncate hidden md:block">{m.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Intro */}
      {!started && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(20,4,16,0.55),rgba(5,0,6,0.92))]">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 34 }).map((_, i) => (
              <div
                key={i}
                className="thread-line"
                style={{
                  left: `${(i * 37) % 100}%`,
                  height: `${30 + ((i * 53) % 60)}vh`,
                  animationDuration: `${2.5 + ((i * 7) % 10) * 0.35}s`,
                  animationDelay: `${-(i % 9) * 0.6}s`,
                  opacity: 0.25 + ((i * 13) % 10) / 20,
                }}
              />
            ))}
          </div>
          <div className="intro-fade relative text-center px-6 max-w-3xl">
            <div className="font-jp text-pink-300/80 tracking-[0.6em] text-xs md:text-sm mb-4">ONE PIECE · FAN-MADE EXPERIENCE</div>
            <div className="font-mincho text-[18vw] md:text-[150px] leading-none text-white" style={{ textShadow: "0 0 40px #ff2a8a, 0 0 90px #ff2a8a88" }}>
              天夜叉
            </div>
            <div className="font-bebas text-4xl md:text-6xl tracking-[0.18em] shimmer-text mt-2">DONQUIXOTE DOFLAMINGO</div>
            <div className="text-pink-50/70 mt-4 text-sm md:text-base leading-relaxed">
              Trải nghiệm <b className="text-white">góc nhìn thứ nhất</b> của Thiên Dạ Xoa — năng lực trái <span className="font-jp text-pink-300">イトイトの実</span>.
              <br />8 tuyệt chiêu: Tamaito, Overheat, Goshikito, Parasite, Fulbright, Torikago, God Thread & Thức tỉnh.
            </div>
            {webglError ? (
              <div className="mt-8 text-red-300">Trình duyệt không hỗ trợ WebGL.</div>
            ) : (
              <button
                onClick={start}
                className="group relative mt-10 px-12 py-4 font-bebas text-2xl tracking-[0.4em] text-white rounded-sm overflow-hidden border border-pink-300/50 hover:border-pink-200 transition-all hover:scale-105"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-pink-600 via-fuchsia-500 to-pink-600 opacity-80 group-hover:opacity-100 transition-opacity" />
                <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.45)_50%,transparent_70%)] bg-[length:250%_100%] animate-[shimmer_2.2s_linear_infinite]" />
                <span className="relative">BẮT ĐẦU · 開始</span>
              </button>
            )}
            <div className="mt-6 text-[11px] text-white/40 tracking-widest">Bật âm thanh để trải nghiệm trọn vẹn · Khuyến nghị dùng tai nghe</div>
          </div>
        </div>
      )}
    </div>
  );
}

function HudBtn({ label, onClick, hint, on }: { label: string; onClick: () => void; hint?: string; on?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={`relative px-3 py-1.5 rounded-md text-xs md:text-sm backdrop-blur-md border transition-all hover:scale-105 ${on ? "bg-pink-500/30 border-pink-300/60 text-white" : "bg-black/40 border-white/15 text-white/80 hover:text-white"}`}
    >
      <span className="font-semibold">{label}</span>
      {hint && <span className="ml-1.5 text-[10px] text-white/40 font-bebas tracking-wider">{hint}</span>}
    </button>
  );
}
