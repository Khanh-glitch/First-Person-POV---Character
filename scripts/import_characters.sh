#!/usr/bin/env bash
# Dựng lại toàn bộ cấu trúc kho từ các gói ZIP nguồn trong google_drive/
#
#   ./scripts/import_characters.sh            # giải nén vào characters/
#   ./scripts/import_characters.sh --branches # đồng thời tạo/cập nhật nhánh nhân vật
#
# Mỗi ZIP là một source code độc lập. Tên nhân vật được đọc từ index.html <title>
# và metadata chiêu thức trong src/. Nếu hai gói cho cùng một nhân vật, gói đầu
# giữ tên gốc, các gói sau nhận hậu tố -v2, -v3, ...
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP_DIR="$ROOT/google_drive"
OUT_DIR="$ROOT/characters"
MAKE_BRANCHES="${1:-}"

# slug nhân vật -> tên ZIP nguồn
SLUGS=(
  boa-hancock   captain-kid  doflamingo  imu
  kizaru        luffy        zoro
)
ZIPS=(
  "boa-hancock-aaa-special-effects (1).zip"
  "captain-kid-fpp-motion-effects (1).zip"
  "doflamingo-special-move-effects (3).zip"
  "imu-first-person-motion.zip"
  "kizaru-first-person-motion (2).zip"
  "luffy-first-person-motion-effects.zip"
  "zoro-special-move-motion-effect (2).zip"
)

[[ -d "$ZIP_DIR" ]] || { echo "Không thấy thư mục nguồn: $ZIP_DIR" >&2; exit 1; }
mkdir -p "$OUT_DIR"

for i in "${!SLUGS[@]}"; do
  slug="${SLUGS[$i]}"
  zip="$ZIP_DIR/${ZIPS[$i]}"
  [[ -f "$zip" ]] || { echo "!! Thiếu ZIP: ${ZIPS[$i]}" >&2; continue; }

  # xác định hậu tố phiên bản nếu thư mục/nhánh đã tồn tại
  target="$slug"
  n=2
  while [[ -e "$OUT_DIR/$target" ]]; do target="${slug}-v$n"; ((n++)); done

  echo "==> giải nén ${ZIPS[$i]}  ->  characters/$target"
  rm -rf "${OUT_DIR:?}/$target"
  mkdir -p "$OUT_DIR/$target"
  unzip -qq "$zip" -d "$OUT_DIR/$target"

  # đặt lại tên gói cho rõ ràng
  node -e '
    const fs = require("fs");
    const p = process.argv[1] + "/package.json";
    const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
    pkg.name = "onepiece-fpv-" + process.argv[2];
    pkg.private = true;
    pkg.scripts = { ...pkg.scripts, typecheck: "tsc --noEmit" };
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
  ' "$OUT_DIR/$target" "$target"

  if [[ "$MAKE_BRANCHES" == "--branches" ]]; then
    echo "    tạo nhánh $target từ dự án này"
    "$ROOT/scripts/publish_branch.sh" "$OUT_DIR/$target" "$target"
  fi
done

echo "Xong. Xem characters/README.md để biết danh mục."
