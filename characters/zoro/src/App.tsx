import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  Flame,
  Gauge,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { TECHNIQUES, TechniqueId, TechniqueSpec } from './data/techniques';
import { sakugaAudio } from './audio/sakugaAudio';
import { EngineHudSnapshot, ZoroSakugaEngine } from './engine/zoroEngine';
import {
  CalligraphyEvent,
  CutInEvent,
  SakugaOverlay,
  SwipeVector,
} from './components/SakugaOverlay';

const INITIAL_HUD: EngineHudSnapshot = {
  activeTechnique: null,
  progress: 0,
  phaseLabel: '',
  kingOfHell: false,
  slowMo: false,
  showcaseMode: false,
  comboCount: 0,
  totalCleaves: 0,
  letterbox: false,
};

export function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ZoroSakugaEngine | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const eventCounterRef = useRef(1);

  const [hud, setHud] = useState<EngineHudSnapshot>(INITIAL_HUD);
  const [cutIn, setCutIn] = useState<CutInEvent | null>(null);
  const [calligraphy, setCalligraphy] = useState<CalligraphyEvent | null>(null);
  const [kachinId, setKachinId] = useState<number | null>(null);
  const [swipe, setSwipe] = useState<SwipeVector | null>(null);

  const [muted, setMuted] = useState(false);
  const [cutInEnabled, setCutInEnabled] = useState(true);
  const [hideHud, setHideHud] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Mount Three.js First-Person Sakuga Engine
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let cutInTimeout: number | undefined;
    let calTimeout: number | undefined;
    let kachinTimeout: number | undefined;

    const engine = new ZoroSakugaEngine(container, {
      onHudUpdate: (snap) => setHud(snap),
      onTriggerCutIn: (accentHex) => {
        const id = eventCounterRef.current++;
        setCutIn({ id, accentHex });
        window.clearTimeout(cutInTimeout);
        cutInTimeout = window.setTimeout(() => setCutIn(null), 650);
      },
      onTriggerCalligraphy: (tech: TechniqueSpec) => {
        const id = eventCounterRef.current++;
        setCalligraphy({ id, tech });
        window.clearTimeout(calTimeout);
        calTimeout = window.setTimeout(() => setCalligraphy(null), 1500);
      },
      onTriggerKachin: () => {
        const id = eventCounterRef.current++;
        setKachinId(id);
        window.clearTimeout(kachinTimeout);
        kachinTimeout = window.setTimeout(() => setKachinId(null), 700);
      },
    });

    engineRef.current = engine;

    return () => {
      window.clearTimeout(cutInTimeout);
      window.clearTimeout(calTimeout);
      window.clearTimeout(kachinTimeout);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const fireTechnique = useCallback((id: TechniqueId) => {
    setHasInteracted(true);
    engineRef.current?.triggerTechnique(id, true);
  }, []);

  const handleToggleKingOfHell = useCallback(() => {
    setHasInteracted(true);
    engineRef.current?.toggleKingOfHell();
  }, []);

  const handleToggleSlowMo = useCallback(() => {
    setHasInteracted(true);
    engineRef.current?.toggleSlowMo();
  }, []);

  const handleToggleShowcase = useCallback(() => {
    setHasInteracted(true);
    const engine = engineRef.current;
    if (!engine) return;
    engine.startShowcase(!hud.showcaseMode);
  }, [hud.showcaseMode]);

  const handleToggleMute = useCallback(() => {
    sakugaAudio.unlock();
    const next = !muted;
    setMuted(next);
    sakugaAudio.setMuted(next);
  }, [muted]);

  const handleToggleCutIn = useCallback(() => {
    const next = !cutInEnabled;
    setCutInEnabled(next);
    engineRef.current?.setCutInEnabled(next);
  }, [cutInEnabled]);

  const handleReset = useCallback(() => {
    setHasInteracted(true);
    engineRef.current?.resetArena();
  }, []);

  // Keyboard shortcuts: [1-6] Ultimates, [R] King of Hell Bandana, [T] Slow-Mo, [C] Combo Showcase, [Space] Slash, [H] Cinema HUD
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();

      if (key >= '1' && key <= '6') {
        const idx = parseInt(key, 10) - 1;
        const spec = TECHNIQUES[idx];
        if (spec) fireTechnique(spec.id);
      } else if (key === 'r') {
        handleToggleKingOfHell();
      } else if (key === 't') {
        handleToggleSlowMo();
      } else if (key === 'c') {
        handleToggleShowcase();
      } else if (key === 'm') {
        handleToggleMute();
      } else if (key === 'h') {
        setHideHud((v) => !v);
      } else if (key === ' ') {
        e.preventDefault();
        setHasInteracted(true);
        engineRef.current?.triggerFreeSlash();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    fireTechnique,
    handleToggleKingOfHell,
    handleToggleMute,
    handleToggleShowcase,
    handleToggleSlowMo,
  ]);

  // Pointer look + Click/Swipe Free Directional First-Person Katana Slash!
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    engineRef.current?.onMouseMove(nx, ny);

    if (dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > 12) {
        setSwipe({
          x1: dragStartRef.current.x,
          y1: dragStartRef.current.y,
          x2: e.clientX,
          y2: e.clientY,
        });
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    sakugaAudio.unlock();
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    engineRef.current?.startSlashCharge();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    setSwipe(null);
    if (!start) return;

    setHasInteracted(true);
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 22) {
      // Convert screen swipe vector to 3D slash roll angle!
      const angle = Math.atan2(-dy, dx);
      engineRef.current?.triggerFreeSlash(angle);
    } else {
      engineRef.current?.triggerFreeSlash();
    }
  };

  const isCasting = Boolean(hud.activeTechnique);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#030408]">
      {/* Full-Viewport 3D First-Person Onigashima Sakuga Canvas */}
      <div
        ref={mountRef}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragStartRef.current = null;
          setSwipe(null);
          engineRef.current?.cancelSlashCharge();
        }}
        className="absolute inset-0 z-10 h-full w-full cursor-crosshair touch-none"
      />

      {/* Anime Cut-In, Sumi-e Calligraphy, KACHIN! & Swipe Guide */}
      <SakugaOverlay
        cutIn={cutIn}
        calligraphy={calligraphy}
        kachinId={kachinId}
        letterbox={hud.letterbox}
        swipe={swipe}
        kingOfHell={hud.kingOfHell}
      />

      {/* Minimal Floating Wano Bushido HUD */}
      {!hideHud && (
        <>
          {/* TOP BAR: Zoro Crest + King of Hell State + Utility Pills */}
          <header
            className={`pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3.5 transition-all duration-300 sm:p-5 ${
              isCasting ? 'translate-y-4 opacity-55 hover:opacity-100' : 'opacity-100'
            }`}
          >
            {/* Left: Santoryu Identity + Live Haki Status + Combo Counter */}
            <div className="flex flex-col gap-2">
              <div className="pointer-events-auto flex items-center gap-3 rounded-sm border border-white/12 bg-black/55 px-3.5 py-2 backdrop-blur-md">
                <div
                  className="font-kanji text-xl leading-none sm:text-2xl"
                  style={{
                    color: hud.kingOfHell ? '#00ff88' : '#10b981',
                    textShadow: hud.kingOfHell
                      ? '0 0 18px rgba(0,255,136,0.85), 0 0 32px rgba(255,23,68,0.5)'
                      : '0 0 12px rgba(16,185,129,0.5)',
                  }}
                >
                  {hud.kingOfHell ? '閻王' : '三刀流'}
                </div>
                <div className="h-6 w-[1px] bg-white/15" />
                <div className="flex flex-col">
                  <span className="font-display text-xs font-bold tracking-[0.22em] text-white sm:text-sm">
                    RORONOA ZORO <span className="text-emerald-400">POV</span>
                  </span>
                  <span
                    className={`text-[10px] font-semibold tracking-[0.14em] uppercase ${
                      hud.kingOfHell ? 'text-emerald-300' : 'text-zinc-400'
                    }`}
                  >
                    {hud.kingOfHell
                      ? 'Diêm Vương Haki Bá Vương'
                      : 'Wado • Enma • Sandai Kitetsu'}
                  </span>
                </div>
              </div>

              {/* Dynamic Hit Streak Counter (only shown when slashing!) */}
              {(hud.comboCount > 0 || hud.totalCleaves > 0) && (
                <div className="flex items-center gap-2.5 pl-1">
                  {hud.comboCount > 0 && (
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className="font-display text-2xl font-bold italic text-white sm:text-3xl"
                        style={{
                          textShadow: '0 0 18px rgba(16,255,150,0.85), 0 2px 8px #000',
                        }}
                      >
                        {hud.comboCount}
                      </span>
                      <span className="font-display text-[11px] font-bold tracking-[0.22em] text-emerald-400">
                        TRẢM
                      </span>
                    </div>
                  )}
                  {hud.totalCleaves > 0 && (
                    <span className="rounded-sm border border-white/10 bg-black/45 px-2 py-0.5 text-[10px] font-medium tracking-wider text-zinc-300 backdrop-blur-sm">
                      {hud.totalCleaves} CỰ THẠCH ĐOẠN
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Right: Compact Action Controls */}
            <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
              {/* [R] King of Hell Black Bandana + Conqueror's Haki Toggle */}
              <button
                onClick={handleToggleKingOfHell}
                title="Buộc khăn đen & kích hoạt Diêm Vương Haki Bá Vương (Phím R)"
                className={`flex cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-bold tracking-wider uppercase backdrop-blur-md transition-all ${
                  hud.kingOfHell
                    ? 'animate-pulse-haki border-emerald-400/80 bg-emerald-950/75 text-emerald-200'
                    : 'border-white/15 bg-black/55 text-zinc-200 hover:border-emerald-400/50 hover:text-white'
                }`}
              >
                <Flame
                  className={`h-3.5 w-3.5 ${
                    hud.kingOfHell ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                />
                <span className="hidden sm:inline">Diêm Vương</span>
                <kbd className="rounded bg-white/10 px-1 py-0.2 text-[9px] text-zinc-300">R</kbd>
              </button>

              {/* [T] Slow-Mo 0.25x Sakuga Impact Frame Inspector */}
              <button
                onClick={handleToggleSlowMo}
                title="Chế độ Slow-Mo 0.25x soi từng Impact Frame (Phím T)"
                className={`flex cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-bold tracking-wider uppercase backdrop-blur-md transition-all ${
                  hud.slowMo
                    ? 'border-amber-400/80 bg-amber-950/75 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.4)]'
                    : 'border-white/15 bg-black/55 text-zinc-200 hover:border-amber-400/50 hover:text-white'
                }`}
              >
                <Gauge className="h-3.5 w-3.5 text-amber-400" />
                <span className="hidden md:inline">{hud.slowMo ? '0.25x' : 'Slow-Mo'}</span>
                <kbd className="rounded bg-white/10 px-1 py-0.2 text-[9px] text-zinc-300">T</kbd>
              </button>

              {/* [C] Full 6-Ultimate Cinematic Showcase Sequence */}
              <button
                onClick={handleToggleShowcase}
                title="Tự động thi triển chuỗi liên hoàn 6 tuyệt chiêu (Phím C)"
                className={`flex cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-bold tracking-wider uppercase backdrop-blur-md transition-all ${
                  hud.showcaseMode
                    ? 'border-rose-400/80 bg-rose-950/75 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.45)]'
                    : 'border-white/15 bg-black/55 text-zinc-200 hover:border-rose-400/50 hover:text-white'
                }`}
              >
                {hud.showcaseMode ? (
                  <Square className="h-3 w-3 fill-rose-400 text-rose-400" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-emerald-400 text-emerald-400" />
                )}
                <span className="hidden sm:inline">
                  {hud.showcaseMode ? 'Dừng' : 'Liên Hoàn'}
                </span>
                <kbd className="rounded bg-white/10 px-1 py-0.2 text-[9px] text-zinc-300">C</kbd>
              </button>

              {/* Eye Cut-In Toggle */}
              <button
                onClick={handleToggleCutIn}
                title={cutInEnabled ? 'Tắt Anime Eye Cut-In' : 'Bật Anime Eye Cut-In'}
                className={`cursor-pointer rounded-sm border p-1.5 backdrop-blur-md transition-all ${
                  cutInEnabled
                    ? 'border-white/15 bg-black/55 text-emerald-300 hover:border-white/35'
                    : 'border-white/10 bg-black/40 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>

              {/* Audio Mute Toggle */}
              <button
                onClick={handleToggleMute}
                title={muted ? 'Bật âm thanh Sakuga (Phím M)' : 'Tắt âm thanh (Phím M)'}
                className="cursor-pointer rounded-sm border border-white/15 bg-black/55 p-1.5 text-zinc-200 backdrop-blur-md transition-all hover:border-white/35 hover:text-white"
              >
                {muted ? <VolumeX className="h-3.5 w-3.5 text-rose-400" /> : <Volume2 className="h-3.5 w-3.5 text-emerald-400" />}
              </button>

              {/* Reset Arena */}
              <button
                onClick={handleReset}
                title="Đặt lại đấu trường & cự thạch"
                className="cursor-pointer rounded-sm border border-white/15 bg-black/55 p-1.5 text-zinc-200 backdrop-blur-md transition-all hover:border-white/35 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>

              {/* Hide HUD Cinema Mode */}
              <button
                onClick={() => setHideHud(true)}
                title="Ẩn giao diện — Chế độ Điện Ảnh (Phím H)"
                className="cursor-pointer rounded-sm border border-white/15 bg-black/55 p-1.5 text-zinc-200 backdrop-blur-md transition-all hover:border-white/35 hover:text-white"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            </div>
          </header>

          {/* BOTTOM DOCK: 6 Legendary Ultimate Techniques Bar */}
          <footer
            className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center px-2.5 pb-3 transition-all duration-300 sm:px-5 sm:pb-4 ${
              isCasting ? '-translate-y-2 opacity-80 hover:opacity-100' : 'opacity-100'
            }`}
          >
            {/* Active Phase Status OR First-Load Whisper Prompt */}
            {hud.activeTechnique ? (
              <div className="mb-2 flex items-center gap-2.5 rounded-sm border border-white/15 bg-black/70 px-3.5 py-1 backdrop-blur-md">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: hud.activeTechnique.primaryHex,
                    boxShadow: `0 0 10px ${hud.activeTechnique.primaryHex}`,
                  }}
                />
                <span
                  className="font-display text-[11px] font-bold tracking-[0.22em] uppercase"
                  style={{ color: hud.activeTechnique.primaryHex }}
                >
                  {hud.phaseLabel}
                </span>
                <div className="h-1 w-20 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full transition-all duration-75"
                    style={{
                      width: `${Math.round(hud.progress * 100)}%`,
                      backgroundColor: hud.activeTechnique.primaryHex,
                    }}
                  />
                </div>
              </div>
            ) : (
              !hasInteracted && (
                <div className="mb-2 rounded-sm border border-white/10 bg-black/50 px-3.5 py-1 text-[11px] font-medium tracking-wider text-zinc-200/90 backdrop-blur-md">
                  Vuốt chuột để chém tự do <span className="mx-1.5 text-emerald-400">•</span> Nhấn{' '}
                  <span className="font-bold text-emerald-300">[1–6]</span> khai triển tuyệt chiêu
                </div>
              )
            )}

            {/* 6-Technique Obsidian Katana Deck */}
            <div className="pointer-events-auto grid w-full max-w-5xl grid-cols-3 gap-1.5 sm:grid-cols-6 sm:gap-2">
              {TECHNIQUES.map((tech) => {
                const active = hud.activeTechnique?.id === tech.id;
                return (
                  <button
                    key={tech.id}
                    onClick={() => fireTechnique(tech.id)}
                    style={{
                      borderColor: active ? tech.primaryHex : 'rgba(255,255,255,0.13)',
                      boxShadow: active ? `0 0 24px ${tech.glowRgba}` : 'none',
                    }}
                    className="group relative flex cursor-pointer flex-col items-start overflow-hidden rounded-sm border bg-black/65 px-2.5 py-2 text-left backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-black/82"
                  >
                    {/* Top colored blade edge */}
                    <div
                      className="absolute inset-x-0 top-0 h-[2px] opacity-75 transition-opacity group-hover:opacity-100"
                      style={{
                        background: `linear-gradient(90deg, ${tech.primaryHex}, ${tech.secondaryHex})`,
                      }}
                    />

                    {/* Live execution progress fill */}
                    {active && (
                      <div
                        className="absolute inset-y-0 left-0 opacity-20 transition-all duration-75"
                        style={{
                          width: `${Math.round(hud.progress * 100)}%`,
                          background: `linear-gradient(90deg, ${tech.secondaryHex}, ${tech.primaryHex})`,
                        }}
                      />
                    )}

                    <div className="relative z-10 flex w-full items-center justify-between gap-1">
                      <span
                        className="text-[9px] font-bold tracking-[0.14em] uppercase opacity-85"
                        style={{ color: tech.primaryHex }}
                      >
                        {tech.styleKanji}
                      </span>
                      <kbd
                        className="rounded-xs px-1.5 py-0.2 font-mono text-[10px] font-bold"
                        style={{
                          backgroundColor: active ? tech.primaryHex : 'rgba(255,255,255,0.1)',
                          color: active ? '#020617' : '#e4e4e7',
                        }}
                      >
                        {tech.key}
                      </kbd>
                    </div>

                    <div className="font-kanji relative z-10 mt-0.5 line-clamp-1 text-sm text-white transition-transform group-hover:translate-x-0.5 sm:text-[15px]">
                      {tech.kanji}
                    </div>

                    <div className="relative z-10 mt-0.5 line-clamp-1 text-[10px] font-medium text-zinc-300/90 group-hover:text-white">
                      {tech.viName}
                    </div>
                  </button>
                );
              })}
            </div>
          </footer>
        </>
      )}

      {/* Restore HUD Button when in pure Cinema Mode */}
      {hideHud && (
        <button
          onClick={() => setHideHud(false)}
          title="Hiện giao diện (Phím H)"
          className="fixed top-4 right-4 z-30 flex cursor-pointer items-center gap-1.5 rounded-sm border border-white/15 bg-black/50 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 backdrop-blur-md transition hover:border-white/40 hover:text-white"
        >
          <Eye className="h-3.5 w-3.5" />
          <span>HUD [H]</span>
        </button>
      )}
    </div>
  );
}

export default App;
