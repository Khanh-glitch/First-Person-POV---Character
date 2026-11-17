import type { Engine } from "../Engine";
import { Move, MOVE_LIST } from "./base";
import { Tamaito, Overheat, Goshikito, Parasite } from "./basic";
import { Fulbright, Torikago, GodThread, NamiShiraito, Laugh } from "./ultimate";

export { MOVE_LIST, Move };
export type { MoveDef } from "./base";

const REGISTRY: Record<string, new (e: Engine) => Move> = {
  tamaito: Tamaito,
  overheat: Overheat,
  goshikito: Goshikito,
  parasite: Parasite,
  fulbright: Fulbright,
  torikago: Torikago,
  kamichusatsu: GodThread,
  nami: NamiShiraito,
  laugh: Laugh,
};

export function createMove(id: string, e: Engine): Move {
  const C = REGISTRY[id] ?? Tamaito;
  const m = new C(e);
  m.setup();
  return m;
}
