#!/usr/bin/env bash
# Build cả 7 dự án và dựng một trang gallery tĩnh để xem trước tất cả cùng lúc.
#
#   ./scripts/build_gallery.sh          # build -> .preview/
#   ./scripts/build_gallery.sh --serve  # build rồi phục vụ tại :8000 (0.0.0.0)
#
# Lưu ý: Zoro dùng đường dẫn tuyệt đối /images/... nên artwork của nó được
# copy lên gốc .preview/images/ để vẫn resolve đúng khi nằm trong thư mục con.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/.preview"
CHARS=(boa-hancock captain-kid doflamingo imu kizaru luffy zoro)
NAMES=(   "Boa Hancock" "Eustass Kid" "Doflamingo" "Imu" "Kizaru" "Luffy" "Zoro")

rm -rf "$OUT"
mkdir -p "$OUT"

for c in "${CHARS[@]}"; do
  echo "==> build $c"
  ( cd "$ROOT/characters/$c" \
      && npm install --no-audit --no-fund --silent >/dev/null 2>&1 \
      && npm run build >/dev/null 2>&1 ) || { echo "!! build lỗi: $c" >&2; exit 1; }
  mkdir -p "$OUT/$c"
  cp "$ROOT/characters/$c/dist/index.html" "$OUT/$c/index.html"
done

