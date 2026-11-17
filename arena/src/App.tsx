import { useCallback, useEffect, useRef, useState } from 'react';
import Select from './ui/Select';
import Hud, { type LogLine } from './ui/Hud';
import { Arena, type HudSnapshot } from './engine/arena';
import { getCharacter, type CharId } from './data/roster';

type Screen = 'select' | 'fight' | 'result';

let logSeq = 0;

export default function App() {
  const [screen, setScreen] = useState<Screen>('select');
  const [player, setPlayer] = useState<CharId>('zoro');
  const [enemy, setEnemy] = useState<CharId>('kizaru');
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [result, setResult] = useState<'won' | 'lost' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arenaRef = useRef<Arena | null>(null);

  const pc = getCharacter(player);
  const ec = getCharacter(enemy);

  const pushLog = useCallback((text: string, color: string, kind: LogLine['kind']) => {
    setLogs((prev) => {
      const next = [...prev, { id: ++logSeq, text, color, kind }];
      return next.length > 24 ? next.slice(-24) : next;
    });
  }, []);

  /* ------------------------------------------------------------- start */
  const startFight = useCallback(
    (p: CharId, e: CharId) => {
      setPlayer(p);
      setEnemy(e);
      setResult(null);
      setLogs([]);
      setHud(null);
      setError(null);
      setReady(false);
      setScreen('fight');
    },
    [],
  );

  /* ------------------------------------------------------------- mount arena */
  useEffect(() => {
    if (screen !== 'fight') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let arena: Arena | null = null;
    try {
      arena = new Arena(canvas, {
        playerChar: player,
        enemyChar: enemy,
        onHud: (s) => {
          setHud(s);
          setReady(true);
        },
        onLog: pushLog,
        onEnd: (r) => {
          setResult(r);
          setScreen('result');
        },
      });
      arenaRef.current = arena;
    } catch (err) {
      console.error(err);
      setError(
        'Không khởi tạo được WebGL. Trình duyệt cần hỗ trợ WebGL2 — '
        + 'hãy thử Chrome hoặc Edge bản mới.',
      );
    }

    return () => {
      arena?.dispose();
      arenaRef.current = null;
    };
  }, [screen, player, enemy, pushLog]);

  /* ------------------------------------------------------------- esc */
  useEffect(() => {
    if (screen !== 'fight') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // ESC đã được trình duyệt dùng để thoát pointer lock
        arenaRef.current?.pause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);

  const quit = useCallback(() => {
    arenaRef.current?.dispose();
    arenaRef.current = null;
    setScreen('select');
    setHud(null);
    setResult(null);
  }, []);

  const rematch = useCallback(() => {
    setResult(null);
    setLogs([]);
    setHud(null);
    setScreen('select');
  }, []);

  /* ============================================================= render */

  if (screen === 'select') {
    return <Select onStart={startFight} />;
  }

  if (screen === 'result') {
    const won = result === 'won';
    return (
      <div className="relative flex h-full items-center justify-center overflow-hidden px-5">
        <div
          className="absolute inset-0"
          style={{
            background: won
              ? `radial-gradient(circle at 50% 40%, ${pc.color}2e, #05070d 68%)`
              : `radial-gradient(circle at 50% 40%, ${ec.color}2a, #05070d 68%)`,
          }}
        />
        <div className="relative z-10 w-full max-w-lg text-center" style={{ animation: 'popIn 0.4s ease-out' }}>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.3em] text-[#7f93b8]">
            Trận đấu kết thúc
          </p>
          <h2
            className="mb-3 font-black leading-none"
            style={{
              fontSize: 'clamp(46px,11vw,86px)',
              color: won ? pc.color : ec.color,
              textShadow: `0 0 46px ${won ? pc.color : ec.color}55`,
            }}
          >
            {won ? 'CHIẾN THẮNG' : 'THẤT BẠI'}
          </h2>
          <p className="mb-6 text-[13px] leading-relaxed text-[#9fb0cf]">
            {won ? (
              <>
                <b style={{ color: pc.color }}>{pc.name}</b> đã hạ{' '}
                <b style={{ color: ec.color }}>{ec.name}</b>.
              </>
            ) : (
              <>
                <b style={{ color: ec.color }}>{ec.name}</b> đã hạ gục{' '}
                <b style={{ color: pc.color }}>{pc.name}</b>.
              </>
            )}
          </p>

          <div className="mb-7 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[10px] uppercase tracking-wider text-[#6d7d99]">HP còn lại của bạn</div>
              <div className="mono mt-1 text-2xl font-black" style={{ color: pc.color }}>
                {hud ? Math.ceil(hud.playerHp) : 0}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[10px] uppercase tracking-wider text-[#6d7d99]">HP còn lại của địch</div>
              <div className="mono mt-1 text-2xl font-black" style={{ color: ec.color }}>
                {hud ? Math.ceil(hud.enemyHp) : 0}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={rematch}
              className="rounded-xl px-7 py-2.5 text-[13px] font-extrabold uppercase tracking-wider text-[#06090f] transition hover:brightness-110"
              style={{ background: `linear-gradient(100deg, ${pc.color}, ${ec.color})` }}
            >
              Trận mới
            </button>
            <button
              onClick={quit}
              className="rounded-xl border border-white/15 px-6 py-2.5 text-[13px] font-bold uppercase tracking-wider text-[#9fb0cf] transition hover:border-white/35 hover:text-white"
            >
              Về danh sách
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------- fight */
  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" />

      {error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 px-6">
          <div className="max-w-md rounded-xl border border-red-500/40 bg-red-950/40 p-6 text-center">
            <p className="mb-3 text-[14px] font-bold text-red-200">Không khởi tạo được đấu trường</p>
            <p className="mb-4 text-[12px] leading-relaxed text-red-200/70">{error}</p>
            <button
              onClick={quit}
              className="rounded-lg border border-white/20 px-4 py-2 text-[12px] font-bold text-white"
            >
              Quay lại
            </button>
          </div>
        </div>
      )}

      {!ready && !error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#05070d]">
          <div className="text-center">
            <div
              className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/15"
              style={{ borderTopColor: pc.color }}
            />
            <p className="text-[12px] uppercase tracking-[0.22em] text-[#7f93b8]">
              Đang dựng đấu trường
            </p>
          </div>
        </div>
      )}

      {hud && (
        <Hud
          hud={hud}
          playerName={pc.shortName}
          playerColor={pc.color}
          playerMoves={pc.moves.map((m) => ({
            id: m.id, name: m.name, kanji: m.kanji, key: m.key, ultimate: m.ultimate,
          }))}
          logs={logs}
          onLock={() => arenaRef.current?.requestPointerLock()}
          onQuit={quit}
        />
      )}
    </div>
  );
}
