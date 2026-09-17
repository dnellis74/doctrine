import Phaser from 'phaser';
import { COLORS, WORLD_H, WORLD_W, type DoctrineId } from '../game/constants';
import {
  COVER_LAYOUT,
  ENEMY_SPAWN,
  PLAYER_SPAWN,
  createArenaBodies,
  segmentHitsAabb,
} from '../game/arena';
import { Tank } from '../game/tank';
import { Shell } from '../game/shell';
import { EnemyBrain } from '../game/enemyBrain';
import { TwinStickInput } from '../input/touch';
import { DesktopInput } from '../input/desktop';
import { drawBasicHud } from '../render/hud';
import { vibrate, prefersReducedMotion } from '../game/haptics';
import { synth } from '../audio/synth';

export interface ArenaData {
  doctrineId: DoctrineId;
}

export class Arena extends Phaser.Scene {
  private player!: Tank;
  private enemy!: Tank;
  private shells: Shell[] = [];
  private brain = new EnemyBrain();
  private doctrineId: DoctrineId = 'cautious';
  private arenaGfx!: Phaser.GameObjects.Graphics;
  private stickGfx!: Phaser.GameObjects.Graphics;
  private hudGfx!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private touch!: TwinStickInput;
  private desktop!: DesktopInput;
  private coverGroup!: Phaser.Physics.Arcade.StaticGroup;
  private ended = false;
  private elapsed = 0;
  private wasPlayerReloading = false;

  constructor() {
    super('Arena');
  }

  init(data: ArenaData): void {
    this.doctrineId = data.doctrineId ?? 'cautious';
    this.ended = false;
    this.shells = [];
    this.elapsed = 0;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.void);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    this.arenaGfx = this.add.graphics().setDepth(0);
    this.drawArena();

    this.coverGroup = createArenaBodies(this);

    this.player = new Tank(
      this,
      'player',
      PLAYER_SPAWN.x,
      PLAYER_SPAWN.y,
      PLAYER_SPAWN.angle,
    );
    this.enemy = new Tank(
      this,
      'enemy',
      ENEMY_SPAWN.x,
      ENEMY_SPAWN.y,
      ENEMY_SPAWN.angle,
    );

    this.physics.add.collider(this.player.body, this.coverGroup);
    this.physics.add.collider(this.enemy.body, this.coverGroup);
    this.physics.add.collider(this.player.body, this.enemy.body);

    this.brain = new EnemyBrain();
    this.brain.setDoctrine(this.doctrineId);

    const parent = this.game.canvas.parentElement ?? document.body;
    this.touch = new TwinStickInput(parent as HTMLElement);
    this.desktop = new DesktopInput(parent as HTMLElement);
    this.touch.attach();
    this.desktop.attach();

    // Phaser multi-touch
    this.input.addPointer(2);

