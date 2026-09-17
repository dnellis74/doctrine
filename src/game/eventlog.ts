import { hasLineOfSight } from './arena';
import { movingBand, type MovingBand } from './describe';

export type PlayerActionPhrase =
  | 'moved toward me'
  | 'moved away'
  | 'circled'
  | 'entered cover'
  | 'left cover'
  | 'fired, missed'
  | 'fired, hit me'
  | 'stopped';

const MOVE_PHRASE: Record<MovingBand, PlayerActionPhrase> = {
  'toward me': 'moved toward me',
  'away from me': 'moved away',
  sideways: 'circled',
  still: 'stopped',
};

export interface EventLogSample {
  selfX: number;
  selfY: number;
  playerX: number;
  playerY: number;
  playerVx: number;
  playerVy: number;
}

/**
 * Emits short phrases on player state transitions only.
 * Order carries time; no timestamps. Last 5, no consecutive dupes.
 */
export class EventLog {
  private items: string[] = [];
  private prevMoving: MovingBand | null = null;
  private prevInCover: boolean | null = null;
  private primed = false;

  push(phrase: string): void {
    if (this.items[this.items.length - 1] === phrase) return;
    this.items.push(phrase);
    if (this.items.length > 5) this.items.shift();
  }

  list(): string[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
    this.prevMoving = null;
    this.prevInCover = null;
    this.primed = false;
  }

  /** Call every frame (or tick) to detect move/cover transitions. */
  observe(sample: EventLogSample): void {
    const moving = movingBand(
      sample.selfX,
      sample.selfY,
      sample.playerX,
      sample.playerY,
      sample.playerVx,
      sample.playerVy,
    );
    const inCover = !hasLineOfSight(
      sample.selfX,
      sample.selfY,
      sample.playerX,
      sample.playerY,
    );

    if (!this.primed) {
      this.prevMoving = moving;
      this.prevInCover = inCover;
      this.primed = true;
      return;
    }

    if (moving !== this.prevMoving) {
      this.push(MOVE_PHRASE[moving]);
      this.prevMoving = moving;
    }

    if (inCover !== this.prevInCover) {
      this.push(inCover ? 'entered cover' : 'left cover');
      this.prevInCover = inCover;
    }
  }

  /** Player shell hit the enemy (self). */
  playerHitMe(): void {
    this.push('fired, hit me');
  }

  /** Player shell died without hitting the enemy. */
  playerMissed(): void {
    this.push('fired, missed');
  }
}
