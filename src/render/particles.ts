import Phaser from 'phaser';
import { COLORS } from '../game/constants';
import { enableGlowBlend, glowSeg } from './vector';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  len: number;
  color: number;
}

interface BurstRing {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
}

/** Reuses one Graphics object — no per-frame allocations of GO. */
export class ParticleSystem {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private particles: Particle[] = [];
  private rings: BurstRing[] = [];

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(20);
    enableGlowBlend(this.gfx);
  }

  hitSparks(x: number, y: number, color: number = COLORS.hit): void {
    const n = 10 + Math.floor(Math.random() * 7);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 220;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.18 + Math.random() * 0.22,
        max: 0.35,
        len: 4 + Math.random() * 8,
        color,
      });
    }
  }

  explode(x: number, y: number): void {
    this.hitSparks(x, y, COLORS.hit);
    this.rings.push({ x, y, r: 8, life: 0.55, max: 0.55 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.2;
      const sp = 120 + Math.random() * 180;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.4 + Math.random() * 0.3,
        max: 0.7,
        len: 8 + Math.random() * 10,
        color: COLORS.hit,
      });
    }
  }

  update(dt: number): void {
    const g = this.gfx;
    g.clear();

    const nextP: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      const a = Math.max(0, p.life / p.max);
      const ang = Math.atan2(p.vy, p.vx);
      glowSeg(
        g,
        p.x,
        p.y,
        p.x - Math.cos(ang) * p.len,
        p.y - Math.sin(ang) * p.len,
        p.color,
        a,
      );
      nextP.push(p);
    }
    this.particles = nextP;

    const nextR: BurstRing[] = [];
    for (const r of this.rings) {
      r.life -= dt;
      if (r.life <= 0) continue;
      r.r += 180 * dt;
      const a = Math.max(0, r.life / r.max);
      for (let i = 0; i < 5; i++) {
        const start = (i / 5) * Math.PI * 2 + 0.1;
        const end = start + (Math.PI * 2) / 5 - 0.25;
        g.lineStyle(6, COLORS.hit, 0.12 * a);
        g.beginPath();
        g.arc(r.x, r.y, r.r, start, end, false);
        g.strokePath();
        g.lineStyle(1.5, COLORS.hit, a);
        g.beginPath();
        g.arc(r.x, r.y, r.r, start, end, false);
        g.strokePath();
      }
      nextR.push(r);
    }
    this.rings = nextR;
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
