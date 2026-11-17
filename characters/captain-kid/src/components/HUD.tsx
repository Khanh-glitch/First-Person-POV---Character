import type { ReactNode } from "react";
import { MOVES, type MoveInfo } from "../game/Moves";

export interface DamagePop { id: number; amount: number; big: boolean; x: number; y: number }
export interface CastState { id: string; seq: number }

const ICONS: Record<string, ReactNode> = {
  repel: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="16" cy="16" r="2.6" fill="currentColor" />
      <path d="M9 9a10 10 0 0 0 0 14M23 9a10 10 0 0 1 0 14" />
      <path d="M4.5 5a16 16 0 0 0 0 22M27.5 5a16 16 0 0 1 0 22" opacity=".55" />
    </g>
  ),
  gibson: (
    <g fill="currentColor">
      <path d="M8 13.5c0-1.4 1-2.4 2.3-2.4.5 0 1 .2 1.3.4.3-1 1.2-1.7 2.3-1.7 1 0 1.8.5 2.2 1.3.4-.4 1-.6 1.6-.6 1.2 0 2.2.8 2.4 2 .3-.1.6-.2 1-.2 1.4 0 2.4 1 2.4 2.4v5.2c0 3.6-2.9 6.4-6.4 6.4h-3C10.700 26.3 8 23.500 8 20z" />
      <path d="M11 6l1.5 2.500M16 4.500v3M21 6l-1.500 2.500" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity=".7" />
    </g>
  ),
  vise: (
    <g fill="currentColor">
      <rect x="3" y="7" width="7" height="18" rx="1.2" />
      <rect x="22" y="7" width="7" height="18" rx="1.2" />
      <path d="M12 16h3.200M20 16h-3.200" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M14 13l2.400 3-2.400 3M18 13l-2.400 3 2.400 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity=".7" />
    </g>
  ),
  corna: (
    <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 19C5 18 3 12 5 5c1.500 5 4 7.500 8 8.500" />
      <path d="M21 19c6-1 8-7 6-14-1.500 5-4 7.500-8 8.500" />
      <path d="M11 15.500h10l-1.500 9.500h-7z" fill="currentColor" stroke="none" />
    </g>
  ),
  assign: (
    <g>
      <circle cx="16" cy="16" r="11.500" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <text x="16" y="22" textAnchor="middle" fontSize="17" fontWeight="900" fontFamily="Arial Black, Arial, sans-serif" fill="currentColor">S</text>
    </g>
  ),
  damned: (
    <g fill="currentColor">
      <rect x="2" y="9" width="17" height="3.200" rx=".6" />
      <rect x="2" y="19.800" width="17" height="3.200" rx=".6" />
      <rect x="2" y="12" width="5" height="8" rx=".6" opacity=".7" />
      <path d="M9 16h21" stroke="currentColor" strokeWidth="3.400" strokeLinecap="round" />
      <path d="M21 10.500l2.500 2M21 21.500l2.500-2M26 8l1.500 3M26 24l1.500-3" stroke="currentColor" strokeWidth="1.500" strokeLinecap="round" opacity=".7" fill="none" />
    </g>
  ),
};

function Slot({ m, active, busy, cool, onCast }: { m: MoveInfo; active: boolean; busy: boolean; cool?: { seq: number; cd: number; until: number }; onCast: (id: string) => void }) {
  const cooling = !!cool && cool.until > performance.now();
  return (
    <button
      type="button"
      onClick={() => onCast(m.id)}
      aria-label={`${m.name} (${m.key})`}
      className={`slot group pointer-events-auto ${active ? "slot-active" : ""} ${busy && !active ? "slot-dim" : ""} ${m.id === "damned" ? "slot-ult" : ""}`}
    >
      <span className="slot-key">{m.key}</span>
      <svg viewBox="0 0 32 32" className="slot-icon" aria-hidden="true">{ICONS[m.id]}</svg>
      <span className="slot-jp">{m.jp}</span>
      {cooling && <span key={cool!.seq} className="slot-cd" style={{ animationDuration: `${cool!.cd}s` }} />}
      <span className="slot-tip">
        <b>{m.name}</b>
        <i>{m.vi}</i>
      </span>
    </button>
  );
}

