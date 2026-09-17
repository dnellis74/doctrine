import type { BrainAnswers } from './localBrain';
import { localBrain, type LocalWorldView } from './localBrain';
import type { ManeuverId } from './maneuvers';
import { nearestCoverSpot, hasLineOfSight, COVER_LAYOUT } from './arena';
import type { Tank } from './tank';
import type { DoctrineId } from './constants';
import { executeManeuver } from './maneuvers';

export interface EnemyBrainDebug {
  offline: boolean;
  latencyMs: number | null;
  model: string | null;
  confidenceThreshold: number;
  sampleManeuver: boolean;
  lastAnswers: BrainAnswers | null;
  requestCount: number;
}

/**
 * Milestone 1: local brain only. Jev loop arrives in Milestone 3.
 */
export class EnemyBrain {
  maneuver: ManeuverId = 'hold';
  aggressionScore = 1;
  flankSide: 1 | -1 = 1;
  private flankUntil = 0;
  private commitUntil = 0;
  private lastTick = 0;
  readonly debug: EnemyBrainDebug = {
    offline: true,
    latencyMs: null,
    model: null,
    confidenceThreshold: 0.4,
    sampleManeuver: true,
    lastAnswers: null,
    requestCount: 0,
  };

  private doctrineId: DoctrineId = 'cautious';

  setDoctrine(id: DoctrineId): void {
    this.doctrineId = id;
  }

  tick(now: number, self: Tank, player: Tank): void {
    if (now - this.lastTick < 0.35) return;
    this.lastTick = now;

    const dist = Math.hypot(player.x - self.x, player.y - self.y);
    const los = hasLineOfSight(self.x, self.y, player.x, player.y);
    const selfInCover = !hasLineOfSight(self.x, self.y, player.x, player.y);
    const playerInCover = !los;

    const view: LocalWorldView = {
      doctrineId: this.doctrineId,
      selfHealth: self.health,
      playerHealth: player.health,
      distance: dist,
      lineOfSight: los,
      selfInCover,
      playerInCover,
      playerReloading: player.reloading,
      selfReloading: self.reloading,
    };

    const answers = localBrain(view);
    this.debug.lastAnswers = answers;
    this.debug.requestCount += 1;

    const next = this.pickManeuver(answers);
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
    self.speedMul = 0.75 + 0.15 * this.aggressionScore;
  }

  private pickManeuver(answers: BrainAnswers): ManeuverId {
    if (answers.maneuver.confidence < this.debug.confidenceThreshold) {
      return this.maneuver;
    }
    if (!this.debug.sampleManeuver) return answers.maneuver.choice;

    const p = answers.maneuver.probabilities;
    const entries = Object.entries(p) as [ManeuverId, number][];
    let r = Math.random();
    for (const [k, v] of entries) {
      r -= v;
      if (r <= 0) return k;
    }
    return answers.maneuver.choice;
  }

  apply(self: Tank, player: Tank, now: number): void {
    const spot = nearestCoverSpot(self.x, self.y, player.x, player.y, COVER_LAYOUT);
    const cmd = executeManeuver(this.maneuver, {
      selfX: self.x,
      selfY: self.y,
      playerX: player.x,
      playerY: player.y,
      coverX: spot.x,
      coverY: spot.y,
      flankSide: this.flankSide,
      now,
    });
    self.setMoveIntent(cmd.heading, cmd.throttle);

    // Lead aim with small error
    const lead = 0.25 + Math.random() * 0.15;
    const aimX = player.x + player.vx * lead + (Math.random() - 0.5) * 40;
    const aimY = player.y + player.vy * lead + (Math.random() - 0.5) * 40;
    self.setAim(aimX, aimY);
  }

  aimTolerance(): number {
    // tighter when low aggression
    return (12 - this.aggressionScore * 3) * (Math.PI / 180);
  }

  shouldFire(self: Tank, player: Tank): boolean {
    if (self.reloading || !self.alive) return false;
    if (!hasLineOfSight(self.x, self.y, player.x, player.y)) return false;
    const desired = Math.atan2(player.y - self.y, player.x - self.x);
    let d = desired - self.turretAngle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) < this.aimTolerance();
  }
}
