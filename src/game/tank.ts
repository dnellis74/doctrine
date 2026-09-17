import Phaser from 'phaser';
import { COLORS, HEALTH, RELOAD, TANK } from './constants';
import { raycastForward } from './arena';
import { enableGlowBlend, glowArc, glowPoly, glowSeg } from '../render/vector';

export type TankSide = 'player' | 'enemy';

export interface TankState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hullAngle: number;
  turretAngle: number;
  desiredHeading: number;
  throttle: number;
  health: number;
  reloadLeft: number;
  reloadTime: number;
  speedMul: number;
  alive: boolean;
}

export class Tank {
  readonly side: TankSide;
  readonly color: number;
  readonly body: Phaser.GameObjects.Rectangle;
  readonly gfx: Phaser.GameObjects.Graphics;
  readonly physicsBody: Phaser.Physics.Arcade.Body;

  hullAngle = 0;
  turretAngle = 0;
  desiredHeading = 0;
  /** Signed throttle: +forward, -reverse. Absolute mode uses 0..1. */
  throttle = 0;
  /** Relative turn input: -1 left .. +1 right. Used when driveMode is relative. */
  turnInput = 0;
  driveMode: 'absolute' | 'relative' = 'absolute';
  health = HEALTH;
  reloadLeft = 0;
  reloadTime: number;
  speedMul = 1;
  aimX = 0;
  aimY = 0;
  muzzleFlash = 0;

  constructor(scene: Phaser.Scene, side: TankSide, x: number, y: number, angle: number) {
    this.side = side;
    this.color = side === 'player' ? COLORS.player : COLORS.enemy;
    this.reloadTime = side === 'player' ? RELOAD.player : RELOAD.enemy;
    this.hullAngle = angle;
    this.turretAngle = angle;
    this.desiredHeading = angle;
    this.aimX = x + Math.cos(angle) * 200;
    this.aimY = y + Math.sin(angle) * 200;

    this.body = scene.add.rectangle(x, y, TANK.width, TANK.height, 0x000000, 0);
    scene.physics.add.existing(this.body);
    this.physicsBody = this.body.body as Phaser.Physics.Arcade.Body;
    this.physicsBody.setCollideWorldBounds(true);
    this.physicsBody.setBounce(0, 0);
    this.physicsBody.setDrag(0, 0);
    this.physicsBody.setMaxVelocity(TANK.maxSpeed * 1.5, TANK.maxSpeed * 1.5);

    this.gfx = scene.add.graphics();
    this.gfx.setDepth(10);
    enableGlowBlend(this.gfx);
  }

  get x(): number {
    return this.body.x;
  }

  get y(): number {
    return this.body.y;
  }

  get vx(): number {
    return this.physicsBody.velocity.x;
  }

  get vy(): number {
    return this.physicsBody.velocity.y;
  }

  get alive(): boolean {
    return this.health > 0;
  }

  get reloading(): boolean {
    return this.reloadLeft > 0;
  }

  getSpeed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  snapshot(): TankState {
    return {
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      hullAngle: this.hullAngle,
      turretAngle: this.turretAngle,
      desiredHeading: this.desiredHeading,
      throttle: this.throttle,
      health: this.health,
      reloadLeft: this.reloadLeft,
      reloadTime: this.reloadTime,
      speedMul: this.speedMul,
      alive: this.alive,
    };
  }

  /** AI / absolute: face a world heading, drive forward when aligned. */
  setMoveIntent(heading: number, throttle: number): void {
    this.driveMode = 'absolute';
    this.desiredHeading = heading;
    this.turnInput = 0;
    this.throttle = Phaser.Math.Clamp(throttle, 0, 1);
  }

  /**
   * Player tank controls: turn and throttle relative to the hull.
   * turn: -1 left .. +1 right; throttle: -1 reverse .. +1 forward.
   */
  setRelativeDrive(turn: number, throttle: number): void {
    this.driveMode = 'relative';
    this.turnInput = Phaser.Math.Clamp(turn, -1, 1);
    this.throttle = Phaser.Math.Clamp(throttle, -1, 1);
    this.desiredHeading = this.hullAngle;
  }

  setAim(worldX: number, worldY: number): void {
    this.aimX = worldX;
    this.aimY = worldY;
  }

  setAimAngle(angle: number): void {
    this.aimX = this.x + Math.cos(angle) * 400;
    this.aimY = this.y + Math.sin(angle) * 400;
  }

  tryFire(): { x: number; y: number; angle: number } | null {
    if (!this.alive || this.reloadLeft > 0) return null;
    this.reloadLeft = this.reloadTime;
    this.muzzleFlash = 0.12;
    const angle = this.turretAngle;
    const x = this.x + Math.cos(angle) * TANK.barrelLength;
    const y = this.y + Math.sin(angle) * TANK.barrelLength;
    return { x, y, angle };
  }

