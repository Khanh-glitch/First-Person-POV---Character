/**
 * DOM TỐI THIỂU CHO BÀI KIỂM TRA HEADLESS
 *
 * `viewmodel.ts` và `textures.ts` có gọi `document.createElement('canvas')` để
 * vẽ texture bằng Canvas2D. Trong Node không có DOM, nên các bài kiểm tra cần
 * một lớp giả đủ để three khởi tạo hình học — ta chỉ kiểm tra TOẠ ĐỘ, không
 * kiểm tra pixel, nên canvas giả trả về hàm rỗng là đủ.
 *
 * Script nào cần thì `import './dom-stub.mjs';` ở dòng đầu tiên.
 */

const ctx2d = new Proxy(
  {},
  {
    get(_t, k) {
      if (k === 'canvas') return { width: 256, height: 256 };
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') {
        return () => ({ addColorStop() {} });
      }
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set() {
      return true;
    },
  },
);

const makeCanvas = () => ({
  width: 256,
  height: 256,
  style: {},
  getContext: () => ctx2d,
  toDataURL: () => 'data:,',
});

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return makeCanvas();
    return { style: {}, appendChild() {}, addEventListener() {} };
  },
  addEventListener() {},
  removeEventListener() {},
  body: { appendChild() {} },
  documentElement: { style: {} },
};

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
};

globalThis.requestAnimationFrame = () => 0;
globalThis.self = globalThis;
