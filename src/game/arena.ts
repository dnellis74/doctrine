import Phaser from 'phaser';
import { WORLD_H, WORLD_W } from './constants';

export interface CoverBlock {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CoverSpot {
  x: number;
  y: number;
  blockIndex: number;
}

/** Six symmetric indestructible cover blocks. */
export const COVER_LAYOUT: CoverBlock[] = [
  { x: 320, y: 200, w: 110, h: 40 },
  { x: 960, y: 200, w: 110, h: 40 },
  { x: 320, y: 520, w: 110, h: 40 },
  { x: 960, y: 520, w: 110, h: 40 },
  { x: 520, y: 360, w: 40, h: 140 },
  { x: 760, y: 360, w: 40, h: 140 },
];

export const PLAYER_SPAWN = { x: 140, y: WORLD_H - 140, angle: -Math.PI / 4 };
export const ENEMY_SPAWN = { x: WORLD_W - 140, y: 140, angle: (3 * Math.PI) / 4 };

export function createArenaBodies(
  scene: Phaser.Scene,
): Phaser.Physics.Arcade.StaticGroup {
  const group = scene.physics.add.staticGroup();

  for (const b of COVER_LAYOUT) {
    const rect = scene.add.rectangle(b.x, b.y, b.w, b.h, 0x000000, 0);
    scene.physics.add.existing(rect, true);
    group.add(rect);
  }

  // Edge walls as thin static strips just inside world bounds
  const wallT = 24;
  const walls: CoverBlock[] = [
    { x: WORLD_W / 2, y: wallT / 2, w: WORLD_W, h: wallT },
    { x: WORLD_W / 2, y: WORLD_H - wallT / 2, w: WORLD_W, h: wallT },
    { x: wallT / 2, y: WORLD_H / 2, w: wallT, h: WORLD_H },
    { x: WORLD_W - wallT / 2, y: WORLD_H / 2, w: wallT, h: WORLD_H },
  ];
  for (const w of walls) {
    const rect = scene.add.rectangle(w.x, w.y, w.w, w.h, 0x000000, 0);
    scene.physics.add.existing(rect, true);
    group.add(rect);
  }

  return group;
}

export function segmentHitsAabb(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
): boolean {
  // Liang-Barsky style clip against AABB
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - (cx - hw), cx + hw - x0, y0 - (cy - hh), cy + hh - y0];
  for (let i = 0; i < 4; i++) {
    const pi = p[i]!;
    const qi = q[i]!;
    if (pi === 0) {
      if (qi < 0) return false;
      continue;
    }
    const r = qi / pi;
    if (pi < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1;
}

/** True if a clear line exists between two points (no cover blocking). */
export function hasLineOfSight(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  blocks: CoverBlock[] = COVER_LAYOUT,
): boolean {
  for (const b of blocks) {
    if (segmentHitsAabb(x0, y0, x1, y1, b.x, b.y, b.w / 2, b.h / 2)) {
      return false;
    }
  }
  return true;
}

/**
 * Cover spot = a point just behind the nearest block on the side away from the threat.
 */
export function nearestCoverSpot(
  selfX: number,
  selfY: number,
  threatX: number,
  threatY: number,
  blocks: CoverBlock[] = COVER_LAYOUT,
): CoverSpot {
  let best: CoverSpot | null = null;
  let bestDist = Infinity;
  const margin = 48;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const awayX = b.x - threatX;
    const awayY = b.y - threatY;
    const len = Math.hypot(awayX, awayY) || 1;
    const nx = awayX / len;
    const ny = awayY / len;
    const sx = b.x + nx * (b.w / 2 + margin);
    const sy = b.y + ny * (b.h / 2 + margin);
    const clampedX = Phaser.Math.Clamp(sx, 80, WORLD_W - 80);
    const clampedY = Phaser.Math.Clamp(sy, 80, WORLD_H - 80);
    const d = Math.hypot(clampedX - selfX, clampedY - selfY);
    if (d < bestDist) {
      bestDist = d;
      best = { x: clampedX, y: clampedY, blockIndex: i };
    }
  }

  return best ?? { x: selfX, y: selfY, blockIndex: 0 };
}

export function raycastForward(
  x: number,
  y: number,
  angle: number,
  dist: number,
  blocks: CoverBlock[] = COVER_LAYOUT,
): boolean {
  const x1 = x + Math.cos(angle) * dist;
  const y1 = y + Math.sin(angle) * dist;
  const margin = 40;
  if (
    x1 < margin ||
    x1 > WORLD_W - margin ||
    y1 < margin ||
    y1 > WORLD_H - margin
  ) {
    return true;
  }
  return !hasLineOfSight(x, y, x1, y1, blocks);
}

/**
 * Bias a desired drive heading around cover / arena walls.
 * Returns a clear(er) heading and a throttle scale (1 = free, lower = blocked).
 */
export function steerAroundObstacles(
  x: number,
  y: number,
  heading: number,
  lookAhead = 90,
): { heading: number; throttleScale: number } {
  if (!raycastForward(x, y, heading, lookAhead)) {
    // Soft side whiskers near walls so we peel off early
    const leftGlance = raycastForward(x, y, heading - 0.55, lookAhead * 0.7);
    const rightGlance = raycastForward(x, y, heading + 0.55, lookAhead * 0.7);
    if (leftGlance && !rightGlance) {
      return { heading: heading + 0.35, throttleScale: 0.85 };
    }
    if (rightGlance && !leftGlance) {
      return { heading: heading - 0.35, throttleScale: 0.85 };
    }
    return { heading, throttleScale: 1 };
  }

  const probes = [0.55, 0.95, 1.35, 1.85, 2.4];
  for (const ang of probes) {
    const left = heading - ang;
    const right = heading + ang;
    const lOk = !raycastForward(x, y, left, lookAhead);
    const rOk = !raycastForward(x, y, right, lookAhead);
    if (lOk && !rOk) return { heading: left, throttleScale: 0.4 };
    if (rOk && !lOk) return { heading: right, throttleScale: 0.4 };
    if (lOk && rOk) {
      // Prefer the smaller turn
      return { heading: ang <= Math.PI ? left : right, throttleScale: 0.4 };
    }
  }

  // Fully boxed in — spin toward the openest short probe
  return { heading: heading + Math.PI * 0.6, throttleScale: 0.15 };
}
