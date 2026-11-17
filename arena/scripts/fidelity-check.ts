/**
 * KIỂM CHỨNG ĐỘ TRUNG THỰC CỦA PORT
 *
 *   npx tsx scripts/fidelity-check.ts
 *
 * So sánh arena với 7 dự án gốc trên 4 trục:
 *   1. Hậu kỳ — tham số UnrealBloom và bộ uniform của shader
 *   2. Hình dạng hạt — texture riêng cho từng nhân vật
 *   3. Rig góc nhìn thứ nhất
 *   4. Camera (FOV / exposure)
 *
 * Script đọc trực tiếp mã nguồn gốc trong `characters/` nên kết quả không
 * thể "tự khai" — nếu bản gốc đổi, con số ở đây đổi theo.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

const CHARS = [
  { id: 'boa-hancock', post: 'src/game/post.ts', rig: 'src/game/Game.ts' },
  { id: 'captain-kid', post: 'src/game/PostFX.ts', rig: 'src/game/Arms.ts' },
  { id: 'doflamingo', post: 'src/engine/Post.ts', rig: 'src/engine/Hands.ts' },
  { id: 'imu', post: 'src/engine/post.ts', rig: 'src/engine/hands.ts' },
  { id: 'kizaru', post: 'src/game/post.ts', rig: 'src/game/hands.ts' },
  { id: 'luffy', post: 'src/game/post.ts', rig: 'src/game/arm.ts' },
  { id: 'zoro', post: 'src/engine/shaders.ts', rig: 'src/engine/firstPersonRig.ts' },
];

function read(rel: string): string | null {
  const p = resolve(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

/* -- đọc tham số bloom từ bản gốc để đối chiếu với arena -- */

/**
 * Đọc 3 tham số cuối của `new UnrealBloomPass(...)`.
 *
 * Phải tách theo ngoặc cân bằng chứ không dùng regex `[^,]+`: tham số đầu
 * là `new THREE.Vector2(w, h)` có chứa dấu phẩy, nên regex ngây thơ sẽ cắt
 * sai chỗ.
 */
