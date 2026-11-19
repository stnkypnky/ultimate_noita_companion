// Shapes produced by driver.lua's sim_run(), after normalisation in the worker.

export type ShotState = Record<string, number | string | boolean>;

export type SimProjectile = {
  file: string;
  trigger?: { kind: 'hit' | 'timer' | 'death'; delay?: number; shot: SimShot };
};

/**
 * What one played spell (`id`, from deck card `slot`, -1 = always cast) or one perk modifier (`mod`) did to its shot
 * on its own: the shot-state changes, recharge frames and mana it took. Recorded by sim_run, not live casts.
 */
export type SimStep = {
  id?: string;
  slot?: number;
  mod?: string;
  d: Record<string, number>;
  reload: number;
  mana: number;
};

export type SimShot = {
  projectiles: SimProjectile[];
  /** Shot state fields that differ from the defaults. */
  state: ShotState;
  /** Spells this shot drew. */
  draw?: number;
  /** Each spell and perk modifier's own part of `state`, in play order. */
  steps?: SimStep[];
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
  /** shot_effects.recoil_knockback: how hard the cast pushes the caster back. */
  recoil?: number;
  shot: SimShot;
};

/** Live play: one trigger pull and where the deck stands afterwards. */
export type LiveCast = {
  cast: SimCast;
  deck: {
    /** Inventory ids still to be drawn, in draw order. */
    deck: number[];
    discarded: number[];
    /** Remaining charges per inventory id (-1 = unlimited). */
    uses: { inv: number; uses: number }[];
  };
  missing: string[];
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
  /** Spells (always casts included) of the other wands carried in the quick inventory, which Zeta copies from. */
  otherWands?: string[][];
  /** Perks' shot modifiers (gun_extra_modifiers.lua names), added to every cast as the engine does. */
  modifiers?: string[];
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
