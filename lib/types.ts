export type LightState = "OFF" | "TURNING_ON" | "ON" | "TURNING_OFF";

/** The bulb itself: whole, shattered, or a fresh one being screwed in. */
export type BulbState = "INTACT" | "BROKEN" | "FITTING";

/**
 * Values animated by GSAP and read by the scene inside useFrame. Kept in a ref
 * so that 60 fps animation never causes React renders.
 */
export type LightRig = {
  /** 0..1 filament temperature: 0 = cold, 1 = fully heated (briefly >1 on a break flash). */
  power: number;
  /** 0..1 lever position: 0 = OFF, 1 = ON. */
  lever: number;
  /** 0..1 user brightness. */
  brightness: number;
  /** Pendulum sway of the hanging lamp (radians) and its velocity. */
  sway: number;
  swayVelocity: number;
  /** Pointer hovering the 3D switch / the bulb. */
  switchHover: boolean;
  bulbHover: boolean;
  /** The glass has been shattered. */
  broken: boolean;
  /** performance.now() at the moment of the break (drives shards and the falling filament). */
  breakTime: number;
  /** Whether the bulb was lit when it broke (sparks only fly from a hot filament). */
  brokeLit: boolean;
  /** 0..1 progress of a new bulb being screwed in (1 = seated). */
  fit: number;
};

export function createRig(): LightRig {
  return {
    power: 0,
    lever: 0,
    brightness: 0.8,
    sway: 0,
    swayVelocity: 0,
    switchHover: false,
    bulbHover: false,
    broken: false,
    breakTime: 0,
    brokeLit: false,
    fit: 1,
  };
}

export const PALETTE = {
  background: "#101010",
  wall: "#1d1c1b",
  hotCore: "#fff2a0",
  filament: "#ffb02e",
  emission: "#ff6500",
  outerGlow: "#ff3700",
  cold: "#2a1a12",
} as const;

/** Vertical layout of the lamp in world units (cable hangs from above frame). */
export const LAMP = {
  socketTop: 1.4,
  socketHeight: 0.7,
  socketRadius: 0.25,
  tubeRadius: 0.235,
  tubeLength: 1.8,
  wallZ: -1.6,
} as const;

/** How far down the tube (from its top) the jagged break runs when the glass cracks. */
export const BREAK_DEPTH = { min: 0.62, max: 1.18 } as const;
