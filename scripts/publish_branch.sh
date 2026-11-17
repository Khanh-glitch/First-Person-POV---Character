#!/usr/bin/env bash
# Xuất một thư mục dự án trong characters/ thành một nhánh Git riêng.
#
#   ./scripts/publish_branch.sh characters/zoro zoro
#
# Cơ chế an toàn (không dùng worktree, không đụng vào nhánh đang làm việc):
#   1. Tạo một GIT_INDEX_FILE tạm, chỉ đọc nội dung từ thư mục dự án.
#   2. write-tree  -> cây thư mục của nhân vật.
#   3. commit-tree -> commit mới (cha = commit hiện tại của nhánh đích nếu có).
#   4. git branch -f <nhánh> <commit>  (hoặc tạo mới).
# Nhờ vậy nhánh chứa CHÍNH dự án đó ở thư mục gốc, sẵn sàng `npm install && npm run dev`.
set -euo pipefail

src="${1:?dùng: publish_branch.sh <thư-mục-dự-án> <tên-nhánh>}"
branch="${2:?dùng: publish_branch.sh <thư-mục-dự-án> <tên-nhánh>}"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
[[ -d "$src" ]] || { echo "Không thấy thư mục: $src" >&2; exit 1; }

tmp_index="$(mktemp)"
trap 'rm -f "$tmp_index"' EXIT
rm -f "$tmp_index"
export GIT_INDEX_FILE="$tmp_index"

git read-tree --empty

( cd "$src" && find . -type f \
    -not -path './node_modules/*' \
    -not -path './dist/*' \
    -not -name '.DS_Store' -print0 \
  | while IFS= read -r -d '' f; do
      rel="${f#./}"
      sha=$(git hash-object -w -- "$f")
      mode=100644
      [[ -x "$f" ]] && mode=100755
      git update-index --add --cacheinfo "$mode,$sha,$rel"
    done )

tree=$(git write-tree)

if git rev-parse --verify --quiet "refs/heads/$branch" >/dev/null; then
  parent=$(git rev-parse "refs/heads/$branch")
  commit=$(git commit-tree "$tree" -p "$parent" -m "chore($branch): đồng bộ dự án từ $src")
  git branch -f "$branch" "$commit"
  echo "✔ cập nhật nhánh $branch -> $commit"
else
  commit=$(git commit-tree "$tree" -m "feat($branch): dự án first-person POV — $branch")
  git branch "$branch" "$commit"
  echo "✔ tạo nhánh $branch -> $commit"
fi
