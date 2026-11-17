interface Props {
  loading: boolean;
  onEnter: () => void;
}

const KEYS: { k: string[]; name: string; sub: string }[] = [
  { k: ['CHUỘT TRÁI'], name: 'Bát Xích Quỳnh Khúc Ngọc', sub: 'Giữ để xả mưa đạn ánh sáng' },
  { k: ['CHUỘT PHẢI', '2'], name: 'Thiên Tùng Vân Kiếm', sub: 'Kiếm ánh sáng · chém chữ X' },
  { k: ['SPACE', '3'], name: 'Bát Chỉ Kính', sub: 'Phản chiếu · cước tốc độ ánh sáng' },
  { k: ['4'], name: 'Thiên Chiếu', sub: 'Chớp sáng mù lòa · cột sáng phán xét' },
  { k: ['5'], name: 'Thiên Nham Hộ', sub: 'Laser tối thượng' },
  { k: ['SHIFT', 'Q', 'E'], name: 'Bước ánh sáng', sub: 'Dịch chuyển tức thời sang hai bên' },
];

export function Intro({ loading, onEnter }: Props) {
  return (
    <div className="intro-bg fixed inset-0 z-30 flex flex-col items-center justify-between overflow-hidden px-4 py-6 sm:py-10">
      <div className="intro-beams" />

      <div className="relative z-10 flex w-full items-start justify-between font-hud text-[12px] tracking-[0.35em] text-amber-100/70 sm:text-sm">
        <span>ONE PIECE · FAN TRIBUTE</span>
        <span className="hidden sm:inline">POV · 1ST PERSON</span>
      </div>

      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="fade-up font-hud mb-2 text-xs font-semibold tracking-[0.6em] text-amber-200/80 sm:text-sm" style={{ animationDelay: '0.2s' }}>
          <span className="font-kanji">ピカピカの実</span> · PIKA PIKA NO MI
        </div>
        <h1 className="title-kanji gold-text font-kanji text-[26vw] leading-none sm:text-[15rem]">黄猿</h1>
        <div
          className="fade-up font-hud -mt-1 text-4xl font-extrabold tracking-[0.55em] text-white sm:-mt-3 sm:text-6xl"
          style={{ animationDelay: '0.45s', textShadow: '0 0 30px rgba(255,200,80,.6)', paddingLeft: '0.55em' }}
        >
          KIZARU
        </div>
        <p className="fade-up mt-4 max-w-xl text-sm leading-relaxed text-amber-50/85 sm:mt-5 sm:text-base" style={{ animationDelay: '0.7s' }}>
          Bước vào đôi mắt của Đô đốc Hải quân. Nhìn thế giới qua góc nhìn thứ nhất — khi mọi thứ chậm hơn ánh sáng.
        </p>

        <div className="fade-up mt-7 sm:mt-9" style={{ animationDelay: '0.95s' }}>
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="loader-bar" />
              <span className="font-hud text-xs tracking-[0.4em] text-amber-100/70">ĐANG HỘI TỤ ÁNH SÁNG…</span>
            </div>
          ) : (
            <button
              onClick={onEnter}
              className="enter-btn font-hud px-14 py-4 text-xl font-extrabold tracking-[0.4em] sm:px-20 sm:text-2xl"
            >
              VÀO TRẬN
            </button>
          )}
        </div>
        <p className="mt-3 text-[11px] tracking-wider text-white/45">Bật âm thanh để có trải nghiệm trọn vẹn · Chạy tốt nhất trên máy tính</p>
      </div>

      <div className="fade-up glass relative z-10 grid w-full max-w-5xl grid-cols-2 gap-x-6 gap-y-2 rounded-xl px-4 py-3 sm:grid-cols-3 sm:px-6 sm:py-4" style={{ animationDelay: '1.2s' }}>
        {KEYS.map((r) => (
          <div key={r.name} className="flex items-center gap-2.5">
            <div className="flex shrink-0 flex-wrap gap-1">
              {r.k.map((k) => (
                <span key={k} className="keycap">
                  {k}
                </span>
              ))}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[12px] font-semibold text-amber-100 sm:text-[13px]">{r.name}</div>
              <div className="hidden truncate text-[11px] text-white/55 sm:block">{r.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
