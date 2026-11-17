import { useCallback, useEffect, useRef, useState } from "react";
import { Engine } from "./game/Engine";
import { MOVES } from "./game/Moves";
import { HUD, Intro, type CastState, type DamagePop } from "./components/HUD";

declare global {
  interface Window {
    __kid?: Engine;
  }
}

type Cool = Record<string, { seq: number; cd: number; until: number }>;

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const seq = useRef(0);
  const popId = useRef(0);
  const demo = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

  const [started, setStarted] = useState(demo);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cast, setCast] = useState<CastState | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cools, setCools] = useState<Cool>({});
  const [hp, setHp] = useState(60000);
  const [maxHp, setMaxHp] = useState(60000);
  const [pops, setPops] = useState<DamagePop[]>([]);
  const [total, setTotal] = useState<{ hits: number; dmg: number; seq: number } | null>(null);
  const [down, setDown] = useState(0);
  const [auto, setAuto] = useState(false);
  const [muted, setMuted] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    if (!host.current) return;
    let e: Engine;
    try {
      e = new Engine(host.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "WebGL không khả dụng");
      return;
    }
    engine.current = e;
    window.__kid = e;
    setHp(e.colossus.hp);
    setMaxHp(e.colossus.maxHp);
    e.events = {
      onCast: (id) => {
        const info = MOVES.find((m) => m.id === id)!;
        const s = ++seq.current;
        setCast({ id, seq: s });
        setActiveId(id);
        setTotal({ hits: 0, dmg: 0, seq: s });
        setCools((c) => ({ ...c, [id]: { seq: s, cd: info.cd, until: performance.now() + info.cd * 1000 } }));
        window.setTimeout(() => force((n) => n + 1), info.cd * 1000 + 30);
      },
      onMoveEnd: () => setActiveId(null),
      onBoss: (h, m) => {
        setHp(h);
        setMaxHp(m);
      },
      onDamage: (amount, big) => {
        const id = ++popId.current;
        const pop: DamagePop = { id, amount, big, x: 50 + (Math.random() * 2 - 1) * (big ? 6 : 14), y: (big ? 30 : 34) + (Math.random() * 2 - 1) * 8 };
        setPops((p) => [...p.slice(-14), pop]);
        setTotal((t) => (t ? { ...t, hits: t.hits + 1, dmg: t.dmg + amount } : t));
        window.setTimeout(() => setPops((p) => p.filter((q) => q.id !== id)), 1300);
      },
      onBossDown: () => setDown((d) => d + 1),
    };
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, []);

  const start = useCallback(() => {
    engine.current?.audio.start();
    setLeaving(true);
    window.setTimeout(() => setStarted(true), 650);
  }, []);

  const onCast = useCallback((id: string) => {
    engine.current?.audio.start();
    engine.current?.cast(id);
  }, []);

  const onAuto = useCallback(() => {
    setAuto((a) => {
      if (engine.current) engine.current.auto = !a;
      return !a;
    });
  }, []);

  const onMute = useCallback(() => {
    setMuted((m) => {
      engine.current?.audio.start();
      engine.current?.audio.setMuted(!m);
      return !m;
    });
  }, []);

  return (
    <div className="stage">
      <div ref={host} className="stage-canvas" />
      {error ? (
        <div className="intro">
          <div className="intro-body">
            <h1 className="intro-title"><span>WEBGL</span><span className="intro-kid">LỖI</span></h1>
            <p className="intro-lead">Trình duyệt của bạn không khởi tạo được WebGL2: {error}</p>
          </div>
        </div>
      ) : (
        <>
          <HUD
            started={started}
            cast={cast}
            activeId={activeId}
            cools={cools}
            hp={hp}
            maxHp={maxHp}
            pops={pops}
            total={total}
            down={down}
            auto={auto}
            muted={muted}
            onCast={onCast}
            onAuto={onAuto}
            onMute={onMute}
          />
          {!started && <Intro onStart={start} leaving={leaving} />}
        </>
      )}
    </div>
  );
}
