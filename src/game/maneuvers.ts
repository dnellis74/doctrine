export type ManeuverId = 'advance' | 'retreat' | 'take_cover' | 'flank' | 'hold';

export interface ManeuverContext {
  selfX: number;
  selfY: number;
  playerX: number;
  playerY: number;
  coverX: number;
  coverY: number;
  flankSide: 1 | -1;
  now: number;
}

export interface DriveCommand {
  heading: number;
  throttle: number;
  aimX: number;
  aimY: number;
}

const ADVANCE_STOP = 180;

export function executeManeuver(
  maneuver: ManeuverId,
  ctx: ManeuverContext,
): DriveCommand {
  const dx = ctx.playerX - ctx.selfX;
  const dy = ctx.playerY - ctx.selfY;
  const dist = Math.hypot(dx, dy) || 1;
  const toPlayer = Math.atan2(dy, dx);
  const away = toPlayer + Math.PI;

  let heading = toPlayer;
  let throttle = 0;

  switch (maneuver) {
    case 'advance': {
      heading = toPlayer;
      throttle = dist > ADVANCE_STOP ? 1 : dist > ADVANCE_STOP - 40 ? 0.25 : 0;
      break;
    }
    case 'retreat': {
      heading = away;
      throttle = 1;
      break;
    }
    case 'take_cover': {
      const cx = ctx.coverX - ctx.selfX;
      const cy = ctx.coverY - ctx.selfY;
      heading = Math.atan2(cy, cx);
      throttle = Math.hypot(cx, cy) > 28 ? 1 : 0;
      break;
    }
    case 'flank': {
      const orbit = toPlayer + ctx.flankSide * (Math.PI / 2);
      const tx = ctx.playerX + Math.cos(orbit) * dist;
      const ty = ctx.playerY + Math.sin(orbit) * dist;
      heading = Math.atan2(ty - ctx.selfY, tx - ctx.selfX);
      throttle = 0.85;
      break;
    }
    case 'hold':
    default: {
      heading = toPlayer;
      throttle = 0;
      break;
    }
  }

  return {
    heading,
    throttle,
    aimX: ctx.playerX,
    aimY: ctx.playerY,
  };
}
