import {
  COVER_LAYOUT,
  hasLineOfSight,
  nearestCoverSpot,
} from './arena';

export type HealthBand = 'low' | 'half' | 'high';
export type DistanceBand = 'close' | 'medium' | 'far';
export type MovingBand = 'toward me' | 'away from me' | 'still' | 'sideways';

export interface SymbolicState {
  doctrine: string;
  self: {
    health: HealthBand;
    reloading: boolean;
    in_cover: boolean;
    nearest_cover: string;
  };
  player: {
    direction: string;
    distance: DistanceBand;
    health: HealthBand;
    in_cover: boolean;
    reloading: boolean;
    moving: MovingBand;
  };
  line_of_sight: boolean;
  recent_player_actions: string[];
}

export interface DescribeActor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  health: number;
  reloading: boolean;
}

export interface DescribeWorld {
  doctrine: string;
  /** Jev-controlled tank (observer / self). */
  self: DescribeActor;
  /** Opponent tank (schema field name `player` = the other combatant). */
  player: DescribeActor;
  recent_player_actions: string[];
}

const STILL_SPEED = 18;

const COMPASS = [
  'east',
  'north-east',
  'north',
  'north-west',
  'west',
  'south-west',
  'south',
  'south-east',
] as const;

export function healthBand(hp: number): HealthBand {
  if (hp <= 1) return 'low';
  if (hp === 2) return 'half';
  return 'high';
}

export function distanceBand(dist: number): DistanceBand {
  if (dist < 180) return 'close';
  if (dist < 450) return 'medium';
  return 'far';
}

/**
 * 8-way compass from observer to target.
 * Screen y points down, so negate dy before atan2.
 */
export function compassDirection(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): string {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const angle = Math.atan2(-dy, dx);
  let oct = Math.round(angle / (Math.PI / 4));
  if (oct < 0) oct += 8;
  if (oct >= 8) oct -= 8;
  return COMPASS[oct] ?? 'east';
}

export function describeCoverSpot(
  observerX: number,
  observerY: number,
  spotX: number,
  spotY: number,
): string {
  const dir = compassDirection(observerX, observerY, spotX, spotY);
  const band = distanceBand(Math.hypot(spotX - observerX, spotY - observerY));
  return `${dir}, ${band}`;
}

export function movingBand(
  selfX: number,
  selfY: number,
  playerX: number,
  playerY: number,
  playerVx: number,
  playerVy: number,
): MovingBand {
  const speed = Math.hypot(playerVx, playerVy);
  if (speed < STILL_SPEED) return 'still';

  // Direction from player toward observer ("me")
  let dx = selfX - playerX;
  let dy = selfY - playerY;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  const dot = (playerVx / speed) * dx + (playerVy / speed) * dy;
  if (dot > 0.5) return 'toward me';
  if (dot < -0.5) return 'away from me';
  return 'sideways';
}

/** World numbers → symbolic words for Jev. */
export function describe(world: DescribeWorld): SymbolicState {
  const { self, player } = world;
  const los = hasLineOfSight(self.x, self.y, player.x, player.y);
  const spot = nearestCoverSpot(self.x, self.y, player.x, player.y, COVER_LAYOUT);
  const dist = Math.hypot(player.x - self.x, player.y - self.y);

  return {
    doctrine: world.doctrine,
    self: {
      health: healthBand(self.health),
      reloading: self.reloading,
      in_cover: !los,
      nearest_cover: describeCoverSpot(self.x, self.y, spot.x, spot.y),
    },
    player: {
      direction: compassDirection(self.x, self.y, player.x, player.y),
      distance: distanceBand(dist),
      health: healthBand(player.health),
      in_cover: !los,
      reloading: player.reloading,
      moving: movingBand(self.x, self.y, player.x, player.y, player.vx, player.vy),
    },
    line_of_sight: los,
    recent_player_actions: [...world.recent_player_actions],
  };
}