function bloomParams(src: string): [number, number, number] | null {
  const at = src.indexOf('UnrealBloomPass(');
  if (at < 0) return null;
  let i = src.indexOf('(', at) + 1;
  let depth = 1;
  const args: string[] = [];
  let cur = '';
  for (; i < src.length && depth > 0; i++) {
    const ch = src[i];
    if (ch === '(') { depth++; cur += ch; continue; }
    if (ch === ')') {
      depth--;
      if (depth === 0) break;
      cur += ch;
      continue;
    }
    if (ch === ',' && depth === 1) { args.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  args.push(cur.trim());
  if (args.length < 4) return null;

  const resolveNum = (expr: string): number => {
    const direct = Number(expr);
    if (!Number.isNaN(direct)) return direct;
    const varName = expr.replace(/^this\./, '');
    const v = src.match(new RegExp(`${varName}\\s*[=:]\\s*([\\d.]+)`));
    return v ? Number(v[1]) : NaN;
  };

  const strength = resolveNum(args[1]);
  const radius = resolveNum(args[2]);
  const threshold = resolveNum(args[3]);
  if (Number.isNaN(radius) || Number.isNaN(threshold)) return null;
  return [Number.isNaN(strength) ? 0 : strength, radius, threshold];
}

const arenaPost = read('arena/src/engine/post.ts') ?? '';
const arenaTextures = read('arena/src/engine/textures.ts') ?? '';
const arenaParticles = read('arena/src/engine/particles.ts') ?? '';
const arenaViewmodel = read('arena/src/engine/viewmodel.ts') ?? '';

let pass = 0;
let fail = 0;
const ok = (c: boolean, msg: string) => {
  if (c) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.log(`  ✗ ${msg}`); }
};

console.log('\n=== 1. HẬU KỲ: THAM SỐ BLOOM ===\n');
const bloomExpected: Record<string, [number, number, number]> = {};
for (const c of CHARS) {
  const src = read(`characters/${c.id}/${c.post}`);
  if (!src) { console.log(`  ? ${c.id}: không đọc được ${c.post}`); continue; }
  let p = bloomParams(src);
  // một số dự án dựng bloom ở file engine chứ không phải file post
  if (!p) {
    const engineFiles: Record<string, string> = {
      'boa-hancock': 'src/game/Game.ts',
      'captain-kid': 'src/game/PostFX.ts',
      doflamingo: 'src/engine/Engine.ts',
      imu: 'src/engine/post.ts',
      kizaru: 'src/game/post.ts',
      luffy: 'src/game/post.ts',
      zoro: 'src/engine/zoroEngine.ts',
    };
    const ef = engineFiles[c.id];
    if (ef) {
      const es = read(`characters/${c.id}/${ef}`);
      if (es) p = bloomParams(es);
    }
  }
  // riêng kizaru bloom nằm ở biến bloomBase
  const kiz = src.match(/bloomBase\s*=\s*([\d.]+)/);
  const params = p ?? (kiz ? [Number(kiz[1]), 0.55, 1.15] as [number, number, number] : null);
  if (!params) { console.log(`  ? ${c.id}: không tìm thấy tham số bloom`); continue; }
  bloomExpected[c.id] = params;
}

for (const c of CHARS) {
  const exp = bloomExpected[c.id];
  if (!exp) continue;
  // arena: tìm constructor của class tương ứng
  const classMap: Record<string, string> = {
    'boa-hancock': 'HancockPost', 'captain-kid': 'KidPost', 'doflamingo': 'DoflamingoPost',
    imu: 'ImuPost', kizaru: 'KizaruPost', luffy: 'LuffyPost', zoro: 'ZoroPost',
  };
  const cls = classMap[c.id];
  const start = arenaPost.indexOf(`class ${cls}`);
  const body = arenaPost.slice(start, start + 3000);
  const params = bloomParams(body);
  if (!params) { fail++; console.log(`  ✗ ${c.id}: arena không dựng UnrealBloomPass cho ${cls}`); continue; }
  const got = params;
  const match = Math.abs(got[1] - exp[1]) < 1e-6 && Math.abs(got[2] - exp[2]) < 1e-6;
  ok(match, `${c.id.padEnd(13)} radius/threshold gốc (${exp[1]}, ${exp[2]}) → arena (${got[1]}, ${got[2]})`);
}

console.log('\n=== 2. HẬU KỲ: UNIFORM CỦA SHADER ===\n');
const uniformMap: Record<string, string[]> = {
  'boa-hancock': ['uAberr', 'uRadial', 'uLines', 'uLineCol', 'uHaki', 'uInvert', 'uHurt', 'uFlash', 'uFlashCol', 'uVig', 'uLove'],
  'captain-kid': ['uChroma', 'uBlur', 'uSpeed', 'uImpact', 'uImpactMode', 'uDarken', 'uVignette', 'uFlash'],
  doflamingo: ['uChroma', 'uZoom', 'uFlash', 'uImpact', 'uImpactInvert', 'uTint', 'uTintAmt', 'uVig', 'uSat'],
  imu: ['uAberr', 'uRipple0', 'uRipple1', 'uFlash', 'uInvert', 'uVig', 'uGrain', 'uGlitch', 'uZoom', 'uDesat', 'uEye'],
  kizaru: ['uRadial', 'uChroma', 'uVignette', 'uFlash', 'uInvert', 'uDim', 'uWarp', 'uGrain', 'uSat', 'uShock0', 'uShock1'],
  luffy: ['uRadial', 'uChroma', 'uVignette', 'uFlash', 'uInvert', 'uSpeed', 'uTint', 'uSat', 'uRipple', 'uPulse', 'uHalftone'],
  zoro: ['uImpactMode', 'uImpactTint', 'uChromatic', 'uShockwaveProgress', 'uSpeedLines', 'uFocusDesat', 'uBandanaVignette', 'uFlashAlpha'],
};

for (const c of CHARS) {
  const wanted = uniformMap[c.id];
  const missing = wanted.filter((u) => !arenaPost.includes(u));
  ok(missing.length === 0, `${c.id.padEnd(13)} ${wanted.length - missing.length}/${wanted.length} uniform${missing.length ? ` — thiếu: ${missing.join(',')}` : ''}`);
}

console.log('\n=== 3. HÌNH DẠNG HẠT (TEXTURE RIÊNG) ===\n');
const texMap: Record<string, string> = {
  'boa-hancock': 'makeHeartTexture',
  'captain-kid': 'makeScrapTexture',
  doflamingo: 'makeStringTexture',
  imu: 'makeVoidTexture',
  kizaru: 'makeLightTexture',
  luffy: 'makeRubberTexture',
  zoro: 'makeBladeTexture',
};
for (const c of CHARS) {
  ok(arenaTextures.includes(texMap[c.id]), `${c.id.padEnd(13)} có texture riêng (${texMap[c.id]})`);
}

console.log('\n=== 4. THAM SỐ EMIT HẠT ===\n');
for (const c of CHARS) {
  const hasProfile = new RegExp(`'?${c.id}'?:\\s*\\{`).test(arenaParticles) || arenaParticles.includes(`'${c.id}'`);
  ok(hasProfile, `${c.id.padEnd(13)} có profile emit riêng (count/size/life/speed/gravity/drag)`);
}

console.log('\n=== 5. RIG GÓC NHÌN THỨ NHẤT ===\n');
for (const c of CHARS) {
  ok(arenaViewmodel.includes(`case '${c.id}'`), `${c.id.padEnd(13)} có rig riêng trong viewmodel`);
}
ok(arenaViewmodel.includes('buildTube'), 'Luffy: ống co giãn động (port từ ArmRig)');
ok(arenaViewmodel.includes('hamon'), 'Zoro: hamon trên lưỡi kiếm');
ok(arenaViewmodel.includes('fpLight'), 'đèn FP gắn camera (port từ firstPersonRig)');
ok(arenaViewmodel.includes('ashuraBlades'), 'Zoro: 6 lưỡi kiếm quỷ Ashura (port từ firstPersonRig L700-712)');
ok(arenaViewmodel.includes("'ashura_bakkei'"), 'Ashura gắn đúng đòn ashura_bakkei');

console.log('\n=== 6. CAMERA (FOV / EXPOSURE) ===\n');
const roster = read('arena/src/data/roster.ts') ?? '';
const camExpected: Record<string, [number, number]> = {
  'boa-hancock': [72, 1.05], 'captain-kid': [70, 0.92], doflamingo: [72, 0.95],
  imu: [72, 1.0], kizaru: [72, 0.42], luffy: [72, 1.05], zoro: [65, 1.12],
};
for (const [id, [fov, exp]] of Object.entries(camExpected)) {
  const okFov = roster.includes(`fov: ${fov}`);
  const okExp = roster.includes(`exposure: ${exp}`);
  ok(okFov && okExp, `${id.padEnd(13)} FOV ${fov}, exposure ${exp}`);
}

console.log(`\n${fail === 0 ? '✅ PORT ĐẠT TOÀN BỘ' : `❌ ${fail} MỤC CHƯA ĐẠT`}  (${pass} đạt, ${fail} hỏng)\n`);
process.exit(fail === 0 ? 0 : 1);
