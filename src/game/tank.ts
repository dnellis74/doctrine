import Phaser from 'phaser';
import { COLORS, HEALTH, RELOAD, TANK } from './constants';
import { raycastForward } from './arena';

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
  throttle = 0;
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

  setMoveIntent(heading: number, throttle: number): void {
    this.desiredHeading = heading;
    this.throttle = Phaser.Math.Clamp(throttle, 0, 1);
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

    // Hull turns toward desired heading
    const err = Phaser.Math.Angle.Wrap(this.desiredHeading - this.hullAngle);
    const maxTurn = TANK.hullTurnRate * dt;
    this.hullAngle += Phaser.Math.Clamp(err, -maxTurn, maxTurn);

    // Drive forward only when heading error under 60°
    const headingErr = Math.abs(Phaser.Math.Angle.Wrap(this.desiredHeading - this.hullAngle));
    let speed = 0;
    if (headingErr < TANK.driveAngleLimit && this.throttle > 0.05) {
      speed = TANK.maxSpeed * this.throttle * this.speedMul;
    }

    // Obstacle avoidance: if forward probe hits, add perpendicular steer
    if (speed > 0 && raycastForward(this.x, this.y, this.hullAngle, 56)) {
      const leftClear = !raycastForward(this.x, this.y, this.hullAngle - 0.7, 56);
      const rightClear = !raycastForward(this.x, this.y, this.hullAngle + 0.7, 56);
      const side = leftClear && !rightClear ? -1 : rightClear && !leftClear ? 1 : Math.sign(err) || 1;
      this.desiredHeading = this.hullAngle + side * 0.9;
      speed *= 0.45;
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

    // Hull rectangle with tread lines
    const hw = TANK.width / 2;
    const hh = TANK.height / 2;
    const corners = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ].map((p) => rotate(p.x, p.y, this.hullAngle));

    strokePoly(g, corners.map((p) => ({ x: x + p.x, y: y + p.y })), c);

    // Tread lines
    for (const sy of [-hh * 0.55, hh * 0.55]) {
      const a = rotate(-hw * 0.7, sy, this.hullAngle);
      const b = rotate(hw * 0.7, sy, this.hullAngle);
      strokeSeg(g, x + a.x, y + a.y, x + b.x, y + b.y, c);
    }

    // Turret square + barrel
    const tw = 10;
    const tCorners = [
      { x: -tw, y: -tw },
      { x: tw, y: -tw },
      { x: tw, y: tw },
      { x: -tw, y: tw },
    ].map((p) => rotate(p.x, p.y, this.turretAngle));
    strokePoly(g, tCorners.map((p) => ({ x: x + p.x, y: y + p.y })), c);

    const bx0 = x + Math.cos(this.turretAngle) * 8;
    const by0 = y + Math.sin(this.turretAngle) * 8;
    const bx1 = x + Math.cos(this.turretAngle) * TANK.barrelLength;
    const by1 = y + Math.sin(this.turretAngle) * TANK.barrelLength;
    strokeSeg(g, bx0, by0, bx1, by1, c);

    // Reload arc (player only visual for now — both get it lightly)
    if (this.side === 'player' && this.reloadLeft > 0) {
      const t = 1 - this.reloadLeft / this.reloadTime;
      g.lineStyle(2, c, 0.5);
      g.beginPath();
      g.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t, false);
      g.strokePath();
    }

    // Muzzle flash
    if (this.muzzleFlash > 0) {
      const len = 18 + this.muzzleFlash * 40;
      for (const off of [-0.35, 0, 0.35]) {
        const a = this.turretAngle + off;
        strokeSeg(
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

/** Milestone 1 placeholder glow: bright stroke only. Full glow in M4. */
function strokeSeg(
  g: Phaser.GameObjects.Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number,
): void {
  g.lineStyle(1.5, color, 1);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.strokePath();
}

function strokePoly(
  g: Phaser.GameObjects.Graphics,
  pts: { x: number; y: number }[],
  color: number,
): void {
  if (pts.length < 2) return;
  g.lineStyle(1.5, color, 1);
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.closePath();
  g.strokePath();
}
