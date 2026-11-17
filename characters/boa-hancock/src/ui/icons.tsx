const HEART = "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.6 4.5c2.2 0 3.6 1.3 5.4 3.3 1.8-2 3.2-3.3 5.4-3.3 3.6 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z";

export const HeartPath = HEART;

export function IconKiss() {
  return (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      <path d="M8 26c4-6 10-7 14-4 4-3 10-2 14 4-4 5-9 7-14 7s-10-2-14-7z" fill="#ff2d6f" />
      <path d="M8 26c5 1 10 1 14-1 4 2 9 2 14 1" stroke="#7a0020" strokeWidth="1.6" fill="none" />
      <g transform="translate(26 4) scale(0.75)">
        <path d={HEART} fill="#ffc1dc" />
      </g>
    </svg>
  );
}
export function IconArrow() {
  return (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      <line x1="8" y1="40" x2="34" y2="14" stroke="#ffd1e6" strokeWidth="2.5" />
      <line x1="12" y1="42" x2="38" y2="16" stroke="#ff7fb0" strokeWidth="1.5" opacity=".7" />
      <line x1="5" y1="36" x2="31" y2="10" stroke="#ff7fb0" strokeWidth="1.5" opacity=".7" />
      <g transform="translate(26 2) scale(0.85)">
        <path d={HEART} fill="#ff3f8e" />
      </g>
    </svg>
  );
}
export function IconMellow() {
  return (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      <defs>
        <radialGradient id="mg" cx="50%" cy="45%">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".5" stopColor="#ff7fb0" />
          <stop offset="1" stopColor="#c8004a" />
        </radialGradient>
      </defs>
      <path d="M24 24 L46 8 L46 40 Z" fill="#ff3f8e" opacity=".35" />
      <g transform="translate(2 8) scale(1.3)">
        <path d={HEART} fill="url(#mg)" stroke="#fff" strokeWidth=".8" />
      </g>
    </svg>
  );
}
export function IconKick() {
  return (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      <path d="M6 42 C16 34 24 22 28 10 L33 11 C31 24 24 36 12 45 Z" fill="#f6d2bb" />
      <path d="M27 8 L36 4 L38 9 L33 12 Z" fill="#c8102e" />
      <line x1="37" y1="9" x2="37" y2="15" stroke="#c8102e" strokeWidth="1.6" />
      <path d="M10 18 A22 22 0 0 1 44 26" stroke="#ff7fb0" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
export function IconHaki() {
  return (
    <svg viewBox="0 0 48 48" className="w-full h-full">
      <circle cx="24" cy="24" r="10" fill="#120006" stroke="#ff1f3d" strokeWidth="2" />
      <path d="M24 2 L27 16 L22 18 L30 30 L20 20 L25 18 Z" fill="#ff1f3d" />
      <path d="M4 30 L16 25 L14 30 L28 36 L12 33 Z" fill="#ff1f3d" opacity=".8" />
      <path d="M44 14 L33 22 L35 26 L26 28 L37 30 Z" fill="#ff1f3d" opacity=".8" />
      <path d="M20 26 q4 -6 8 0" stroke="#fff" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

export function Emblem({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className}>
      <defs>
        <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="1" stopColor="#b8791e" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="54" fill="none" stroke="url(#eg)" strokeWidth="3" />
      <circle cx="60" cy="60" r="46" fill="none" stroke="#a3123b" strokeWidth="7" strokeDasharray="5 3" />
      <g transform="translate(26 22) scale(2.85)">
        <path d={HEART} fill="#a3123b" stroke="url(#eg)" strokeWidth=".7" />
      </g>
      <path d="M60 10 q8 6 0 12 q-8 6 0 12" stroke="url(#eg)" strokeWidth="2.5" fill="none" />
    </svg>
  );
}
