/**
 * SELECT — màn hình chọn nhân vật + bảng phân tích cân bằng.
 *
 * Đây là phần "phân tích kĩ khả năng các nhánh": mỗi nhân vật hiện rõ
 * nguồn (nhánh Git), Trái Ác Quỷ, FOV/exposure gốc, và DPS đã chuẩn hoá.
 */

import { useMemo, useState } from 'react';
import { CHARACTERS, type CharId } from '../data/roster';
import {
  charAudit, effectiveCooldown, powerOf, MAX_HP, constantDps, MATCHUP,
} from '../engine/combat';

interface Props {
  onStart: (player: CharId, enemy: CharId) => void;
}

type Tab = 'roster' | 'balance' | 'moves';

export default function Select({ onStart }: Props) {
  const [player, setPlayer] = useState<CharId>('zoro');
  const [enemy, setEnemy] = useState<CharId>('kizaru');
  const [tab, setTab] = useState<Tab>('roster');

  const pc = CHARACTERS.find((c) => c.id === player)!;
  const ec = CHARACTERS.find((c) => c.id === enemy)!;

  const audit = useMemo(() => charAudit(CHARACTERS), []);
  const constDps = useMemo(() => constantDps(), []);

  const clampDps = useMemo(() => {
    const vals = audit.map((a) => a.avgDps);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [audit]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-5 py-8 pb-24 sm:px-8">
        {/* ------------------------------------------------------- header */}
        <header className="mb-8">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7f93b8]">
            One Piece · FPV Arena · 1v1
          </p>
          <h1
            className="mb-3 leading-[1.05] font-black tracking-tight"
            style={{
              fontSize: 'clamp(30px,5vw,56px)',
              background: 'linear-gradient(100deg,#fff 10%,#9fc0ff 55%,#e6b3ff 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Đấu trường góc nhìn thứ nhất
          </h1>
          <p className="max-w-[68ch] text-[14px] leading-relaxed text-[#9fb0cf]">
            Bảy nhân vật từ bảy nhánh Git khác nhau, hợp nhất vào một engine chiến đấu.
            Bạn cầm một nhân vật ở góc nhìn thứ nhất — đối thủ do AI điều khiển.
            Hiệu ứng của mỗi đòn là <span className="text-[#cfe0ff]">chữ ký riêng</span> của
            nhân vật đó và được gắn trực tiếp lên người đối phương.
          </p>
        </header>

        {/* ------------------------------------------------------- tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {([
            ['roster', 'Chọn nhân vật'],
            ['balance', 'Phân tích cân bằng'],
            ['moves', 'Toàn bộ chiêu thức'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="rounded-full border px-4 py-2 text-[13px] font-semibold transition"
              style={{
                borderColor: tab === id ? 'rgba(159,192,255,0.6)' : 'rgba(255,255,255,0.1)',
                background: tab === id ? 'rgba(159,192,255,0.14)' : 'transparent',
                color: tab === id ? '#dce8ff' : '#8b9ab8',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'roster' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CHARACTERS.map((c) => {
                const isP = c.id === player;
                const isE = c.id === enemy;
                return (
                  <div
                    key={c.id}
                    className="relative overflow-hidden rounded-2xl border p-5 transition"
                    style={{
                      borderColor: isP
                        ? c.color
                        : isE
                          ? `${c.color}88`
                          : 'rgba(255,255,255,0.08)',
                      background: isP
                        ? `linear-gradient(165deg, ${c.color}22, #0b1019 70%)`
                        : 'linear-gradient(165deg,#121828,#0a0e17)',
                      boxShadow: isP ? `0 18px 44px -22px ${c.color}` : 'none',
                    }}
                  >
                    <div
                      className="pointer-events-none absolute -right-2 -top-3 select-none font-black leading-none opacity-[0.12]"
                      style={{ fontSize: 74, color: c.color, fontFamily: "'Shippori Mincho B1', serif" }}
                    >
                      {c.fruitKanji}
                    </div>

                    <div className="relative">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                        <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: c.color }}>
                          {c.branch}
                        </span>
                      </div>
                      <h3 className="mb-0.5 text-[17px] font-extrabold leading-tight text-white">
                        {c.name}
                      </h3>
                      <p className="mb-1 text-[12px] font-medium text-[#b9c8e4]">{c.fruit}</p>
                      <p className="mb-3 text-[11px] text-[#7f8fac]">{c.epithet}</p>
                      <p className="mb-3 min-h-[34px] text-[11.5px] leading-snug text-[#93a3c0]">
                        {c.style}
                      </p>

                      <div className="mb-3 flex flex-wrap gap-1.5">
                        <Chip>{c.moves.length} chiêu</Chip>
                        <Chip>FOV {c.fov}°</Chip>
                        <Chip>EXP {c.exposure}</Chip>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setPlayer(c.id)}
                          className="rounded-lg border px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider transition"
                          style={{
                            borderColor: isP ? c.color : 'rgba(255,255,255,0.12)',
                            background: isP ? `${c.color}2a` : 'transparent',
                            color: isP ? '#fff' : '#8b9ab8',
                          }}
                        >
                          {isP ? '✓ Bạn' : 'Chọn'}
                        </button>
                        <button
                          onClick={() => setEnemy(c.id)}
                          className="rounded-lg border px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider transition"
                          style={{
                            borderColor: isE ? c.color : 'rgba(255,255,255,0.12)',
                            background: isE ? `${c.color}2a` : 'transparent',
                            color: isE ? '#fff' : '#8b9ab8',
                          }}
                        >
                          {isE ? '✓ Địch' : 'Đối thủ'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* --------------------------------------------------- matchup */}
            <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
              <Fighter c={pc} role="BẠN" />
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#6d7d99]">VS</div>
                </div>
              </div>
              <Fighter c={ec} role="ĐỐI THỦ (AI)" align="right" />
            </div>
          </>
        )}

        {tab === 'balance' && (
          <div className="space-y-5">
            <Panel
              title="DPS đã chuẩn hoá"
              note={`7 dự án gốc dùng thang sát thương khác nhau (Zoro x1–x103, Kizaru CD 0.4s). Arena quy đổi để DPS quanh mốc ${24}.`}
            >
              <div className="space-y-3">
                {audit.map((a) => {
                  const w = ((a.avgDps - clampDps.min) / Math.max(0.01, clampDps.max - clampDps.min)) * 100;
                  return (
                    <div key={a.id} className="grid grid-cols-[128px_1fr_54px] items-center gap-3">
                      <div className="truncate text-[12px] font-semibold" style={{ color: a.color }}>
                        {a.name.split(' ').slice(-1)[0]}
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${12 + w * 0.88}%`,
                            background: `linear-gradient(90deg, ${a.color}66, ${a.color})`,
                          }}
                        />
                      </div>
                      <div className="mono text-right text-[12px] font-bold text-[#c6d4ef]">
                        {a.avgDps}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <div className="grid gap-4 md:grid-cols-2">
              <Panel title="Chỉ số tổng hợp" note="Burst = chiêu mạnh nhất · Reach = tầm với trung bình (m).">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-[#6d7d99]">
                      <th className="pb-2">Nhân vật</th>
                      <th className="pb-2 text-right">Chiêu</th>
                      <th className="pb-2 text-right">Burst</th>
                      <th className="pb-2 text-right">Tầm</th>
                      <th className="pb-2 text-right">Σ power</th>
                    </tr>
                  </thead>
                  <tbody className="mono">
                    {audit.map((a) => (
                      <tr key={a.id} className="border-t border-white/[0.06]">
                        <td className="py-1.5 font-semibold" style={{ color: a.color }}>
                          {a.name.split(' ').slice(-1)[0]}
                        </td>
                        <td className="py-1.5 text-right text-[#a9b9d6]">{a.moveCount}</td>
                        <td className="py-1.5 text-right text-[#a9b9d6]">{a.burst}</td>
                        <td className="py-1.5 text-right text-[#a9b9d6]">{a.avgReach}</td>
                        <td className="py-1.5 text-right text-[#a9b9d6]">{a.totalPower}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>

              <Panel
                title="DPS liên tục (lý thuyết)"
                note="Nếu bấm chiêu đều đặn không ngừng nghỉ, mỗi nhân vật gây bao nhiêu sát thương/giây."
              >
                <div className="space-y-2.5">
                  {constDps.map((d) => (
                    <div key={d.id} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 truncate text-[11.5px] font-semibold" style={{ color: d.color }}>
                        {d.name.split(' ').slice(-1)[0]}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(d.dps / 40) * 100}%`, background: d.color }}
                        />
                      </div>
                      <span className="mono w-12 text-right text-[11.5px] text-[#a9b9d6]">
                        {d.dps.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-[#6d7d99]">
                  Chênh lệch tối đa giữa nhân vật mạnh nhất và yếu nhất là{' '}
                  <span className="font-bold text-[#c6d4ef]">
                    {(Math.max(...constDps.map((d) => d.dps)) / Math.min(...constDps.map((d) => d.dps))).toFixed(2)}×
                  </span>
                  , nằm trong ngưỡng chấp nhận được cho một arena vui.
                </p>
              </Panel>
            </div>

            <Panel title="Bảng khắc chế 7×7" note="Hệ số sát thương khi A đánh B. >1 = có lợi, <1 = bất lợi.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[11px]">
                  <thead>
                    <tr>
                      <th className="p-1.5 text-left text-[10px] uppercase tracking-wider text-[#6d7d99]">
                        A ↓ / B →
                      </th>
                      {CHARACTERS.map((c) => (
                        <th key={c.id} className="p-1.5 text-center text-[10px] font-bold" style={{ color: c.color }}>
                          {c.shortName.slice(0, 6)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="mono">
                    {CHARACTERS.map((a) => (
                      <tr key={a.id}>
                        <td className="p-1.5 text-[11px] font-semibold" style={{ color: a.color }}>
                          {a.shortName}
                        </td>
                        {CHARACTERS.map((b) => {
                          if (a.id === b.id) {
                            return (
                              <td key={b.id} className="p-1.5 text-center text-[#3f4c63]">
                                —
                              </td>
                            );
                          }
                          const f = MATCHUP_LOOKUP[a.id][b.id] ?? 1;
                          const good = f > 1.02;
                          const bad = f < 0.98;
                          return (
                            <td
                              key={b.id}
                              className="p-1.5 text-center font-semibold"
                              style={{
                                color: good ? '#5ce1a0' : bad ? '#ff7a8a' : '#7b8aa6',
                                background: good
                                  ? 'rgba(92,225,160,0.08)'
                                  : bad
                                    ? 'rgba(255,122,138,0.07)'
                                    : 'transparent',
                              }}
                            >
                              {f.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="Luật quy đổi" note="Minh bạch — để bạn kiểm chứng lại nếu muốn chỉnh.">
              <ul className="space-y-2 text-[12px] leading-relaxed text-[#9fb0cf]">
                <li>
                  <code className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-[#cfe0ff]">
                    sát_thương = power × khắc_chế × hệ_số_tầm
                  </code>
                </li>
                <li>Mọi nhân vật có cùng <b className="text-[#e8eefc]">{MAX_HP} HP</b> — công bằng tuyệt đối.</li>
                <li>
                  <span className="text-[#cfe0ff]">power</span> là sát thương đã chuẩn hoá về cùng thang;
                  giá trị gốc của từng dự án được ghi ở trường <code className="text-[11px]">source</code> trong{' '}
                  <code className="text-[11px]">data/roster.ts</code>.
                </li>
                <li>
                  Hệ số tầm: trong 60% tầm với → 100%; ở rìa tầm → 55%; ngoài tầm → 0 (đánh trượt).
                </li>
                <li>
                  Cooldown hiển thị = cooldown gốc × 1.15 (nhịp trận chậm lại cho dễ quan sát).
                </li>
              </ul>
            </Panel>
          </div>
        )}

        {tab === 'moves' && (
          <div className="space-y-4">
            {CHARACTERS.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a0e17]">
                <div
                  className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2.5"
                  style={{ background: `linear-gradient(90deg, ${c.color}18, transparent)` }}
                >
                  <span className="text-[13px] font-extrabold" style={{ color: c.color }}>
                    {c.name}
                  </span>
                  <span className="text-[11px] text-[#7f8fac]">{c.fruit}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-[#6d7d99]">
                    nhánh <code className="text-[#93a3c0]">{c.branch}</code>
                  </span>
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {c.moves.map((m) => (
                    <div key={m.id} className="grid grid-cols-[38px_1fr_auto] items-center gap-3 px-4 py-2">
                      <span
                        className="mono rounded border px-1.5 py-0.5 text-center text-[10px] font-bold"
                        style={{ borderColor: `${c.color}55`, color: c.color }}
                      >
                        {m.key}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[12.5px] font-semibold text-[#e2eaf9]">{m.name}</span>
                          <span className="text-[11px] text-[#7f8fac]">{m.kanji}</span>
                          {m.ultimate && (
                            <span className="rounded bg-[#ffb347]/20 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-[#ffb347]">
                              ultimate
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-[#7f8fac]">{m.desc}</p>
                      </div>
                      <div className="mono shrink-0 text-right text-[10.5px] leading-tight text-[#7b8aa6]">
                        <div>
                          <span className="text-[#a9b9d6]">{powerOf(c, m)}</span> power
                        </div>
                        <div>
                          cd <span className="text-[#a9b9d6]">{effectiveCooldown(m).toFixed(1)}s</span>
                        </div>
                        <div>
                          tầm <span className="text-[#a9b9d6]">{m.reach}m</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------- start bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#060911]/92 backdrop-blur-lg">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3 px-5 py-3 sm:px-8">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
              <span className="font-bold" style={{ color: pc.color }}>
                {pc.shortName}
              </span>
              <span className="text-[#5d6d88]">vs</span>
              <span className="font-bold" style={{ color: ec.color }}>
                {ec.shortName}
              </span>
              <span className="text-[#5d6d88]">·</span>
              <span className="text-[11px] text-[#7f8fac]">
                WASD di chuyển · chuột ngắm · phím số ra chiêu · ESC thoát
              </span>
            </div>
          </div>
          <button
            onClick={() => onStart(player, enemy)}
            className="shrink-0 rounded-xl px-7 py-2.5 text-[13px] font-extrabold uppercase tracking-wider text-[#06090f] transition hover:brightness-110 active:scale-[0.98]"
            style={{
              background: `linear-gradient(100deg, ${pc.color}, ${ec.color})`,
              boxShadow: `0 10px 28px -12px ${pc.color}`,
            }}
          >
            Vào đấu trường →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ helpers */

const MATCHUP_LOOKUP: Record<string, Record<string, number>> = MATCHUP;

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-[#8b9ab8]">
      {children}
    </span>
  );
}

function Panel({
  title, note, children,
}: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#0a0e17] p-5">
      <h3 className="mb-1 text-[13px] font-extrabold uppercase tracking-wider text-[#c6d4ef]">
        {title}
      </h3>
      {note && <p className="mb-4 text-[11px] leading-relaxed text-[#6d7d99]">{note}</p>}
      {children}
    </section>
  );
}

function Fighter({
  c, role, align = 'left',
}: {
  c: (typeof CHARACTERS)[number];
  role: string;
  align?: 'left' | 'right';
}) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        borderColor: `${c.color}44`,
        background: `linear-gradient(160deg, ${c.color}14, #0a0e17 65%)`,
        textAlign: align,
      }}
    >
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: `${c.color}cc` }}>
        {role}
      </p>
      <h4 className="text-[15px] font-extrabold text-white">{c.name}</h4>
      <p className="mb-3 text-[11.5px] text-[#8b9ab8]">
        {c.fruit} · <span className="text-[#6d7d99]">{c.moves.length} chiêu</span>
      </p>
      <div className={`flex flex-wrap gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {c.moves.map((m) => (
          <span
            key={m.id}
            title={m.name}
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ background: `${m.color}1f`, color: m.color }}
          >
            {m.key}
          </span>
        ))}
      </div>
    </div>
  );
}
