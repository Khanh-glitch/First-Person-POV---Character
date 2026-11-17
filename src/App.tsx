import { useCallback, useEffect, useRef, useState } from "react";
import { Engine } from "./engine/engine";
import { CHAIN, MOVES, type MoveDef } from "./engine/moves";

interface Casting {
  def: MoveDef | { id: string; name: string; sub: string; kanji: string; color: string };
  idx: number;
  n: number;
  key: number;
}

const SLOTS = [
  ...MOVES.map((m) => ({ id: m.id, key: m.key, name: m.name, sub: m.sub, kanji: m.kanji, color: m.color, desc: m.desc })),
  { id: "chain", key: "5", name: CHAIN.name, sub: CHAIN.sub, kanji: CHAIN.kanji, color: CHAIN.color, desc: CHAIN.desc },
];

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const progRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);
  const [started, setStarted] = useState(false);
  const [casting, setCasting] = useState<Casting | null>(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    let engine: Engine;
    try {
      engine = new Engine(mountRef.current);
    } catch (e) {
      setError("Trình duyệt của bạn không hỗ trợ WebGL2 / WebGL — hãy thử Chrome hoặc Edge bản mới.");
      console.error(e);
      return;
    }
    engineRef.current = engine;
    (window as unknown as { __imu?: Engine }).__imu = engine;
    engine.onCast = (def, idx, n) => {
      counter.current++;
      setCasting({ def, idx, n, key: counter.current });
    };
    engine.onEnd = () => setCasting(null);
    engine.onProgress = (p) => {
      if (progRef.current) progRef.current.style.transform = `scaleX(${p})`;
    };
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const trigger = useCallback((id: string) => {
    const e = engineRef.current;
    if (!e) return;
    if (id === "chain") e.castChain(CHAIN.order);
    else e.cast(id);
  }, []);

  const start = () => {
    engineRef.current?.audio.init();
    setStarted(true);
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!started) {
        if (ev.key === "Enter" || ev.key === " ") start();
        return;
      }
      const slot = SLOTS.find((s) => s.key === ev.key);
      if (slot) trigger(slot.id);
      if (ev.key.toLowerCase() === "m") toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, trigger, muted]);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    engineRef.current?.audio.setMuted(m);
  };

  const busy = !!casting;
  const active = casting?.def;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black font-ui">
      <div ref={mountRef} className="absolute inset-0" />

      {error && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black p-8 text-center text-lg text-red-300">{error}</div>
      )}

      {/* cinematic letterbox */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-10 bg-black transition-[height] duration-700 ease-out"
        style={{ height: busy ? "7.5vh" : 0 }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 bg-black transition-[height] duration-700 ease-out"
        style={{ height: busy ? "7.5vh" : 0 }}
      />

      {/* HUD */}
      {started && (
        <>
          <div className="pointer-events-none absolute left-6 top-5 z-20 flex items-center gap-3 fade-up">
            <span className="font-jp text-3xl font-black text-white/90 text-glow" style={{ color: "#ff3b4e" }}>
              無
            </span>
            <div className="leading-tight">
              <div className="font-display text-sm font-bold tracking-[0.35em] text-white/90">IMU</div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/45">Vương Tọa Trống Rỗng · Pangaea</div>
            </div>
          </div>

          <div className="absolute right-6 top-5 z-30 flex items-center gap-2 fade-up">
            <button
              onClick={toggleMute}
              className="rounded-full border border-white/15 bg-black/40 px-4 py-1.5 text-xs tracking-widest text-white/70 backdrop-blur transition hover:border-white/40 hover:text-white"
            >
              {muted ? "🔇 TẮT TIẾNG" : "🔊 ÂM THANH"} <span className="ml-1 text-white/35">[M]</span>
            </button>
          </div>

          {/* crosshair */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-500"
            style={{ opacity: busy ? 0 : 0.5 }}
          >
            <div className="h-2 w-2 rotate-45 border border-white/70" />
          </div>

          {/* cast banner */}
          {casting && (
            <div key={casting.key} className="pointer-events-none absolute inset-x-0 top-[17%] z-20 flex flex-col items-center text-center">
              <div
                className="kanji-in font-jp font-black text-glow"
                style={{ fontSize: "min(22vw, 26vh)", color: active!.color, lineHeight: 1 }}
              >
                {active!.kanji}
              </div>
              <div className="kanji-in mt-2 font-display text-2xl font-extrabold tracking-[0.4em] text-white md:text-4xl" style={{ animationDelay: "0.08s" }}>
                {active!.name}
              </div>
              <div className="kanji-in mt-2 text-xs uppercase tracking-[0.5em] text-white/60 md:text-sm" style={{ animationDelay: "0.16s" }}>
                {active!.sub}
              </div>
              {casting.n > 1 && (
                <div className="mt-3 flex gap-2">
                  {Array.from({ length: casting.n }).map((_, i) => (
                    <span
                      key={i}
                      className="h-1 w-8 rounded-full"
                      style={{ background: i <= casting.idx ? "#f5d061" : "rgba(255,255,255,0.18)", boxShadow: i <= casting.idx ? "0 0 10px #f5d061" : "none" }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* skill bar */}
          <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center pb-5 transition-all duration-700" style={{ transform: busy ? "translateY(40vh)" : "none", opacity: busy ? 0 : 1 }}>
            <div className="mb-3 h-5 text-center text-xs tracking-[0.2em] text-white/55 transition-opacity" style={{ opacity: hover ? 1 : 0 }}>
              {SLOTS.find((s) => s.id === hover)?.desc}
            </div>
            <div className="flex items-end gap-2 px-3 md:gap-3">
              {SLOTS.map((s) => {
                const isChain = s.id === "chain";
                return (
                  <button
                    key={s.id}
                    onClick={() => trigger(s.id)}
                    onMouseEnter={() => setHover(s.id)}
                    onMouseLeave={() => setHover(null)}
                    disabled={busy}
                    className="group relative flex flex-col items-center overflow-hidden rounded-xl border bg-black/55 px-3 pb-2 pt-1.5 backdrop-blur-md transition duration-300 hover:-translate-y-1.5 disabled:opacity-40 md:px-5"
                    style={{
                      borderColor: `${s.color}66`,
                      width: isChain ? "clamp(92px,13vw,150px)" : "clamp(78px,11vw,128px)",
                      boxShadow: `0 0 24px ${s.color}22, inset 0 0 18px ${s.color}14`,
                    }}
                  >
                    <span className="absolute left-2 top-1 text-[10px] font-semibold text-white/50">{s.key}</span>
                    <span className="font-jp text-3xl font-black leading-none transition group-hover:scale-110 md:text-[2.6rem]" style={{ color: s.color, textShadow: `0 0 18px ${s.color}` }}>
                      {s.kanji.length > 2 ? s.kanji.slice(0, 2) : s.kanji}
                    </span>
                    <span className="mt-1 text-center font-display text-[9px] font-bold leading-tight tracking-[0.15em] text-white/90 md:text-[11px]">{s.name}</span>
                    <span className="hidden text-center text-[8px] uppercase tracking-[0.18em] text-white/40 md:block">{s.sub}</span>
                    <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${s.color}, transparent)` }} />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 text-[10px] uppercase tracking-[0.35em] text-white/30">Di chuột để nhìn quanh · Phím 1 – 5 để ra chiêu</div>
          </div>

          {/* progress */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-[3px]" style={{ opacity: busy ? 1 : 0 }}>
            <div ref={progRef} className="h-full origin-left" style={{ background: active ? active.color : "#fff", transform: "scaleX(0)", boxShadow: `0 0 12px ${active ? active.color : "#fff"}` }} />
          </div>
        </>
      )}

      {/* start screen */}
      <div
        className="absolute inset-0 z-40 flex flex-col items-center justify-center text-center transition-opacity duration-[1600ms]"
        style={{
          opacity: started ? 0 : 1,
          pointerEvents: started ? "none" : "auto",
          background: "radial-gradient(ellipse at center, rgba(8,0,12,0.35) 0%, rgba(0,0,0,0.88) 75%)",
          backdropFilter: started ? "blur(0px)" : "blur(3px)",
        }}
      >
        <div className="pointer-events-none absolute font-jp font-black text-white/[0.035]" style={{ fontSize: "min(80vw,90vh)", lineHeight: 1 }}>
          無
        </div>
        <div className="relative flex flex-col items-center px-6">
          <div className="fade-up text-[11px] uppercase tracking-[0.6em] text-red-300/70" style={{ animationDelay: "0.2s" }}>
            Nerona Imu · Vua của thế giới
          </div>
          <h1 className="title-in flicker mt-5 font-display text-7xl font-extrabold text-white md:text-9xl" style={{ textShadow: "0 0 40px #ff3b4e88, 0 0 120px #7a1cff66" }}>
            IMU
          </h1>
          <div className="line-grow my-6 h-px w-64 bg-gradient-to-r from-transparent via-red-400 to-transparent md:w-96" style={{ animationDelay: "0.6s" }} />
          <p className="fade-up max-w-xl text-sm leading-relaxed text-white/65 md:text-base" style={{ animationDelay: "0.9s" }}>
            Ngồi trên Vương Tọa Trống Rỗng, nhìn thế giới qua đôi mắt của Đấng Tối Cao. Hắc Viêm, Mother Flame, Vực Thẳm và Bá Vương Khí — trải nghiệm tuyệt chiêu ở góc nhìn thứ nhất.
          </p>
          <button
            onClick={start}
            className="fade-up mt-10 rounded-full border border-red-400/60 bg-red-950/40 px-10 py-4 text-sm font-semibold uppercase tracking-[0.4em] text-white transition hover:scale-105 hover:bg-red-900/60"
            style={{ animation: "fadeUp 1.2s 1.3s both, pulseGlow 2.6s 2.5s infinite" }}
          >
            Bước lên Vương Tọa
          </button>
          <div className="fade-up mt-6 text-[11px] uppercase tracking-[0.3em] text-white/35" style={{ animationDelay: "1.7s" }}>
            Bật âm thanh · Khuyên dùng tai nghe · Nhấn Enter
          </div>
          <div className="fade-up mt-10 max-w-lg text-[10px] leading-relaxed text-white/25" style={{ animationDelay: "2s" }}>
            Sản phẩm fan tribute phi thương mại. One Piece © Eiichiro Oda / Shueisha / Toei Animation. Toàn bộ mô hình, shader, hạt, âm thanh đều được tạo thủ tục bằng code — không sao chép tài nguyên có bản quyền.
          </div>
        </div>
      </div>
    </div>
  );
}
