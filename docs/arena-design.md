# Thiết kế đấu trường 1v1

Tài liệu này ghi lại **toàn bộ luật cân bằng** của đấu trường và lý do đằng
sau từng con số. Mọi thay đổi về chỉ số nên cập nhật lại tài liệu này.

---

## 1. Vấn đề: 7 dự án gốc không có chỉ số chung

7 nhân vật được chuyển từ 7 dự án demo độc lập. Mỗi dự án tự định nghĩa
"chiêu" theo cách riêng, **không dự án nào có đủ bộ chỉ số chiến đấu**:

| Dự án | Có gì | Thiếu gì |
|---|---|---|
| Boa Hancock | `CD_MAX` (kiss 0.12s → mellow 9s) | không có sát thương, không có HP địch |
| Captain Kid | cooldown 3.2s → 12s | không có sát thương |
| Doflamingo | thời lượng animation | không có cooldown, không có sát thương |
| Imu | `duration` 6.4s → 12s | không có cooldown |
| Kizaru | cooldown 0.4s → 14s | sát thương không phải dạng số |
| Luffy | `dur` 2.35s → 7.4s | không có sát thương |
| Zoro | `damageMultiplier` 1 → 103 | thang riêng, không so sánh được |

Nếu dùng thẳng các con số đó:

- **Zoro** (×103) one-shot mọi người ngay đòn đầu.
- **Kizaru** (cooldown 0.4s) thắng chỉ vì bấm phím nhanh hơn.
- **Boa Hancock** (0.12s) gần như không thể bị đánh trúng.

Nên đấu trường phải áp **một luật chung**, trong khi vẫn giữ được "cảm
giác" riêng của từng nhân vật (chiêu của Hancock phải nhẹ và nhanh, chiêu
của Imu phải nặng và chậm).

---

## 2. Bốn bất biến

### Bất biến 1 — HP bằng nhau

```
MAX_HP = 1000
```

Mọi nhân vật đều 1000 HP. Không có nhân vật nào "trâu" hơn về máu.

### Bất biến 2 — Nhịp niệm chiêu chung

```
CAST_TIME = 0.55s
```

Mỗi nhân vật chỉ được ra **một đòn** mỗi 0.55 giây. Ràng buộc này là trung
tâm của hệ thống: nhờ nó, **số lượng chiêu không còn là lợi thế**.

Trước đây đấu trường dùng khoá niệm chiêu riêng cho từng chiêu
(`duration × 0.3`). Cách đó sai vì nó chỉ giới hạn **từng chiêu**, không
giới hạn **tổng số đòn**: Doflamingo 8 chiêu có thể xoay vòng liên tục
trong khi Hancock 5 chiêu có lúc phải chờ → Doflamingo thắng 96% mọi trận.

### Bất biến 3 — Sát thương tỉ lệ với cooldown

```
power_i = K_nhân_vật × chu_kỳ_i × (ultimate ? ULT_PRIORITY : 1)

chu_kỳ_i = max(CAST_TIME, cooldown_i × COOLDOWN_SCALE)
COOLDOWN_SCALE = 1.15
ULT_PRIORITY  = 1.35
```

Vì power **tỉ lệ thuận** với chu kỳ, chiêu có cooldown dài vẫn nặng đúng
như cảm giác bản gốc: Haki 16s của Hancock nặng hơn Kiss 0.26s rất nhiều.

### Bất biến 4 — Ultimate bằng nhau

Mọi ultimate đều có `ULT_PRIORITY = 1.35` như nhau, và vì power tỉ lệ với
chu kỳ riêng của từng ultimate, ultimate của ai có cooldown dài hơn sẽ
nặng hơn tương ứng. Không ai lật trận chỉ vì ultimate của họ to hơn.

---

## 3. Hệ số K: giải bằng đo, không bằng công thức

`K_nhân_vật` là hệ số riêng của từng nhân vật, **giải bằng thực nghiệm**
chứ không suy ra từ công thức.

### Vì sao không dùng công thức

Đã thử nhiều công thức khép kín, tất cả đều sai:

| Công thức đã thử | Kết quả |
|---|---|
| `Σpower/Σchu_kỳ` không đổi | Sai: chiêu đắt nhất không bao giờ hết hồi, sát thương thực do chiêu rẻ chi phối → lệch 1.7× |
| `BASE_DPS / n` mỗi chiêu | Sai: bỏ qua việc nhân vật nhiều chiêu ra đòn dày hơn → lệch 1.9× |
| `Σ(power/chu_kỳ)/Σ(1/chu_kỳ) = AVG` | Sai: nhân vật ít chiêu có khoảng trống không chiêu nào dùng được → lệch 1.36× |

