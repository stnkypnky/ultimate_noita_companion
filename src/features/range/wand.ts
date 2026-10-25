// The wand in the player's hands: the engine's side of firing (Noita's C++), around gun.lua's deck logic.
// gun.lua decides what a trigger pull casts; this decides when the wand may fire and tracks its mana.
import type { LiveCast, SimCast, SimRequest } from '@/sim/types';

/** Something that can fire the wand: the live worker session, or the Lua host directly in tests. */
export interface Caster {
  reset(req: SimRequest): void | Promise<void>;
  cast(frame: number, mana: number): LiveCast | Promise<LiveCast>;
}

const isPromise = <T>(v: T | Promise<T>): v is Promise<T> => typeof (v as Promise<T>)?.then === 'function';

export class WandRuntime {
  mana = 0;
  manaMax = 0;
  private charge = 0;
  /** Cast delay and recharge windows, in world frames. */
  delayStart = 0;
  delayEnd = 0;
  reloadStart = 0;
  reloadEnd = 0;
  /** Last frame a spell was skipped for lack of mana (the HUD flashes the mana bar). */
  noManaFrame = -Infinity;
  deck: LiveCast['deck'] | null = null;
  lastCast: SimCast | null = null;
  readonly missing = new Set<string>();
  error: string | null = null;

  private req: SimRequest | null = null;
  private ready = false;
  private busy = false;
  private gen = 0;

  constructor(
    private caster: Caster,
    private onCast: (cast: SimCast) => void,
  ) {}

  get equipped() {
    return !!this.req && (this.req.deck.length > 0 || this.req.alwaysCasts.length > 0);
  }

  /** Put a freshly built wand in hand: full mana, deck in order, no cast delay or recharge. */
  equip(req: SimRequest, frame: number) {
    this.manaMax = req.wand.manaMax;
    this.charge = req.wand.manaChargeSpeed;
    this.mana = req.options.mana ?? this.manaMax;
    this.delayStart = this.delayEnd = this.reloadStart = this.reloadEnd = frame;
    this.noManaFrame = -Infinity;
    this.lastCast = null;
    this.missing.clear();
    this.load(req);
  }

  /**
   * Switch to another item and back: the deck starts over from the first spell (the game's way of
   * skipping a recharge). Mana, spent charges and any recharge already running carry over.
   */
  swap() {
    if (!this.req) return;
    const left = new Map(this.deck?.uses.map((u) => [u.inv, u.uses]));
    this.load({ ...this.req, deck: this.req.deck.map((c, i) => ({ ...c, uses: left.get(i + 1) ?? c.uses })), options: { ...this.req.options, mana: this.mana } });
  }

  private load(req: SimRequest) {
    const g = ++this.gen;
    this.req = req;
    this.deck = null;
    this.ready = false;
    this.busy = false;
    this.error = null;
    if (!this.equipped) return;
    const done = () => {
      if (g === this.gen) this.ready = true;
    };
    try {
      const r = this.caster.reset(req);
      if (isPromise(r)) r.then(done, (e: unknown) => this.fail(g, e));
      else done();
    } catch (e) {
      this.fail(g, e);
    }
  }

  canFire(frame: number) {
    return this.ready && !this.busy && frame >= this.delayEnd && frame >= this.reloadEnd;
  }

  /** One world frame: mana recharges, and a held trigger fires as soon as the wand is ready. */
  tick(frame: number, trigger: boolean) {
    if (this.mana < this.manaMax) this.mana = Math.min(this.manaMax, this.mana + this.charge / 60);
    if (trigger && this.canFire(frame)) this.fire(frame);
  }

  delayProgress(frame: number) {
    return progress(frame, this.delayStart, this.delayEnd);
  }

  reloadProgress(frame: number) {
    return progress(frame, this.reloadStart, this.reloadEnd);
  }

  private fire(frame: number) {
    const g = this.gen;
    const before = this.mana;
    this.busy = true;
    const apply = (r: LiveCast) => {
      if (g !== this.gen) return;
      this.busy = false;
      const c = r.cast;
      // Mana kept recharging while the cast was in flight; charge only what the spells cost.
      this.mana = Math.max(0, this.mana - (before - c.mana_after));
      // The engine never fires twice in one frame, whatever the cast delay.
      this.delayStart = frame;
      this.delayEnd = frame + Math.max(1, c.cast_delay);
      if (c.reload !== undefined) {
        this.reloadStart = frame;
        this.reloadEnd = frame + Math.max(0, c.reload);
      }
      if (c.no_mana > 0) this.noManaFrame = frame;
      this.deck = r.deck;
      this.lastCast = c;
      for (const m of r.missing) this.missing.add(m);
      this.onCast(c);
    };
    try {
      const r = this.caster.cast(frame, before);
      if (isPromise(r)) r.then(apply, (e: unknown) => this.fail(g, e));
      else apply(r);
    } catch (e) {
      this.fail(g, e);
    }
  }

  private fail(g: number, e: unknown) {
    if (g !== this.gen) return;
    this.busy = false;
    this.ready = false;
    this.error = String((e as Error)?.message ?? e);
  }
}

const progress = (frame: number, start: number, end: number) => (end <= start ? 1 : Math.max(0, Math.min(1, (frame - start) / (end - start))));
