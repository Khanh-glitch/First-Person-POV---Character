import { useEffect, useRef, useState, type ReactNode } from "react";
import { Game, CD_MAX, type HudState, type Callout, type Mode, type Skill } from "./game/Game";
import { sfx } from "./game/audio";
import { IconArrow, IconHaki, IconKick, IconKiss, IconMellow, Emblem, HeartPath } from "./ui/icons";

type Screen = "menu" | "play" | "over";

const SKILLS: { id: Skill; key: string; name: string; jp: string; icon: ReactNode }[] = [
  { id: "kiss", key: "LMB", name: "Pistol Kiss", jp: "ピストルキス", icon: <IconKiss /> },
  { id: "arrow", key: "RMB", name: "Slave Arrow", jp: "虜の矢", icon: <IconArrow /> },
  { id: "mellow", key: "Q", name: "Mero Mero Mellow", jp: "メロメロ甘風", icon: <IconMellow /> },
  { id: "kick", key: "E", name: "Perfume Femur", jp: "芳香脚", icon: <IconKick /> },
  { id: "haki", key: "R", name: "Haoshoku Haki", jp: "覇王色", icon: <IconHaki /> },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [screen, setScreen] = useState<Screen>("menu");
  const [hud, setHud] = useState<HudState | null>(null);
  const [callouts, setCallouts] = useState<Callout[]>([]);
  const [waveBanner, setWaveBanner] = useState<{ n: number; id: number } | null>(null);
  const [hitId, setHitId] = useState(0);
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState<HudState | null>(null);
  const [mode, setMode] = useState<Mode>("survival");

  useEffect(() => {
    const g = new Game(canvasRef.current!, {
      hud: setHud,
      callout: (c) => {
        setCallouts((cs) => [...cs.slice(-1), c]);
        setTimeout(() => setCallouts((cs) => cs.filter((x) => x.id !== c.id)), 2200);
      },
      wave: (n) => setWaveBanner({ n, id: Date.now() }),
      hit: () => setHitId((h) => h + 1),
      hurt: () => {},
      lock: setLocked,
      over: (h) => {
        setResult(h);
        setScreen("over");
      },
    });
    gameRef.current = g;
    (window as unknown as { __game: Game }).__game = g;
    return () => g.dispose();
  }, []);

  const start = (m: Mode) => {
    setMode(m);
    sfx.init();
    sfx.ui();
    setResult(null);
    setScreen("play");
    gameRef.current?.start(m);
  };

  return (
    <div className="fixed inset-0 bg-black text-white">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" onClick={() => screen === "play" && !locked && gameRef.current?.requestLock()} />

      {screen === "menu" && <Menu onStart={start} />}

      {screen === "play" && hud && (
        <>
          <Hud hud={hud} hitId={hitId} />
          {callouts.map((c) => (
            <CalloutView key={c.id} c={c} />
          ))}
          {waveBanner && (
            <div key={waveBanner.id} className="pointer-events-none absolute inset-x-0 top-[22%] text-center anim-wave">
              <div className="font-royal text-6xl md:text-7xl font-black gold-text drop-shadow-[0_4px_20px_rgba(255,120,60,.6)]">ĐỢT {waveBanner.n}</div>
              <div className="mt-2 text-pink-100/90 tracking-[0.4em] text-sm uppercase">Hải quân & hải tặc đang đổ bộ Amazon Lily</div>
            </div>
          )}
          {!locked && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm cursor-pointer" onClick={() => gameRef.current?.requestLock()}>
              <div className="text-center anim-fade">
                <Emblem className="w-24 h-24 mx-auto mb-4 anim-float" />
                <div className="font-royal text-4xl font-black pink-text">TẠM DỪNG</div>
                <div className="mt-3 text-pink-100/80">Nhấp chuột để tiếp tục · ESC để tạm dừng</div>
                <button
                  className="mt-6 px-6 py-2 rounded-full border border-pink-300/40 text-pink-100 hover:bg-pink-500/20 text-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    location.reload();
                  }}
                >
                  Về màn hình chính
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {screen === "over" && result && <GameOver r={result} onRetry={() => start(mode)} onMenu={() => location.reload()} />}
    </div>
  );
}

function Menu({ onStart }: { onStart: (m: Mode) => void }) {
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#2a0618]/90 via-transparent to-black/30 pointer-events-none" />
      <div className="relative min-h-full flex flex-col justify-center px-8 md:px-20 py-10 max-w-3xl">
        <div className="anim-fade flex items-center gap-4">
          <Emblem className="w-16 h-16 anim-float" />
          <div className="font-jp text-2xl md:text-3xl text-pink-200 tracking-[0.3em]">海賊女帝</div>
        </div>
        <h1 className="anim-fade font-royal font-black leading-[0.9] mt-4 text-6xl md:text-8xl pink-text drop-shadow-[0_6px_30px_rgba(255,40,120,.45)]" style={{ animationDelay: ".1s" }}>
          BOA
          <br />
          HANCOCK
        </h1>
        <div className="anim-fade mt-3 font-royal text-lg md:text-xl gold-text tracking-[0.35em]" style={{ animationDelay: ".2s" }}>
          MERO MERO · FIRST PERSON
        </div>
        <p className="anim-fade mt-6 text-pink-50/85 text-base md:text-lg max-w-xl italic" style={{ animationDelay: ".3s" }}>
          “Dù ta có làm gì đi nữa, thế gian vẫn sẽ tha thứ… <span className="not-italic font-bold text-pink-300">bởi vì ta xinh đẹp.</span>”
        </p>
        <p className="anim-fade mt-3 text-white/60 text-sm max-w-xl" style={{ animationDelay: ".35s" }}>
          Hóa thân thành Nữ Đế Hải Tặc. Biến kẻ thù thành tượng đá bằng sức mạnh trái Mero Mero, nghiền nát chúng bằng đôi chân kiêu sa và khiến cả đấu trường phải quỳ gối trước Bá Vương Sắc.
        </p>

        <div className="anim-fade mt-8 flex flex-wrap gap-4" style={{ animationDelay: ".45s" }}>
          <button
            onClick={() => onStart("survival")}
            className="group relative overflow-hidden px-8 py-4 rounded-lg bg-gradient-to-r from-[#c8004a] to-[#ff3f8e] font-black tracking-widest text-lg shadow-[0_0_40px_rgba(255,40,120,.55)] hover:scale-[1.04] transition"
          >
            <span className="absolute inset-0 shimmer" />
            <span className="relative">⚔ SINH TỒN</span>
            <div className="relative text-[11px] font-semibold tracking-normal opacity-80">Các đợt quân địch ngày càng mạnh</div>
          </button>
          <button
            onClick={() => onStart("sandbox")}
            className="relative px-8 py-4 rounded-lg border-2 border-[#ffd56a]/70 bg-black/40 font-black tracking-widest text-lg text-[#ffe9a8] hover:bg-[#ffd56a]/15 hover:scale-[1.04] transition"
          >
            ♛ SÂN TẬP
            <div className="text-[11px] font-semibold tracking-normal opacity-80">Bất tử · Hồi chiêu nhanh · Haki vô hạn</div>
          </button>
        </div>

        <div className="anim-fade mt-10 grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl" style={{ animationDelay: ".55s" }}>
          {SKILLS.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2 backdrop-blur">
              <div className="w-10 h-10 shrink-0 rounded-md bg-gradient-to-br from-[#3a0a22] to-[#14040c] p-1 border border-pink-300/30">{s.icon}</div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-pink-100 truncate">
                  {s.name} <span className="font-jp text-pink-300/80 text-xs ml-1">{s.jp}</span>
                </div>
                <div className="text-[11px] text-white/55">{DESC[s.id]}</div>
              </div>
              <kbd className="ml-auto text-xs font-bold px-2 py-1 rounded bg-black/60 border border-white/20 text-[#ffe9a8]">{s.key}</kbd>
            </div>
          ))}
          <div className="flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-[12px] text-white/70">
            <span className="text-[#ffe9a8] font-bold">WASD</span> di chuyển · <span className="text-[#ffe9a8] font-bold">Shift</span> chạy · <span className="text-[#ffe9a8] font-bold">Space</span> nhảy
          </div>
        </div>
        <div className="mt-8 text-[11px] text-white/35 max-w-xl">
          Fan-made · không liên kết với Eiichiro Oda / Shueisha / Toei. Mọi mô hình, hiệu ứng, âm thanh và nhạc đều được tạo hoàn toàn bằng code (procedural). Nên dùng tai nghe.
        </div>
      </div>
    </div>
  );
}