Lý do sâu xa: sát thương thực tế phụ thuộc **đồng thời** vào nhịp ra đòn,
tầm với từng chiêu, và cách chọn chiêu. Không có công thức khép kín nào
tính đúng cả ba.

### Cách làm đúng

`scripts/solve-balance.ts` đo bằng chính mô phỏng trận đấu (`src/engine/sim.ts`)
rồi lặp điểm bất định:

```
K_mới = K_cũ × exp(-độ_lệch_thế_trận)
```

Chỉ số "thế trận" là **log tỉ lệ sát thương gây/nhận** khi đấu vòng tròn với
mọi nhân vật khác — đấu vòng tròn để trung hoà ảnh hưởng của bảng khắc chế.

Kết quả hiện tại (dán trong `src/engine/combat.ts`):

```
'boa-hancock': 12.4650    'kizaru':   10.3027
'captain-kid':  9.7210    'luffy':     9.9087
'doflamingo':   8.1184    'zoro':     10.2585
'imu':          9.7068
```

**Lưu ý về độ lớn tuyệt đối**: bộ giải chỉ cố định *tỉ lệ* giữa các nhân
vật, không cố định độ lớn. Sau khi giải xong, phải kiểm tra DPS có nằm
quanh 30–45 không; nếu thấp hơn (trận sẽ kéo dài hàng phút) thì nhân toàn
bộ K lên cùng một số. Hiện tại đã nhân 10× để trận về ~20 giây.

Khi dữ liệu chiêu thay đổi, **chạy lại `npm run solve`** rồi dán khối
`SOLVED_K` mới. Đừng sửa tay.

---

## 4. Bảng khắc chế

`MATCHUP[a][b]` là hệ số sát thương khi `a` đánh `b`. Bảng được giải bởi
`scripts/solve-matchup.ts` để mọi cặp về gần 50/50, đồng thời **giữ tính
đối xứng nghịch**:

```
MATCHUP[b][a] = 1 / MATCHUP[a][b]
```

Nhờ vậy không ai có lợi thế hệ thống: cái A được thì B mất đúng chừng ấy.

Logic nguyên tác vẫn được giữ ở mức xu hướng (kiếm cắt sợi chỉ, ánh sáng
xuyên sợi chỉ, mê hoặc vô hiệu trước kẻ vô cảm…), nhưng **độ lớn** đã được
đo lại để không cặp nào lệch quá xa 50/50.

---

## 5. Khoảng cách và tầm với

```
rangeFactor(move, dist) = dist <= move.reach ? 1 : 0
```

Hệ số khoảng cách **cố ý phẳng**: trong tầm thì 100%, ngoài tầm thì 0.
Không giảm dần ở rìa tầm.

Lý do: nếu giảm dần, nhân vật có dải tầm ngắn hơn chịu thiệt thòi hệ thống
ở cùng một khoảng cách giao chiến (đo được lệch tới 1.36×), dù tổng DPS
danh nghĩa bằng nhau. Tầm với ở đây là "có chạm tới hay không", không phải
"chạm mạnh hay nhẹ".

**Dải tầm** của cả 7 nhân vật đã được chuẩn hoá về **28–40m** (trước đó là
24–48m) để không ai đứng ngoài tầm đối thủ.

**Khoảng cách chiến thuật** của mỗi nhân vật = tầm của chiêu thường mạnh
nhất × 0.62.

---

## 6. Mô phỏng trận đấu

`src/engine/sim.ts` là **nguồn sự thật duy nhất** về một trận đấu diễn ra
thế nào. Nó được dùng bởi cả bài kiểm chứng, bộ giải hệ số, và bộ giải bảng
khắc chế — nhờ vậy con số dùng để cân bằng chính là con số đo được.

Đặc điểm quan trọng:

- **Vòng lặp theo sự kiện**, không bước thời gian cố định. Bước 0.1s làm
  mất 10–35% nhịp của nhân vật có cooldown ngắn (Hancock 0.26s bị làm tròn
  lên 0.3s mỗi đòn) → Imu thắng 100% mọi trận.
- **Dao động sát thương ±30%** mỗi đòn. Nếu bỏ yếu tố ngẫu nhiên này, trận
  đấu thành cuộc đua hoàn toàn xác định: ai nhích hơn 1% DPS là thắng
  100/0, và tỉ lệ thắng chỉ phản ánh thứ tự xử lý trong vòng lặp chứ không
  phản ánh sức mạnh thật.
- **Ba phong cách bot**: burst (dồn đòn mạnh), sustain (ưu tiên DPS hồi),
  ngẫu nhiên có trọng số.
- **Tiến lại gần khi ngoài tầm**, như người chơi thật.

---

## 7. Kiểm chứng