    this.stickGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hudGfx = this.add.graphics().setScrollFactor(0).setDepth(90);
    this.hudText = this.add
      .text(WORLD_W / 2, 40, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#D9F2E6',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(91);

    this.events.once('shutdown', () => this.cleanup());
    this.events.once('destroy', () => this.cleanup());

    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = (): void => {
    if (document.hidden) {
      this.scene.pause();
      synth.suspend();
    } else {
      this.scene.resume();
      synth.resume();
    }
  };

  private cleanup(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.touch?.detach();
    this.desktop?.detach();
    for (const s of this.shells) s.destroy();
    this.shells = [];
  }

  private drawArena(): void {
    const g = this.arenaGfx;
    g.clear();

    // Grid
    g.lineStyle(1, COLORS.grid, 0.25);
    for (let x = 0; x <= WORLD_W; x += 48) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, WORLD_H);
      g.strokePath();
    }
    for (let y = 0; y <= WORLD_H; y += 48) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(WORLD_W, y);
      g.strokePath();
    }

    // Border
    g.lineStyle(1.5, COLORS.cover, 0.8);
    g.strokeRect(12, 12, WORLD_W - 24, WORLD_H - 24);

    // Cover outlines
    for (const b of COVER_LAYOUT) {
      g.lineStyle(1.5, COLORS.cover, 1);
      g.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    }
  }

  update(_time: number, delta: number): void {
    if (this.ended) return;
    const dt = Math.min(delta / 1000, 0.05);
    this.elapsed += dt;

    this.applyPlayerInput();
    this.brain.tick(this.elapsed, this.enemy, this.player);
    this.brain.apply(this.enemy, this.player, this.elapsed);

    if (this.brain.shouldFire(this.enemy, this.player)) {
      this.spawnShell(this.enemy);
    }

    this.player.update(dt);
    this.enemy.update(dt);

    if (this.wasPlayerReloading && !this.player.reloading) {
      synth.reloadReady();
    }
    this.wasPlayerReloading = this.player.reloading;

    this.updateShells(dt);
    this.updateHud();
    this.drawSticks();

    if (this.player.health <= 0 || this.enemy.health <= 0) {
      this.endRound(this.enemy.health <= 0);
    }
  }

  private applyPlayerInput(): void {
    const move = this.touch.move;
    const aim = this.touch.aim;
    const desk = this.desktop.drive();
    const dz = TwinStickInput.DEADZONE;

    if (move.active && move.magnitude > dz) {
      // Stick relative to hull: up=forward, down=reverse, x=turn
      const turn = Math.abs(move.nx) > dz ? move.nx : 0;
      const throttle = Math.abs(move.ny) > dz ? -move.ny : 0;
      this.player.setRelativeDrive(turn, throttle);
    } else if (desk.turn !== 0 || desk.throttle !== 0) {
      this.player.setRelativeDrive(desk.turn, desk.throttle);
    } else {
      this.player.setRelativeDrive(0, 0);
    }

    if (aim.active && aim.magnitude > dz) {
      this.player.setAimAngle(Math.atan2(aim.ny, aim.nx));
    } else {
      const cam = this.cameras.main;
      const ptr = this.input.activePointer;
      const world = cam.getWorldPoint(ptr.x, ptr.y);
      this.player.setAim(world.x, world.y);
    }

    if (this.touch.consumeFire() || this.desktop.consumeFire()) {
      this.spawnShell(this.player);
    }
  }

  private spawnShell(tank: Tank): void {
    const shot = tank.tryFire();
    if (!shot) return;
    synth.fire(tank.side === 'enemy' ? 0.4 : -0.2);
    if (tank.side === 'player') vibrate(15);
    this.shells.push(new Shell(this, tank.side, shot.x, shot.y, shot.angle));
  }

  private updateShells(dt: number): void {
    const next: Shell[] = [];
    for (const shell of this.shells) {
      const prevX = shell.x;
      const prevY = shell.y;
      shell.update(dt);
      if (!shell.alive) {
        shell.destroy();
        continue;
      }

      // Cover collision along segment
      let hitCover = false;
      for (const b of COVER_LAYOUT) {
        if (
          segmentHitsAabb(
            prevX,
            prevY,
            shell.x,
            shell.y,
            b.x,
            b.y,
            b.w / 2 + 2,
            b.h / 2 + 2,
          )
        ) {
          hitCover = true;
          break;
        }
      }
      // Walls (outer bounds)
      if (
        shell.x < 24 ||
        shell.x > WORLD_W - 24 ||
        shell.y < 24 ||
        shell.y > WORLD_H - 24
      ) {
        hitCover = true;
      }

      if (hitCover) {
        synth.hitCover();
        shell.destroy();
        continue;
      }

      const target = shell.owner === 'player' ? this.enemy : this.player;
      const hitR = 22;
      if (
        target.alive &&
        Math.hypot(shell.x - target.x, shell.y - target.y) < hitR
      ) {
        target.takeHit();
        synth.hitTank();
        vibrate(60);
        this.shake();
        shell.destroy();
        if (target.health <= 0) synth.explode();
        continue;
      }

      next.push(shell);
    }
    this.shells = next;
  }

  private shake(): void {
    if (prefersReducedMotion()) return;
    this.cameras.main.shake(120, 0.006);
  }

  private updateHud(): void {
    const intent = this.brain.debug.lastAnswers?.player_intent.choice ?? 'unclear';
    const conf = Math.round(
      (this.brain.debug.lastAnswers?.player_intent.confidence ?? 0) * 100,
    );
    drawBasicHud(this.hudGfx, this.hudText, {
      playerHp: this.player.health,
      enemyHp: this.enemy.health,
      intentLabel: `ENEMY READS YOU AS: ${intent.toUpperCase()} ${conf}%`,
      latencyLabel: 'JEV OFFLINE',
      width: WORLD_W,
    });
  }

  private drawSticks(): void {
    const g = this.stickGfx;
    g.clear();
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const sx = WORLD_W / rect.width;
    const sy = WORLD_H / rect.height;

    const drawOne = (stick: TwinStickInput['move'], color: number) => {
      if (!stick.active) return;
      const ox = (stick.originX - rect.left) * sx;
      const oy = (stick.originY - rect.top) * sy;
      const kx = (stick.x - rect.left) * sx;
      const ky = (stick.y - rect.top) * sy;
      const r = TwinStickInput.MAX_RADIUS * ((sx + sy) / 2);
      g.lineStyle(1.5, color, 0.35);
      g.strokeCircle(ox, oy, r);
      g.lineStyle(1.5, color, 0.9);
      g.strokeCircle(kx, ky, 14);
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(kx, ky);
      g.strokePath();
    };

    drawOne(this.touch.move, COLORS.player);
    drawOne(this.touch.aim, COLORS.enemy);
  }

  private endRound(won: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.time.delayedCall(700, () => {
      this.scene.start('Result', {
        won,
        doctrineId: this.doctrineId,
      });
    });
  }
}