export function HUD(props: {
  started: boolean;
  cast: CastState | null;
  activeId: string | null;
  cools: Record<string, { seq: number; cd: number; until: number }>;
  hp: number;
  maxHp: number;
  pops: DamagePop[];
  total: { hits: number; dmg: number; seq: number } | null;
  down: number;
  auto: boolean;
  muted: boolean;
  onCast: (id: string) => void;
  onAuto: () => void;
  onMute: () => void;
}) {
  const { cast, activeId, hp, maxHp, pops, total } = props;
  const info = cast ? MOVES.find((m) => m.id === cast.id) : null;
  const pct = Math.max(0, (hp / maxHp) * 100);
  return (
    <div className={`hud ${props.started ? "hud-on" : ""} ${activeId ? "hud-cine" : ""}`}>
      <div className="letterbox letterbox-top" />
      <div className="letterbox letterbox-bottom" />

      {/* brand */}
      <div className="brand">
        <div className="brand-mark">磁</div>
        <div>
          <div className="brand-name">EUSTASS “CAPTAIN” KID</div>
          <div className="brand-sub">ジキジキの実 · MAGNET HUMAN · FPV</div>
        </div>
      </div>

      {/* toggles */}
      <div className="toggles pointer-events-auto">
        <button type="button" className={`tog ${props.auto ? "tog-on" : ""}`} onClick={props.onAuto}>
          <span className="tog-dot" /> AUTO DEMO
        </button>
        <button type="button" className={`tog ${props.muted ? "" : "tog-on"}`} onClick={props.onMute}>
          <span className="tog-dot" /> {props.muted ? "ÂM THANH TẮT" : "ÂM THANH BẬT"}
        </button>
      </div>

      {/* boss */}
      <div className="boss">
        <div className="boss-row">
          <span className="boss-jp">鬼神</span>
          <span className="boss-name">ONI COLOSSUS</span>
          <span className="boss-hp">{Math.ceil(hp).toLocaleString("en-US")}</span>
        </div>
        <div className="boss-bar">
          <div className="boss-ghost" style={{ width: `${pct}%` }} />
          <div className="boss-fill" style={{ width: `${pct}%` }} />
          <div className="boss-ticks" />
        </div>
      </div>

      {/* crosshair */}
      <div className="reticle"><i /><i /><i /><i /></div>

      {/* damage numbers */}
      <div className="pops">
        {pops.map((p) => (
          <span key={p.id} className={`pop ${p.big ? "pop-big" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            {p.amount.toLocaleString("en-US")}
            {p.big ? "!" : ""}
          </span>
        ))}
      </div>

      {/* combo total */}
      {total && total.hits > 0 && (
        <div key={`total-${total.seq}`} className={`total ${activeId ? "" : "total-out"}`}>
          <div className="total-hits"><b>{total.hits}</b> HIT{total.hits > 1 ? "S" : ""}</div>
          <div className="total-dmg">{total.dmg.toLocaleString("en-US")}</div>
          <div className="total-label">TỔNG SÁT THƯƠNG</div>
        </div>
      )}

      {/* move title card */}
      {info && cast && (
        <div key={`splash-${cast.seq}`} className={`splash ${info.id === "damned" ? "splash-ult" : ""}`}>
          <div className="splash-slash" />
          <div className="splash-jp">{info.jp}</div>
          <div className="splash-en">{info.name}</div>
          <div className="splash-kana">
            <span>{info.kana}</span>
            <em>{info.vi}</em>
          </div>
        </div>
      )}

      {/* K.O. */}
      {props.down > 0 && (
        <div key={`ko-${props.down}`} className="ko">
          <div className="ko-jp">撃破</div>
          <div className="ko-en">COLOSSUS DOWN</div>
        </div>
      )}

      {/* skills */}
      <div className="bar">
        <div className="bar-inner">
          {MOVES.map((m) => (
            <Slot key={m.id} m={m} active={activeId === m.id} busy={!!activeId} cool={props.cools[m.id]} onCast={props.onCast} />
          ))}
        </div>
        <div className="bar-hint">PHÍM 1 – 6 HOẶC BẤM VÀO Ô · DI CHUỘT ĐỂ NHÌN</div>
      </div>
    </div>
  );
}

export function Intro({ onStart, leaving }: { onStart: () => void; leaving: boolean }) {
  return (
    <div className={`intro ${leaving ? "intro-out" : ""}`}>
      <div className="intro-kanji" aria-hidden="true"><span>磁</span><span>気</span></div>
      <div className="intro-body">
        <div className="intro-tag">ONE PIECE · FAN TRIBUTE · FIRST-PERSON VFX</div>
        <h1 className="intro-title">
          <span>CAPTAIN</span>
          <span className="intro-kid">KID</span>
        </h1>
        <p className="intro-lead">
          Nhập vai <b>Eustass Kid</b> qua góc nhìn thứ nhất. Hút hàng nghìn mảnh sắt vụn bằng Trái Jiki Jiki,
          dựng cánh tay khổng lồ, đại ma ngưu và pháo điện từ — rồi trút tất cả lên Oni Colossus.
        </p>
        <ul className="intro-moves">
          {MOVES.map((m) => (
            <li key={m.id}>
              <kbd>{m.key}</kbd>
              <span className="jp">{m.jp}</span>
              <span>{m.name}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="intro-btn" onClick={onStart}>
          <span>KHAI HỎA</span>
          <i>▶</i>
        </button>
        <p className="intro-note">Nên bật âm thanh · Toàn bộ mô hình, hiệu ứng và âm thanh được sinh thủ tục theo thời gian thực</p>
      </div>
    </div>
  );
}