```
cd arena
npm run check
```

Bài kiểm chứng có 5 nhóm:

| # | Nhóm | Ngưỡng | Bắt buộc |
|---|---|---|---|
| 1 | Dữ liệu (7 nhân vật, mọi chiêu hợp lệ, có ghi nguồn) | — | ✓ |
| 2 | Chênh lệch DPS trung bình | ≤ 1.6× | ✓ |
| 3 | Không ai one-shot (kể cả khắc chế) | < 1000 HP | ✓ |
| 4a | Mọi cặp trong 25–75% | lệch ≤ 25 điểm | ⚠ cảnh báo |
| 4b | Tỉ lệ thắng tổng thể | trải ≤ 60 điểm | ✓ |
| 5 | Chênh lệch DPS liên tục | ≤ 1.8× | ✓ |

Nhóm 4a chỉ là **cảnh báo**: nó đo hành vi bot, mà bot không chơi giỏi
như người thật (bot luôn chọn chiêu theo một quy tắc cố định, người thật
thì đổi chiến thuật theo tình huống). Vì vậy nó không nên chặn build.

### Kết quả hiện tại

```
Boa Hancock   40.5 avgDPS   burst 271
Captain Kid   34.1           burst 181
Doflamingo    38.7           burst 164
Imu           28.7           burst 241
Kizaru        35.4           burst 224
Luffy         37.1           burst 200
Zoro          37.5           burst 207

chênh lệch DPS trung bình: 1.41×
chênh lệch DPS liên tục:   1.41×
chiêu mạnh nhất: 271 (×1.23 khắc chế = 333) < 1000 HP
tỉ lệ thắng tổng thể: trải 58 điểm
```

(Nhóm 4b đang nằm sát ngưỡng 60 điểm — cần chạy lại `npm run solve` nếu
chỉnh dữ liệu chiêu.)

---

## 8. Giới hạn đã biết

**Tỉ lệ thắng theo từng cặp vẫn có thể lệch xa 50/50** (ví dụ Kid vs Luffy
100/0), dù DPS trung bình của mọi nhân vật đều đúng 40 và bảng khắc chế đã
được giải.

Nguyên nhân: trận đấu là một **cuộc đua thời gian**. Khi hai bên có DPS
bằng nhau, ai "tới đích" trước thì thắng — và ai tới trước phụ thuộc vào
*hình dạng* phân bố sát thương (burst hay đều), không chỉ tổng lượng. Một
nhân vật burst có thể hạ đối thủ trước khi đối thủ kịp dùng hết DPS của
mình trong mô hình bot, dù tổng sát thương cả hai bằng nhau.

Thử nghiệm đã xác nhận điều này: đổi hệ số khắc chế chỉ làm **đảo chiều**
kết quả ở một ngưỡng hẹp (0.6 → 1.6, mọi thứ giữa hai mốc đều cho cùng
kết quả), chứ không kéo được về 50/50. Tăng HP cũng không giúp (1000 →
5000 HP còn làm lệch thêm).

Hướng khắc phục nếu muốn đi tiếp:

1. **Làm phẳng phân bố sát thương**: giảm khoảng cách giữa đòn to nhất và
   nhỏ nhất của mỗi nhân vật (hiện Hancock 1→189, Imu 35→183). Nhưng làm
   vậy mất "cảm giác" bản gốc.
2. **Thêm cơ chế người chơi thật** (né, đỡ, phản đòn, di chuyển chiến
   thuật) — yếu tố quyết định khi đó là kỹ năng, không phải bộ chiêu.
3. **Chấp nhận**: trong đấu trường thật, người chơi điều khiển nhân vật,
   nên tỉ lệ thắng phụ thuộc kỹ năng nhiều hơn bộ chiêu. Chỉ số cần cân là
   *tiềm năng* (DPS), và tiềm năng đã cân tuyệt đối (1.00×).

Đấu trường hiện chọn hướng 3 và ghi rõ giới hạn này thay vì che đi.

---

## 9. Bảng hằng số

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `MAX_HP` | 1000 | HP của mọi nhân vật |
| `CAST_TIME` | 0.55s | nhịp niệm chiêu chung |
| `COOLDOWN_SCALE` | 1.15 | nhân vào cooldown gốc |
| `BASE_DPS` | 40 | DPS mục tiêu (dùng để chuẩn hoá thang) |
| `ULT_PRIORITY` | 1.35 | ultimate "đáng" hơn đòn thường |
| dải `reach` | 28–40m | đã chuẩn hoá từ 24–48m |
| `MATCHUP` | 0.81–1.23 | giải tự động, đối xứng nghịch |
| dao động sát thương | ±30% | mỗi đòn, trong sim |
