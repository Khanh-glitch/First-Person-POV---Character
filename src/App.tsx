import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from './game/engine';
import type { HudState, MoveId, MoveInfo } from './game/moveData';
import { MOVES } from './game/moveData';
import { Hud, type CardState } from './components/Hud';
import { Intro } from './components/Intro';

const EMPTY_HUD: HudState = { cd: MOVES.map(() => 0), active: null, sunk: 0, combo: 0, locked: false, fps: 60 };

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const cardN = useRef(0);

  const [phase, setPhase] = useState<'loading' | 'intro' | 'play'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [card, setCard] = useState<CardState | null>(null);
  const [cinematic, setCinematic] = useState(false);
  const [muted, setMuted] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let eng: Engine;
    try {
      eng = new Engine(el, {
        onCast: (info: MoveInfo) => setCard({ info, n: ++cardN.current }),
        onHud: (s) => setHud(s),
        onCinematic: (on) => setCinematic(on),
      });
    } catch (e) {
      console.error(e);
      setError('Trình duyệt hoặc thiết bị này chưa hỗ trợ WebGL2 — hãy thử Chrome / Edge / Firefox mới nhất.');
      return;
    }
    engineRef.current = eng;
    const t = window.setTimeout(() => setPhase('intro'), 900);
    return () => {
      window.clearTimeout(t);
      eng.dispose();
      engineRef.current = null;
    };
  }, []);

  // custom reticle follows the pointer
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const r = reticleRef.current;
      if (r) r.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);

  const enter = useCallback(() => {
    engineRef.current?.start();
    setPhase('play');
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      engineRef.current?.audio.setMuted(!m);
      return !m;
    });
  }, []);

  const cast = useCallback((id: MoveId) => {
    engineRef.current?.audio.blip();
    engineRef.current?.cast(id);
  }, []);

  const step = useCallback(() => {
    const e = engineRef.current;
    if (e) e.moves.step(e.mouse.x < 0 ? -1 : 1);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05070b]">
      <div
        ref={mountRef}
        className="absolute inset-0"
        style={{ cursor: phase === 'play' ? 'none' : 'default', touchAction: 'none' }}
      />

      {phase === 'play' && (
        <Hud
          hud={hud}
          card={card}
          cinematic={cinematic}
          muted={muted}
          help={help}
          reticleRef={reticleRef}
          onToggleMute={toggleMute}
          onToggleHelp={() => setHelp((h) => !h)}
          onCast={cast}
          onStep={step}
        />
      )}

      {phase !== 'play' && !error && <Intro loading={phase === 'loading'} onEnter={enter} />}

      {error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-8 text-center">
          <div className="max-w-md">
            <div className="gold-text font-kanji mb-4 text-7xl">黄猿</div>
            <p className="text-amber-100">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