  takeHit(): void {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - 1);
  }

  update(dt: number): void {
    if (!this.alive) {
      this.physicsBody.setVelocity(0, 0);
      this.draw();
      return;
    }

    if (this.reloadLeft > 0) this.reloadLeft = Math.max(0, this.reloadLeft - dt);
    if (this.muzzleFlash > 0) this.muzzleFlash = Math.max(0, this.muzzleFlash - dt);

    let speed = 0;
    const maxTurn = TANK.hullTurnRate * dt;

    if (this.driveMode === 'relative') {
      this.hullAngle += this.turnInput * TANK.hullTurnRate * dt;
      if (Math.abs(this.throttle) > 0.05) {
        speed = TANK.maxSpeed * this.throttle * this.speedMul;
      }
      this.desiredHeading = this.hullAngle;

      // Obstacle avoidance along travel direction
      const travelAngle = speed >= 0 ? this.hullAngle : this.hullAngle + Math.PI;
      if (Math.abs(speed) > 0 && raycastForward(this.x, this.y, travelAngle, 56)) {
        const leftClear = !raycastForward(this.x, this.y, travelAngle - 0.7, 56);
        const rightClear = !raycastForward(this.x, this.y, travelAngle + 0.7, 56);
        const side =
          leftClear && !rightClear ? -1 : rightClear && !leftClear ? 1 : Math.sign(this.turnInput) || 1;
        this.hullAngle += side * 0.9 * dt * 2;
        speed *= 0.45;
      }
    } else {
      // Absolute: hull turns toward desired heading
      const err = Phaser.Math.Angle.Wrap(this.desiredHeading - this.hullAngle);
      this.hullAngle += Phaser.Math.Clamp(err, -maxTurn, maxTurn);

      // Drive forward only when heading error under 60°
      const headingErr = Math.abs(Phaser.Math.Angle.Wrap(this.desiredHeading - this.hullAngle));
      if (headingErr < TANK.driveAngleLimit && this.throttle > 0.05) {
        speed = TANK.maxSpeed * this.throttle * this.speedMul;
      }

      // Look farther when moving faster. Arena walls + cover.
      const look = 56 + Math.min(1, Math.abs(speed) / TANK.maxSpeed) * 50;
      const blocked = speed > 0 && raycastForward(this.x, this.y, this.hullAngle, look);
      if (blocked) {
        const leftClear = !raycastForward(this.x, this.y, this.hullAngle - 0.75, look);
        const rightClear = !raycastForward(this.x, this.y, this.hullAngle + 0.75, look);
        const side =
          leftClear && !rightClear
            ? -1
            : rightClear && !leftClear
              ? 1
              : Math.sign(err) || 1;
        this.desiredHeading = this.hullAngle + side * 1.1;

        // If already below near-max speed (scraping / slowed), stop pushing into the wall
        // and turn clear. At high speed, bleed speed while peeling off.
        const nearMax = this.getSpeed() >= TANK.maxSpeed * this.speedMul * 0.85;
        if (!nearMax) {
          speed = 0;
        } else {
          speed *= 0.4;
        }
      }
    }

    this.physicsBody.setVelocity(
      Math.cos(this.hullAngle) * speed,
      Math.sin(this.hullAngle) * speed,
    );

    // Turret toward aim
    const aimAngle = Math.atan2(this.aimY - this.y, this.aimX - this.x);
    const tErr = Phaser.Math.Angle.Wrap(aimAngle - this.turretAngle);
    const tMax = TANK.turretTurnRate * dt;
    this.turretAngle += Phaser.Math.Clamp(tErr, -tMax, tMax);

    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    if (!this.alive) return;

    const x = this.x;
    const y = this.y;
    const c = this.color;

    const hw = TANK.width / 2;
    const hh = TANK.height / 2;
    const corners = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ].map((p) => rotate(p.x, p.y, this.hullAngle));

    glowPoly(
      g,
      corners.map((p) => ({ x: x + p.x, y: y + p.y })),
      c,
    );

    for (const sy of [-hh * 0.55, hh * 0.55]) {
      const a = rotate(-hw * 0.7, sy, this.hullAngle);
      const b = rotate(hw * 0.7, sy, this.hullAngle);
      glowSeg(g, x + a.x, y + a.y, x + b.x, y + b.y, c);
    }

    const tw = 10;
    const tCorners = [
      { x: -tw, y: -tw },
      { x: tw, y: -tw },
      { x: tw, y: tw },
      { x: -tw, y: tw },
    ].map((p) => rotate(p.x, p.y, this.turretAngle));
    glowPoly(
      g,
      tCorners.map((p) => ({ x: x + p.x, y: y + p.y })),
      c,
    );

    const bx0 = x + Math.cos(this.turretAngle) * 8;
    const by0 = y + Math.sin(this.turretAngle) * 8;
    const bx1 = x + Math.cos(this.turretAngle) * TANK.barrelLength;
    const by1 = y + Math.sin(this.turretAngle) * TANK.barrelLength;
    glowSeg(g, bx0, by0, bx1, by1, c);

    if (this.side === 'player' && this.reloadLeft > 0) {
      const t = 1 - this.reloadLeft / this.reloadTime;
      glowArc(g, x, y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t, c, 0.7);
    }

    if (this.muzzleFlash > 0) {
      const len = 18 + this.muzzleFlash * 40;
      for (const off of [-0.35, 0, 0.35]) {
        const a = this.turretAngle + off;
        glowSeg(
          g,
          bx1,
          by1,
          bx1 + Math.cos(a) * len,
          by1 + Math.sin(a) * len,
          COLORS.hit,
        );
      }
    }
  }

  destroy(): void {
    this.gfx.destroy();
    this.body.destroy();
  }
}

function rotate(x: number, y: number, a: number): { x: number; y: number } {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}
