// Shapes produced by driver.lua's sim_run(), after normalisation in the worker.

export type ShotState = Record<string, number | string | boolean>;

export type SimProjectile = {
  file: string;
  trigger?: { kind: 'hit' | 'timer' | 'death'; delay?: number; shot: SimShot };
};

export type SimShot = {
  projectiles: SimProjectile[];
  /** Shot state fields that differ from the defaults. */
  state: ShotState;
  /** Spells this shot drew. */
  draw?: number;
};

export type SimCast = {
  index: number;
  /** Frame the cast happened on. */
  frame: number;
  mana_before: number;
  mana_after: number;
  /** Action ids in the order the deck played them (always-casts first). */
  played: string[];
  /** For each played action, the deck card it came from (sim_add_card order, 1-based); -1 for always-casts. */
  slots: number[];
  /** Spells that ran out of charges (inventory slot → remaining). */
  uses: { inv: number; uses: number }[];
  /** Spells skipped for lack of mana. */
  no_mana: number;
  /** Recharge started, in frames. */
  reload?: number;
  /** Total cast delay in frames, payloads included. */
  cast_delay: number;
  next_frame: number;
  shot: SimShot;
};

export type SimResult = {
  casts: SimCast[];
  /** Engine functions the scripts called that the simulator doesn't implement. */
  missing: string[];
  log: { kind: string; text?: string; file?: string }[];
};

export type SimWand = {
  shuffle: boolean;
  spellsPerCast: number;
  /** Frames. */
  castDelay: number;
  /** Frames. */
  rechargeTime: number;
  manaMax: number;
  manaChargeSpeed: number;
  capacity: number;
  /** Degrees. */
  spread: number;
  speedMultiplier: number;
};

export type SimRequest = {
  wand: SimWand;
  /** Deck in slot order; uses = remaining charges or -1 for unlimited. */
  deck: { id: string; uses: number }[];
  alwaysCasts: string[];
  options: {
    maxCasts: number;
    stopOnReload: boolean;
    /** Starting mana (defaults to full). */
    mana?: number;
    hp: number;
    maxHp: number;
    money: number;
    /** Starting frame; changes shuffle order and random spells. */
    frame: number;
  };
};
