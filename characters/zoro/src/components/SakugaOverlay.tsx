import React from 'react';
import { TechniqueSpec } from '../data/techniques';

export interface CutInEvent {
  id: number;
  accentHex: string;
}

export interface CalligraphyEvent {
  id: number;
  tech: TechniqueSpec;
}

export interface SwipeVector {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface SakugaOverlayProps {
  cutIn: CutInEvent | null;
  calligraphy: CalligraphyEvent | null;
  kachinId: number | null;
  letterbox: boolean;
  swipe: SwipeVector | null;
  kingOfHell: boolean;
}

export const SakugaOverlay: React.FC<SakugaOverlayProps> = ({
  cutIn,
  calligraphy,
  kachinId,
  letterbox,
  swipe,
  kingOfHell,
}) => {
  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
      {/* Cinematic IMAX Wano Letterbox Bars during Ultimates */}
      <div
        className={`absolute inset-x-0 top-0 bg-black transition-all duration-300 ease-out ${
          letterbox ? 'h-7 opacity-95' : 'h-0 opacity-0'
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 bg-black transition-all duration-300 ease-out ${
          letterbox ? 'h-6 opacity-90' : 'h-0 opacity-0'
        }`}
      />

      {/* Diagonal Toei Wano Episode 1062 Crimson-Eye Conqueror's Haki Cut-In! */}
      {cutIn && (
        <div key={cutIn.id} className="animate-cutin-slit absolute inset-0 z-30">
          {/* Dark backdrop inside diagonal slit */}
          <div className="relative h-full w-full bg-black">
            <img
              src="/images/zoro-eye-cutin.png"
              alt=""
              className="animate-cutin-pan h-full w-full object-cover object-center"
            />
            {/* Anamorphic crimson Conqueror's Haki eye streak */}
            <div
              className="animate-cutin-flare absolute top-[45%] left-0 h-2.5 w-full"
              style={{
                background: `linear-gradient(90deg, transparent 0%, #ff1744 28%, #ffffff 36%, ${cutIn.accentHex} 72%, transparent 100%)`,
                boxShadow: `0 0 32px #ff1744, 0 0 64px ${cutIn.accentHex}`,
              }}
            />
            {/* Diagonal glowing upper & lower razor slash borders */}
            <div
              className="absolute inset-x-0 top-[23%] h-[3px] -rotate-[4.2deg]"
              style={{
                background: `linear-gradient(90deg, transparent, #ffffff, ${cutIn.accentHex}, #ff1744, transparent)`,
                boxShadow: `0 0 24px ${cutIn.accentHex}`,
              }}
            />
            <div
              className="absolute inset-x-0 bottom-[31%] h-[3px] -rotate-[4.2deg]"
              style={{
                background: `linear-gradient(90deg, transparent, #ff1744, #ffffff, ${cutIn.accentHex}, transparent)`,
                boxShadow: `0 0 24px #ff1744`,
              }}
            />
          </div>
        </div>
      )}

      {/* Explosive Sumi-e Brush Kanji + Vietnamese Ultimate Calligraphy Slam */}
      {calligraphy && (
        <div
          key={calligraphy.id}
          className="absolute inset-x-0 top-[11%] z-30 flex flex-col items-center px-4 text-center"
        >
          {/* Style Seal Badge */}
          <div
            className="animate-subtitle-slice mb-1.5 inline-flex items-center gap-2 border px-3 py-0.5 text-[11px] font-bold tracking-[0.28em] uppercase backdrop-blur-sm"
            style={{
              borderColor: calligraphy.tech.primaryHex,
              background: 'rgba(4, 6, 12, 0.72)',
              color: calligraphy.tech.primaryHex,
              boxShadow: `0 0 20px ${calligraphy.tech.glowRgba}`,
            }}
          >
            <span className="font-kanji text-sm font-normal tracking-widest text-white">
              {calligraphy.tech.styleKanji}
            </span>
            <span className="opacity-50">•</span>
            <span>{calligraphy.tech.styleRomaji}</span>
          </div>

          {/* Giant Wano Sumi-e Kanji */}
          <div
            className="animate-kanji-slam font-kanji text-4xl leading-none text-white sm:text-6xl md:text-7xl"
            style={{
              textShadow: `0 0 18px ${calligraphy.tech.primaryHex}, 0 0 48px ${calligraphy.tech.secondaryHex}, 0 4px 18px rgba(0,0,0,0.95)`,
            }}
          >
            {calligraphy.tech.kanji}
          </div>

          {/* Razor Katana Horizon Rule */}
          <div
            className="my-2 h-[2px] w-64 sm:w-96"
            style={{
              background: `linear-gradient(90deg, transparent, ${calligraphy.tech.secondaryHex}, #ffffff, ${calligraphy.tech.primaryHex}, transparent)`,
              boxShadow: `0 0 16px ${calligraphy.tech.primaryHex}`,
            }}
          />

          {/* Romaji & Vietnamese Name */}
          <div className="animate-subtitle-slice flex flex-col items-center gap-0.5">
            <span
              className="font-display text-sm font-bold tracking-[0.26em] uppercase sm:text-base"
              style={{
                color: calligraphy.tech.primaryHex,
                textShadow: '0 2px 10px rgba(0,0,0,0.95)',
              }}
            >
              {calligraphy.tech.romaji}
            </span>
            <span
              className="text-xs font-semibold tracking-[0.16em] text-zinc-100/95 uppercase sm:text-sm"
              style={{ textShadow: '0 2px 10px rgba(0,0,0,0.98)' }}
            >
              {calligraphy.tech.viName}
            </span>
          </div>
        </div>
      )}

      {/* Iconic Ittoryu Iai Resheath "カチン! / KACHIN!" Callout */}
      {kachinId !== null && (
        <div
          key={kachinId}
          className="animate-kachin absolute top-[52%] left-[26%] z-30 flex flex-col items-center"
        >
          <span
            className="font-kanji text-3xl text-white sm:text-5xl"
            style={{
              textShadow: '0 0 22px #38bdf8, 0 0 45px #818cf8, 0 2px 10px #000',
            }}
          >
            カチン!
          </span>
          <span className="font-display text-[11px] font-bold tracking-[0.35em] text-sky-300">
            KACHIN
          </span>
        </div>
      )}

      {/* Interactive Directional Mouse-Swipe Katana Guide Line */}
      {swipe && (
        <svg className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="katanaSwipeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={kingOfHell ? '#ff1744' : '#a855f7'} stopOpacity="0.1" />
              <stop offset="60%" stopColor={kingOfHell ? '#00ff88' : '#10ff96'} stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
            </linearGradient>
          </defs>
          <line
            x1={swipe.x1}
            y1={swipe.y1}
            x2={swipe.x2}
            y2={swipe.y2}
            stroke={kingOfHell ? '#00ff88' : '#10ff96'}
            strokeWidth="8"
            strokeOpacity="0.28"
            strokeLinecap="round"
          />
          <line
            x1={swipe.x1}
            y1={swipe.y1}
            x2={swipe.x2}
            y2={swipe.y2}
            stroke="url(#katanaSwipeGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx={swipe.x2} cy={swipe.y2} r="4" fill="#ffffff" />
        </svg>
      )}
    </div>
  );
};
