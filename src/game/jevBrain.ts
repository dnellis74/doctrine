import type { BrainAnswers } from './localBrain';
import { localBrain } from './localBrain';
import type { ManeuverId } from './maneuvers';
import { nearestCoverSpot, hasLineOfSight, COVER_LAYOUT, steerAroundObstacles } from './arena';
import type { Tank } from './tank';
import { executeManeuver } from './maneuvers';
import type { SymbolicState } from './describe';
import { postDecide } from './decideClient';

export interface JevBrainDebug {
  offline: boolean;
  latencyMs: number | null;
  model: string | null;
  confidenceThreshold: number;
  sampleManeuver: boolean;
  lastAnswers: BrainAnswers | null;
  requestCount: number;
  consecutiveFailures: number;
  lastDecideError: string | null;
}

type DecisionListener = (info: {
  state: SymbolicState;
  answers: BrainAnswers;
  latencyMs: number | null;
  model: string | null;
  offline: boolean;
  inputTokens?: number;
}) => void;

/**
 * Player tank brain — Jev only (local cautious fallback if decide is down).
 * Cadence 350ms, one in-flight, 1200ms staleness drop, confidence gate,
 * 600ms min commit, fallback after 3 failures.
 */
export class JevBrain {
  maneuver: ManeuverId = 'hold';
  aggressionScore = 1;
  flankSide: 1 | -1 = 1;
  private flankUntil = 0;
  private commitUntil = 0;
  private lastTick = 0;
  private pending = false;
  private offlineRetryAt = 0;
  private probed = false;
  private listeners: DecisionListener[] = [];
  private lastSelf: Tank | null = null;
  private lastOpponent: Tank | null = null;
  private lastState: SymbolicState | null = null;

  readonly debug: JevBrainDebug = {
    offline: false,
    latencyMs: null,
    model: null,
    confidenceThreshold: 0.4,
    sampleManeuver: true,
    lastAnswers: null,
    requestCount: 0,
    consecutiveFailures: 0,
    lastDecideError: null,
  };

  onDecision(cb: DecisionListener): void {
    this.listeners.push(cb);
  }

  async probeAtStartup(state: SymbolicState): Promise<void> {
    if (this.probed) return;
    this.probed = true;
    const result = await postDecide(state);
    if (!result.ok) {
      this.debug.lastDecideError = `${result.status ?? 'net'}: ${result.error}`;
      this.enterOffline();
      return;
    }
    this.debug.lastDecideError = null;
    this.onJevSuccess(
      result.answers,
      result.model,
      result.latencyMs,
      result.usage.input_tokens,
      state,
    );
  }

  tick(now: number, self: Tank, opponent: Tank, state: SymbolicState): void {
    this.lastSelf = self;
    this.lastOpponent = opponent;
    this.lastState = state;

    if (now - this.lastTick < 0.35) return;
    this.lastTick = now;

    if (this.debug.offline) {
      this.runFallback(self, opponent, now);
      if (now >= this.offlineRetryAt && !this.pending) {
        this.requestJev(state, now);
      }
      return;
    }

    if (this.pending) return;
    this.requestJev(state, now);
  }

  private requestJev(state: SymbolicState, gameNow: number): void {
    this.pending = true;
    const wallStart = performance.now();

    void postDecide(state).then((result) => {
      this.pending = false;
      const elapsedMs = performance.now() - wallStart;

      if (elapsedMs > 1200) {
        this.debug.lastDecideError = `stale ${Math.round(elapsedMs)}ms`;
        this.noteFailure(gameNow);
        return;
      }

      if (!result.ok) {
        this.debug.lastDecideError = `${result.status ?? 'net'}: ${result.error}`;
        this.noteFailure(gameNow);
        return;
      }

      this.debug.lastDecideError = null;
      this.onJevSuccess(
        result.answers,
        result.model,
        result.latencyMs,
        result.usage.input_tokens,
        state,
        gameNow,
      );
    });
  }

  private noteFailure(gameNow: number): void {
    this.debug.consecutiveFailures += 1;
    if (this.debug.consecutiveFailures >= 3 || this.debug.offline) {
      this.enterOffline();
      this.offlineRetryAt = gameNow + 3;
    }
    if (this.lastSelf && this.lastOpponent) {
      this.runFallback(this.lastSelf, this.lastOpponent, gameNow);
    }
  }

  private onJevSuccess(
    answers: BrainAnswers,
    model: string,
    latencyMs: number,
    inputTokens: number | undefined,
    state: SymbolicState,
    gameNow = this.lastTick,
  ): void {
    this.debug.offline = false;
    this.debug.consecutiveFailures = 0;
    this.debug.latencyMs = latencyMs;
    this.debug.model = model;
    this.debug.lastAnswers = answers;
    this.debug.requestCount += 1;
    this.commitAnswers(answers, gameNow);
    this.emit(state, answers, latencyMs, model, false, inputTokens);
  }

  /** Emergency local when Jev is unreachable — cautious preset. */
  private runFallback(self: Tank, opponent: Tank, gameNow: number): void {
    const dist = Math.hypot(opponent.x - self.x, opponent.y - self.y);
    const los = hasLineOfSight(self.x, self.y, opponent.x, opponent.y);
    const answers = localBrain({
      doctrineId: 'cautious',
      selfHealth: self.health,
      playerHealth: opponent.health,
      distance: dist,
      lineOfSight: los,
      selfInCover: !los,
      playerInCover: !los,
      playerReloading: opponent.reloading,
      selfReloading: self.reloading,
    });
    this.debug.lastAnswers = answers;
    this.debug.model = 'local';
    this.commitAnswers(answers, gameNow);
  }

  private enterOffline(): void {
    const wasOnline = !this.debug.offline;
    this.debug.offline = true;
    this.debug.latencyMs = null;
    this.debug.model = 'local';
    this.offlineRetryAt = this.lastTick + 3;
    if (wasOnline && this.lastState && this.debug.lastAnswers) {
      this.debug.requestCount += 1;
      this.emit(this.lastState, this.debug.lastAnswers, null, 'local', true);
    }
  }

  private commitAnswers(answers: BrainAnswers, now: number): void {
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

  private emit(
    state: SymbolicState,
    answers: BrainAnswers,
    latencyMs: number | null,
    model: string | null,
    offline: boolean,
    inputTokens?: number,
  ): void {
    for (const cb of this.listeners) {
      cb({ state, answers, latencyMs, model, offline, inputTokens });
    }
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