# artwork dùng đường dẫn tuyệt đối
if [[ -d "$ROOT/characters/zoro/public/images" ]]; then
  mkdir -p "$OUT/images"
  cp "$ROOT/characters/zoro/public/images"/* "$OUT/images"/
fi

node - "$OUT" "${CHARS[@]}" <<'NODE'
const fs = require("fs");
const path = require("path");
const [out, ...chars] = process.argv.slice(2);

const META = {
  "boa-hancock":  { name: "Boa Hancock",      fruit: "Mero Mero no Mi", kanji: "メロメロの実", moves: 5, color: "#ff5c9e", tag: "Nữ Đế Hải Tặc" },
  "captain-kid":  { name: "Eustass Kid",      fruit: "Jiki Jiki no Mi",  kanji: "磁気の実",     moves: 6, color: "#7cc4ff", tag: "Captain · Kid Pirates" },
  "doflamingo":   { name: "Doflamingo",       fruit: "Ito Ito no Mi",    kanji: "糸糸の実",     moves: 8, color: "#ff7bb0", tag: "天夜叉 · Joker" },
  "imu":          { name: "Imu",              fruit: "Hư Vô Chi Vương",  kanji: "無",           moves: 5, color: "#b48cff", tag: "Ngai Sắt Trống" },
  "kizaru":       { name: "Kizaru",           fruit: "Pika Pika no Mi",  kanji: "ピカピカの実", moves: 5, color: "#ffd24a", tag: "黄猿 · Đô đốc Hải quân" },
  "luffy":        { name: "Monkey D. Luffy",  fruit: "Gomu Gomu no Mi",  kanji: "ゴムゴムの実", moves: 6, color: "#ff6b4a", tag: "Mugiwara · Gear 5" },
  "zoro":         { name: "Roronoa Zoro",     fruit: "Santōryū",         kanji: "三刀流",       moves: 6, color: "#5ce1a0", tag: "Thợ Săn Hải Tặc" },
};

const cards = chars.map((c) => {
  const m = META[c];
  const kb = Math.round(fs.statSync(path.join(out, c, "index.html")).size / 1024);
  return `
    <a class="card" href="./${c}/index.html" style="--c:${m.color}">
      <div class="glow"></div>
      <div class="kanji">${m.kanji}</div>
      <h2>${m.name}</h2>
      <p class="fruit">${m.fruit}</p>
      <p class="tag">${m.tag}</p>
      <div class="meta"><span>${m.moves} tuyệt chiêu</span><span>${kb} KB</span></div>
      <span class="cta">Mở trải nghiệm →</span>
    </a>`;
}).join("");

const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>One Piece — First-Person POV · Bộ sưu tập 7 nhân vật</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;800;900&family=Shippori+Mincho+B1:wght@800&display=swap" rel="stylesheet" />
<style>
  *,*::before,*::after{box-sizing:border-box}
  :root{color-scheme:dark}
  body{
    margin:0;padding:clamp(24px,5vw,72px);
    font-family:"Be Vietnam Pro",system-ui,-apple-system,sans-serif;
    background:radial-gradient(1200px 700px at 15% -10%,#1b2340 0%,#0a0d18 55%,#05070d 100%);
    color:#eaf0ff;min-height:100vh;
  }
  header{max-width:1240px;margin:0 auto clamp(32px,5vw,56px)}
  .eyebrow{
    font-size:12px;letter-spacing:.28em;text-transform:uppercase;
    color:#8fa3cc;margin:0 0 14px
  }
  h1{
    font-family:"Shippori Mincho B1",serif;
    font-size:clamp(30px,5.2vw,58px);line-height:1.06;margin:0 0 16px;
    background:linear-gradient(100deg,#fff 10%,#9fc0ff 55%,#e6b3ff 100%);
    -webkit-background-clip:text;background-clip:text;color:transparent;
  }
  .lede{max-width:62ch;color:#a8b6d4;font-size:clamp(14px,1.5vw,17px);line-height:1.65;margin:0}
  .lede code{background:#ffffff14;padding:2px 7px;border-radius:5px;font-size:.9em;color:#cfe0ff}
  .grid{
    max-width:1240px;margin:0 auto;display:grid;gap:clamp(14px,2vw,22px);
    grid-template-columns:repeat(auto-fill,minmax(268px,1fr));
  }
  .card{
    position:relative;display:flex;flex-direction:column;gap:6px;
    padding:26px 24px 22px;border-radius:18px;overflow:hidden;
    text-decoration:none;color:inherit;
    background:linear-gradient(165deg,#151b2e 0%,#0d1220 100%);
    border:1px solid #ffffff14;
    transition:transform .28s cubic-bezier(.2,.8,.3,1),border-color .28s,box-shadow .28s;
  }
  .card:hover,.card:focus-visible{
    transform:translateY(-6px);border-color:color-mix(in srgb,var(--c) 55%,transparent);
    box-shadow:0 22px 48px -18px color-mix(in srgb,var(--c) 45%,transparent);
    outline:none;
  }
  .glow{
    position:absolute;inset:-45% -20% auto;height:190px;pointer-events:none;
    background:radial-gradient(closest-side,color-mix(in srgb,var(--c) 34%,transparent),transparent 75%);
    opacity:.55;transition:opacity .28s;
  }
  .card:hover .glow{opacity:1}
  .kanji{
    position:absolute;top:6px;right:14px;font-family:"Shippori Mincho B1",serif;
    font-size:60px;line-height:1;color:var(--c);opacity:.13;pointer-events:none;
    transition:opacity .28s;
  }
  .card:hover .kanji{opacity:.26}
  h2{
    position:relative;margin:0 0 2px;font-size:21px;font-weight:800;letter-spacing:-.01em;
    color:color-mix(in srgb,var(--c) 72%,#fff);
  }
  .fruit{position:relative;margin:0;font-size:13px;font-weight:600;color:#dfe7fb}
  .tag{position:relative;margin:0;font-size:12px;color:#7e8dad}
  .meta{
    position:relative;display:flex;gap:10px;margin:14px 0 0;padding-top:13px;
    border-top:1px solid #ffffff10;font-size:11.5px;color:#8fa0c2;
    letter-spacing:.03em;
  }
  .meta span+span::before{content:"·";margin-right:10px;opacity:.5}
  .cta{
    position:relative;margin-top:14px;font-size:12.5px;font-weight:700;
    color:color-mix(in srgb,var(--c) 80%,#fff);
  }
  footer{
    max-width:1240px;margin:clamp(38px,5vw,60px) auto 0;padding-top:22px;
    border-top:1px solid #ffffff10;color:#6b7b9b;font-size:12.5px;line-height:1.8;
  }
  footer a{color:#9db4e6;text-decoration:none}
  footer a:hover{text-decoration:underline}
  @media (prefers-reduced-motion:reduce){
    .card{transition:none}.card:hover{transform:none}
  }
</style>
</head>
<body>
  <header>
    <p class="eyebrow">One Piece · First-Person POV Collection</p>
    <h1>Bảy nhân vật, bảy trải nghiệm góc nhìn thứ nhất</h1>
    <p class="lede">
      Mỗi thẻ mở một ứng dụng Three.js độc lập, build thành một file HTML duy nhất.
      Mỗi nhân vật là một nhánh Git riêng — xem <code>README.md</code> ở gốc kho để biết cách chạy từng dự án.
    </p>
  </header>
  <main class="grid">${cards}
  </main>
  <footer>
    7 nhân vật · 41 tuyệt chiêu · React 19 · TypeScript · Three.js<br />
    Dự án fan-made phi thương mại, lấy cảm hứng từ <em>One Piece</em> của Eiichiro Oda.
  </footer>
</body>
</html>`;

fs.writeFileSync(path.join(out, "index.html"), html);
console.log("✔ gallery:", path.join(out, "index.html"));
NODE

echo "Xong. Gallery tại: $OUT/index.html"
if [[ "${1:-}" == "--serve" ]]; then
  cd "$OUT" && exec python3 -m http.server 8000 --bind 0.0.0.0
fi