const DESC: Record<Skill, string> = {
  kiss: "Hôn gió — viên đạn trái tim hóa đá mục tiêu. Giữ để bắn liên tục.",
  arrow: "Giữ để nạp — nhả ra tối đa 30 mũi tên trái tim tự dẫn đường.",
  mellow: "Tạo hình trái tim — luồng sáng khổng lồ hóa đá mọi thứ phía trước.",
  kick: "Lướt + cú đá vòng cầu — nghiền nát tượng đá, phóng sóng hình trăng khuyết.",
  haki: "Khi thanh Mê Hoặc đầy — Bá Vương Sắc khiến mọi kẻ địch gục ngã.",
};

function Hud({ hud, hitId }: { hud: HudState; hitId: number }) {
  const hakiReady = hud.love >= 100;
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg width="34" height="34" viewBox="0 0 24 24" className="opacity-90 drop-shadow-[0_0_6px_rgba(255,60,140,.9)]">
          <path d={HeartPath} fill="none" stroke="#ffd1e6" strokeWidth="1.4" transform="translate(6 6) scale(0.5)" />
          <circle cx="12" cy="12" r="0.9" fill="#fff" />
        </svg>
        {hud.charge > 0 && (
          <svg width="80" height="80" viewBox="0 0 80 80" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90">
            <circle cx="40" cy="40" r="34" stroke="rgba(255,255,255,.15)" strokeWidth="3" fill="none" />
            <circle cx="40" cy="40" r="34" stroke={hud.charge >= 1 ? "#fff" : "#ff4f9a"} strokeWidth="3.5" fill="none" strokeDasharray={`${hud.charge * 213.6} 999`} strokeLinecap="round" />
          </svg>
        )}
      </div>
      {hitId > 0 && (
        <svg key={hitId} width="56" height="56" viewBox="0 0 24 24" className="absolute left-1/2 top-1/2 anim-hit">
          <path d={HeartPath} fill="#ff3f8e" opacity=".85" transform="translate(2 2) scale(0.83)" />
        </svg>
      )}

      {/* top left: wave/score */}
      <div className="absolute left-6 top-5">
        <div className="flex items-center gap-3">
          <Emblem className="w-12 h-12" />
          <div>
            <div className="font-royal text-[11px] tracking-[0.4em] text-pink-200/80">{hud.mode === "sandbox" ? "SÂN TẬP" : `ĐỢT ${hud.wave}`}</div>
            <div className="font-royal text-3xl font-black gold-text leading-none">{hud.score.toLocaleString()}</div>
          </div>
        </div>
        <div className="mt-2 flex gap-4 text-xs text-white/70">
          <span>🗿 Tượng đá: <b className="text-white">{hud.statues}</b></span>
          <span>💀 Hạ gục: <b className="text-white">{hud.kills}</b></span>
          <span>⚔ Còn lại: <b className="text-white">{hud.enemies}</b></span>
        </div>
      </div>

      {/* combo */}
      {hud.combo > 1 && (
        <div className="absolute right-10 top-[18%] text-right">
          <div key={hud.combo} className="anim-combo origin-right" style={{ transform: "rotate(-6deg)" }}>
            <div className="font-royal font-black text-7xl pink-text leading-none drop-shadow-[0_4px_18px_rgba(255,40,120,.7)]">{hud.combo}</div>
            <div className="font-jp text-xl text-pink-100 tracking-widest -mt-1">連撃 COMBO</div>
            <div className="text-[#ffe9a8] font-bold text-sm">x{(1 + Math.floor(hud.combo / 5) * 0.5).toFixed(1)}</div>
          </div>
          <div className="mt-2 ml-auto h-1 w-40 bg-white/15 rounded overflow-hidden">
            <div className="h-full bg-gradient-to-r from-pink-500 to-white" style={{ width: `${Math.max(0, hud.comboT / 3.5) * 100}%` }} />
          </div>
        </div>
      )}

      {/* bottom left: HP + love */}
      <div className="absolute left-6 bottom-6 w-[min(380px,40vw)]">
        <div className="flex items-end justify-between mb-1">
          <span className="font-royal font-black tracking-widest text-sm text-pink-100">BOA HANCOCK</span>
          <span className="text-xs text-white/70">{Math.ceil(hud.hp)} / 100</span>
        </div>
        <div className="h-3.5 skew-x-[-20deg] bg-black/60 border border-white/20 overflow-hidden">
          <div className="h-full transition-all duration-200 bg-gradient-to-r from-[#8a0020] via-[#ff2d6f] to-[#ffb3cf]" style={{ width: `${hud.hp}%` }} />
        </div>
        <div className="flex items-end justify-between mt-3 mb-1">
          <span className="text-[11px] tracking-[0.25em] text-[#ffe9a8]">MÊ HOẶC · 覇気</span>
          <span className={`text-[11px] font-bold ${hakiReady ? "text-red-400" : "text-white/60"}`}>{hakiReady ? "NHẤN R!" : `${Math.floor(hud.love)}%`}</span>
        </div>
        <div className={`h-2 skew-x-[-20deg] bg-black/60 border border-white/20 overflow-hidden ${hakiReady ? "anim-haki-ready" : ""}`}>
          <div className={`h-full ${hakiReady ? "bg-gradient-to-r from-black via-red-600 to-red-300" : "bg-gradient-to-r from-[#7a4a10] to-[#ffd56a]"}`} style={{ width: `${hud.love}%` }} />
        </div>
      </div>

      {/* skill bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3">
        {SKILLS.map((s) => {
          const cd = s.id === "haki" ? (hakiReady ? 0 : 1 - hud.love / 100) : hud.cds[s.id] / (CD_MAX[s.id] * (hud.mode === "sandbox" ? 0.25 : 1) || 1);
          const ready = cd <= 0.001;
          const big = s.id === "mellow" || s.id === "haki";
          return (
            <div key={s.id} className="flex flex-col items-center">
              <div
                className={`relative ${big ? "w-[72px] h-[72px]" : "w-16 h-16"} rounded-xl overflow-hidden border-2 ${
                  ready ? (s.id === "haki" ? "border-red-500 anim-haki-ready" : "border-pink-300/80 shadow-[0_0_18px_rgba(255,80,160,.6)]") : "border-white/15"
                } bg-gradient-to-br from-[#3a0a22] to-[#0e0308] p-2`}
              >
                <div className={ready ? "" : "grayscale opacity-50"}>{s.icon}</div>
                {!ready && (
                  <div
                    className="absolute inset-0"
                    style={{ background: `conic-gradient(rgba(0,0,0,.72) ${cd * 360}deg, transparent 0)` }}
                  />
                )}
                {!ready && s.id !== "haki" && s.id !== "kiss" && (
                  <div className="absolute inset-0 flex items-center justify-center font-black text-lg">{hud.cds[s.id].toFixed(1)}</div>
                )}
                <kbd className="absolute top-0.5 right-1 text-[10px] font-black text-[#ffe9a8] drop-shadow">{s.key}</kbd>
              </div>
              <div className="mt-1 text-[10px] font-jp text-pink-100/80">{s.jp}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalloutView({ c }: { c: Callout }) {
  return (
    <div className="pointer-events-none absolute left-[6%] top-[30%]">
      <div className="relative anim-callout">
        <div className="absolute -left-10 -right-24 top-1/2 -translate-y-1/2 h-[120%] anim-slash" style={{ background: `linear-gradient(90deg, transparent, ${c.color}cc 15%, ${c.color}55 70%, transparent)`, clipPath: "polygon(4% 0, 100% 8%, 96% 100%, 0 90%)" }} />
        <div className="relative px-4 py-2">
          <div className="font-jp text-5xl md:text-7xl text-white leading-none" style={{ textShadow: `0 0 20px ${c.color}, 0 4px 0 #000, 0 0 60px ${c.color}` }}>
            {c.jp}
          </div>
          <div className="font-royal font-black text-2xl md:text-4xl tracking-[0.2em] gold-text mt-2 drop-shadow-[0_3px_0_rgba(0,0,0,.7)]">{c.en}</div>
          <div className="text-sm md:text-base text-white/90 italic mt-1 drop-shadow">{c.sub}</div>
        </div>
      </div>
    </div>
  );
}

function GameOver({ r, onRetry, onMenu }: { r: HudState; onRetry: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/70 via-[#2a0012]/80 to-black/90 backdrop-blur-sm">
      <div className="text-center anim-fade px-6">
        <div className="font-jp text-3xl text-pink-300 tracking-[0.4em]">敗北</div>
        <div className="font-royal text-6xl md:text-7xl font-black pink-text mt-2">NỮ ĐẾ GỤC NGÃ</div>
        <p className="mt-3 text-white/70 italic">“Ta… không thể thua ở nơi này…”</p>
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
          {[
            ["Điểm", r.score.toLocaleString()],
            ["Đợt", r.wave],
            ["Tượng đá", r.statues],
            ["Hạ gục", r.kills],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl border border-pink-300/25 bg-white/5 px-5 py-4">
              <div className="text-xs tracking-widest text-pink-200/70 uppercase">{k}</div>
              <div className="font-royal text-3xl font-black gold-text">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex gap-4 justify-center">
          <button onClick={onRetry} className="px-8 py-3 rounded-lg bg-gradient-to-r from-[#c8004a] to-[#ff3f8e] font-black tracking-widest hover:scale-105 transition shadow-[0_0_30px_rgba(255,40,120,.5)]">
            CHIẾN TIẾP
          </button>
          <button onClick={onMenu} className="px-8 py-3 rounded-lg border border-white/30 font-bold hover:bg-white/10 transition">
            MÀN HÌNH CHÍNH
          </button>
        </div>
      </div>
    </div>
  );
}
