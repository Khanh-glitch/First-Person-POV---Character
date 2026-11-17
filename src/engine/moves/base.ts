import * as THREE from "three";
import type { Engine } from "../Engine";

export interface MoveDef {
  id: string;
  key: string;
  kanji: string;
  romaji: string;
  en: string;
  desc: string;
  color: string;
}

export const MOVE_LIST: MoveDef[] = [
  { id: "tamaito", key: "1", kanji: "弾糸", romaji: "Tamaito", en: "Bullet String", desc: "Sợi chỉ bắn ra như đạn từ đầu ngón tay", color: "#ffd1ec" },
  { id: "overheat", key: "2", kanji: "超過鞭糸", romaji: "Ōbāhīto", en: "Overheat", desc: "Dây roi chỉ nung đỏ quét ngang cả thành phố", color: "#ff6a2a" },
  { id: "goshikito", key: "3", kanji: "五色糸", romaji: "Goshikito", en: "Five-Colored String", desc: "Năm sợi chỉ ngũ sắc xé toạc mặt đất", color: "#b98cff" },
  { id: "parasite", key: "4", kanji: "寄生糸", romaji: "Parasaito", en: "Parasite", desc: "Điều khiển cơ thể kẻ địch như con rối", color: "#e45cff" },
  { id: "fulbright", key: "5", kanji: "降無頼糸", romaji: "Furuburaito", en: "Fulbright", desc: "Mưa chỉ trút xuống từ tầng mây", color: "#9fd8ff" },
  { id: "torikago", key: "6", kanji: "鳥カゴ", romaji: "Torikago", en: "Birdcage", desc: "Lồng chim khổng lồ nhốt trọn hòn đảo", color: "#ff4fa3" },
  { id: "kamichusatsu", key: "7", kanji: "神誅殺", romaji: "Kamichūsatsu", en: "God Thread", desc: "Mũi giáo chỉ xoắn — đòn kết liễu", color: "#ff2a55" },
  { id: "nami", key: "8", kanji: "覚醒・波白糸", romaji: "Nami Shiraito", en: "Awakening: Wave White Thread", desc: "Thức tỉnh — mặt đất hoá chỉ, sóng thần trắng", color: "#ffffff" },
];

export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeIn = (x: number) => Math.pow(clamp01(x), 3);
export const easeInOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

export abstract class Move {
  e: Engine;
  t = 0;
  done = false;
  duration = 3;
  locksInput = true;
  idleStrings = false;
  stops: (() => void)[] = [];
  private evs: { at: number; fn: () => void; fired: boolean }[] = [];
  protected pts: THREE.Vector3[] = [];
  protected tipsR: THREE.Vector3[] = [];
  protected tipsL: THREE.Vector3[] = [];
  protected tmp = new THREE.Vector3();
  protected tmp2 = new THREE.Vector3();
  protected c = new THREE.Color();

  constructor(e: Engine) {
    this.e = e;
  }

  abstract setup(): void;
  tick(_dt: number) {}

  at(time: number, fn: () => void) {
    this.evs.push({ at: time, fn, fired: false });
  }

  update(dt: number) {
    this.t += dt;
    for (const ev of this.evs) {
      if (!ev.fired && this.t >= ev.at) {
        ev.fired = true;
        ev.fn();
      }
    }
    this.e.hands.tipsWorld("R", this.tipsR);
    this.e.hands.tipsWorld("L", this.tipsL);
    this.tick(dt);
    if (this.t >= this.duration) this.done = true;
  }

  end() {
    this.stops.forEach((s) => s());
  }

  /** point in camera space → world */
  cam(x: number, y: number, z: number) {
    return this.e.camera.localToWorld(new THREE.Vector3(x, y, z));
  }
}
