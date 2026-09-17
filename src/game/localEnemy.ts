import type { BrainAnswers } from './localBrain';
import { localBrain, type LocalWorldView } from './localBrain';
import type { ManeuverId } from './maneuvers';
import { nearestCoverSpot, hasLineOfSight, COVER_LAYOUT, steerAroundObstacles } from './arena';
import type { Tank } from './tank';
import type { DoctrineId } from './constants';
import { executeManeuver } from './maneuvers';

/**
 * Enemy tank — one of the three local doctrine state machines. Never Jev.
 */
export class LocalEnemy {
  maneuver: ManeuverId = 'hold';
  aggressionScore = 1;
  flankSide: 1 | -1 = 1;
  private flankUntil = 0;
  private commitUntil = 0;
  private lastTick = 0;
  private doctrineId: DoctrineId = 'cautious';

  setDoctrine(id: DoctrineId): void {
    this.doctrineId = id;
  }

  tick(now: number, self: Tank, opponent: Tank): void {
    if (now - this.lastTick < 0.35) return;
    this.lastTick = now;

    const answers = localBrain(this.viewFromTanks(self, opponent));
    this.commitAnswers(answers, now);
  }

  private viewFromTanks(self: Tank, opponent: Tank): LocalWorldView {
    const dist = Math.hypot(opponent.x - self.x, opponent.y - self.y);
    const los = hasLineOfSight(self.x, self.y, opponent.x, opponent.y);
    return {
      doctrineId: this.doctrineId,
      selfHealth: self.health,
      playerHealth: opponent.health,
      distance: dist,
      lineOfSight: los,
      selfInCover: !los,
      playerInCover: !los,
      playerReloading: opponent.reloading,
      selfReloading: self.reloading,
    };
  }

  private commitAnswers(answers: BrainAnswers, now: number): void {
    const next = answers.maneuver.choice;
    if (now >= this.commitUntil || this.maneuver === next) {
      if (this.maneuver !== next) {
        this.maneuver = next;
        this.commitUntil = now + 0.6;
        if (next === 'flank' && now >= this.flankUntil) {
          this.flankSide = Math.random() < 0.5 ? 1 : -1;
          this.flankUntil = now + 2;
        }
      }
    }
    this.aggressionScore = answers.aggression.score;
  }

  apply(self: Tank, opponent: Tank, now: number): void {
    self.speedMul = 0.75 + 0.15 * this.aggressionScore;
    const spot = nearestCoverSpot(
      self.x,
      self.y,
      opponent.x,
      opponent.y,
      COVER_LAYOUT,
    );
    const cmd = executeManeuver(this.maneuver, {
      selfX: self.x,
      selfY: self.y,
      playerX: opponent.x,
      playerY: opponent.y,
      coverX: spot.x,
      coverY: spot.y,
      flankSide: this.flankSide,
      now,
    });
    const look = 72 + cmd.throttle * 48;
    const steered = steerAroundObstacles(self.x, self.y, cmd.heading, look);
    self.setMoveIntent(steered.heading, cmd.throttle * steered.throttleScale);

    const lead = 0.25 + Math.random() * 0.15;
    const aimX = opponent.x + opponent.vx * lead + (Math.random() - 0.5) * 40;
    const aimY = opponent.y + opponent.vy * lead + (Math.random() - 0.5) * 40;
    self.setAim(aimX, aimY);
  }

  private aimTolerance(): number {
    return (12 - this.aggressionScore * 3) * (Math.PI / 180);
  }

  shouldFire(self: Tank, opponent: Tank): boolean {
    if (self.reloading || !self.alive) return false;
    if (!hasLineOfSight(self.x, self.y, opponent.x, opponent.y)) return false;
    const desired = Math.atan2(opponent.y - self.y, opponent.x - self.x);
    let d = desired - self.turretAngle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) < this.aimTolerance();
  }
}
