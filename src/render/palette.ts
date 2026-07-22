/**
 * Art direction, in one file.
 *
 * The whole look is generated from these numbers — there is not a single
 * image asset in the project, by design. Changing the palette here changes
 * every pitch, kit and floodlight at once, which is the payoff for drawing
 * everything in code.
 *
 * The reference is a night match under floodlights: deep blue-black sky,
 * saturated grass lit from above, bodies grounded by real shadows.
 */

export const SKY = {
  top: '#05070f',
  horizon: '#111a30',
  fog: 'rgba(140, 170, 210, 0.16)',
} as const;

export const STADIUM = {
  standBack: '#0a0f1c',
  standFront: '#0d1424',
  crowdWarm: 'rgba(255, 226, 178, 0.5)',
  crowdCool: 'rgba(168, 202, 255, 0.42)',
  rail: 'rgba(226, 236, 255, 0.16)',
} as const;

export const FLOODLIGHT = {
  glow: 'rgba(198, 224, 255, 0.22)',
  beam: 'rgba(198, 224, 255, 0.05)',
} as const;

/**
 * Grass is lit, not flat: darkest at the horizon where the light falls off,
 * brightest through the middle where the floodlights pool, dimming again at
 * the very bottom so the frame has weight.
 */
export const GRASS = {
  far: '#0e5c33',
  mid: '#1d8a4e',
  near: '#166b3d',
  /** Mowing stripes are a light modulation, not a second colour. */
  stripeLight: 'rgba(214, 255, 232, 0.085)',
  stripeDark: 'rgba(0, 26, 12, 0.10)',
  /** Fine blade texture, drawn as scanlines that compress with distance. */
  texture: 'rgba(0, 30, 14, 0.16)',
} as const;

export const LINES = {
  paint: 'rgba(240, 248, 244, 0.72)',
  paintFar: 'rgba(240, 248, 244, 0.42)',
} as const;

export const GOAL = {
  frame: '#f4f8f6',
  frameShade: '#c3cdc8',
  net: 'rgba(228, 240, 236, 0.30)',
  netShade: 'rgba(10, 20, 16, 0.22)',
} as const;

export const BALL = {
  base: '#f6faf8',
  shade: '#c2ccc8',
  panel: '#141c26',
  trail: 'rgba(246, 250, 248, 0.30)',
} as const;

export const SHADOW = 'rgba(4, 12, 8, 0.34)';

export const KEEPER = {
  shirt: '#f0b429',
  shirtShade: '#b3811a',
  gloves: '#20293a',
} as const;

export const DEFENDER = {
  shirt: '#222a38',
  shirtShade: '#151b26',
} as const;

/** Skin tones for the procedural paper-doll — the athlete is a parameter set. */
export const SKIN_TONES = ['#f2c8a0', '#d99e6a', '#a9683f', '#7a4526', '#4d2b18'] as const;

export const HAIR_COLOURS = ['#141210', '#3b2a1c', '#7a5230', '#c9a227', '#e8e6e1'] as const;

export const RETICLE = {
  ring: 'rgba(125, 219, 164, 0.92)',
  fill: 'rgba(125, 219, 164, 0.10)',
  cross: 'rgba(240, 255, 246, 0.8)',
} as const;

/** Darkening at the frame's edges, to keep the eye in the middle. */
export const VIGNETTE = 'rgba(2, 6, 12, 0.55)';
