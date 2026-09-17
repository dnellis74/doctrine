import Phaser from 'phaser';
import { COLORS, SHELL } from '../game/constants';
import type { TankSide } from '../game/tank';

export interface ShellHit {
  kind: 'cover' | 'tank';
  side?: TankSide;
  x: number;
  y: number;
}

export class Shell {
  readonly owner: TankSide;
  readonly color: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  traveled = 0;
  alive = true;
  hitTank = false;
  readonly gfx: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    owner: TankSide,
    x: number,
    y: number,
    angle: number,
  ) {
    this.owner = owner;
    this.color = owner === 'player' ? COLORS.player : COLORS.enemy;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * SHELL.speed;
    this.vy = Math.sin(angle) * SHELL.speed;
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(8);
  }

  update(dt: number): void {
    if (!this.alive) return;
    const step = SHELL.speed * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.traveled += step;
    if (this.traveled >= SHELL.maxRange) {
      this.alive = false;
    }
    this.draw();
  }

  draw(): void {
    const g = this.gfx;
    g.clear();
    if (!this.alive) return;
    const angle = Math.atan2(this.vy, this.vx);
    const len = 10;
    g.lineStyle(1.5, this.color, 1);
    g.beginPath();
    g.moveTo(this.x - Math.cos(angle) * len * 0.5, this.y - Math.sin(angle) * len * 0.5);
    g.lineTo(this.x + Math.cos(angle) * len * 0.5, this.y + Math.sin(angle) * len * 0.5);
    g.strokePath();
  }

  destroy(): void {
    this.alive = false;
    this.gfx.destroy();
  }
}
