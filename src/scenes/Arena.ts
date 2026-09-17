import Phaser from 'phaser';
import {
  COLORS,
  WORLD_H,
  WORLD_W,
  TANK,
  type DoctrineId,
  type BrainMode,
  doctrineById,
  loadBrainMode,
  loadMute,
  saveMute,
} from '../game/constants';
import {
  COVER_LAYOUT,
  ENEMY_SPAWN,
  PLAYER_SPAWN,
  createArenaBodies,
  nearestCoverSpot,
  segmentHitsAabb,
} from '../game/arena';
import { Tank } from '../game/tank';
import { Shell } from '../game/shell';
import { EnemyBrain } from '../game/enemyBrain';
import { TwinStickInput } from '../input/touch';
import { DesktopInput } from '../input/desktop';
import { drawHud, HUD_MUTE_ZONE } from '../render/hud';
import { vibrate, prefersReducedMotion } from '../game/haptics';
import { synth } from '../audio/synth';
import { describe } from '../game/describe';
import { EventLog } from '../game/eventlog';
import { DebugOverlay } from '../debug/overlay';
import { ParticleSystem } from '../render/particles';
import { IntentVectors } from '../render/intent';
import { enableGlowBlend, glowRect, glowSeg } from '../render/vector';
import type { ManeuverId } from '../game/maneuvers';

export interface ArenaData {
  doctrineId: DoctrineId;
  brain?: BrainMode;
}

export class Arena extends Phaser.Scene {
  private player!: Tank;
  private enemy!: Tank;
  private shells: Shell[] = [];
  private brain = new EnemyBrain();
  private doctrineId: DoctrineId = 'cautious';
  private brainMode: BrainMode = 'jev';
  private arenaGfx!: Phaser.GameObjects.Graphics;
  private stickGfx!: Phaser.GameObjects.Graphics;
  private hudGfx!: Phaser.GameObjects.Graphics;
  private touch!: TwinStickInput;
  private desktop!: DesktopInput;
  private coverGroup!: Phaser.Physics.Arcade.StaticGroup;
  private ended = false;
  private elapsed = 0;
  private wasPlayerReloading = false;
  private eventLog = new EventLog();
  private debug!: DebugOverlay;
  private currentState: ReturnType<typeof describe> | null = null;
  private particles!: ParticleSystem;
  private intents!: IntentVectors;
  private lastManeuver: ManeuverId | null = null;
  private muted = false;

  constructor() {
    super('Arena');
  }

  init(data: ArenaData): void {
    this.doctrineId = data.doctrineId ?? 'cautious';
    this.brainMode = data.brain ?? loadBrainMode();
    this.ended = false;
    this.shells = [];
    this.elapsed = 0;
    this.eventLog.clear();
    this.currentState = null;
    this.lastManeuver = null;
    this.muted = loadMute();
    synth.setMuted(this.muted);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.void);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    this.arenaGfx = this.add.graphics().setDepth(0);
    enableGlowBlend(this.arenaGfx);
    this.drawArena();

    this.coverGroup = createArenaBodies(this);
    this.particles = new ParticleSystem(this);
    this.intents = new IntentVectors(this);

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
    this.brain.setBrainMode(this.brainMode);

    const parent = (this.game.canvas.parentElement ?? document.body) as HTMLElement;
    this.touch = new TwinStickInput(parent);
    this.desktop = new DesktopInput(parent);
    this.touch.attach();
    this.desktop.attach();

    this.debug = new DebugOverlay(parent);
    this.debug.bindBrain(this.brain.debug);
    this.debug.onToggle((open) => {
      if (open) this.touch.reset();
    });

    this.brain.onDecision((info) => {
      this.debug.recordDecision({
        at: this.elapsed,
        state: info.state,
        answers: info.answers,
        latencyMs: info.latencyMs,
        model: info.model,
        offline: info.offline,
      });
      if (info.inputTokens) this.debug.addUsage(info.inputTokens);
    });

    void this.brain.probeAtStartup(this.buildState());

    this.input.addPointer(2);

    this.stickGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    enableGlowBlend(this.stickGfx);
    this.hudGfx = this.add.graphics().setScrollFactor(0).setDepth(90);
    enableGlowBlend(this.hudGfx);

    this.add
      .zone(HUD_MUTE_ZONE.x, HUD_MUTE_ZONE.y + 6, HUD_MUTE_ZONE.w, HUD_MUTE_ZONE.h)
      .setScrollFactor(0)
      .setDepth(95)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.toggleMute());

    this.input.keyboard?.on('keydown-M', () => this.toggleMute());

    synth.unlock();
    synth.startEngines();

    this.events.once('shutdown', () => this.cleanup());
    this.events.once('destroy', () => this.cleanup());

    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private toggleMute(): void {
    synth.unlock();
    this.muted = !this.muted;
    synth.setMuted(this.muted);
    saveMute(this.muted);
    if (!this.muted) synth.uiTap();
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
    this.input.keyboard?.off('keydown-M');
    synth.stopEngines();
    this.touch?.detach();
    this.desktop?.detach();
    this.debug?.destroy();
    this.particles?.destroy();
    this.intents?.destroy();
    for (const s of this.shells) s.destroy();
    this.shells = [];
  }

  private drawArena(): void {
    const g = this.arenaGfx;
    g.clear();

    // Faint grid
    for (let x = 0; x <= WORLD_W; x += 48) {
      glowSeg(g, x, 0, x, WORLD_H, COLORS.grid, 0.35);
    }
    for (let y = 0; y <= WORLD_H; y += 48) {
      glowSeg(g, 0, y, WORLD_W, y, COLORS.grid, 0.35);
    }

    glowRect(g, 12, 12, WORLD_W - 24, WORLD_H - 24, COLORS.cover, 0.85);

    for (const b of COVER_LAYOUT) {
      glowRect(g, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, COLORS.cover);
    }
  }

  update(_time: number, delta: number): void {
    if (this.ended) return;
    const dt = Math.min(delta / 1000, 0.05);
    this.elapsed += dt;

    this.applyPlayerInput();
    this.refreshState();
    if (this.currentState) {
      this.brain.tick(this.elapsed, this.enemy, this.player, this.currentState);
    }
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

    if (this.lastManeuver !== null && this.brain.maneuver !== this.lastManeuver) {
      synth.maneuverChange(this.brain.maneuver);
    }
    this.lastManeuver = this.brain.maneuver;

    this.updateEngines();
    this.updateShells(dt);
    this.particles.update(dt);
    this.updateIntents(dt);
    this.updateHud();
    this.drawSticks();

    if (this.player.health <= 0 || this.enemy.health <= 0) {
      this.endRound(this.enemy.health <= 0);
    }
  }

  private updateEngines(): void {
    const pSpeed = Math.min(1, this.player.getSpeed() / TANK.maxSpeed);
    const eSpeed = Math.min(1, this.enemy.getSpeed() / TANK.maxSpeed);
    const pan = (this.enemy.x / WORLD_W) * 2 - 1;
    synth.updateEngines(
      pSpeed,
      this.player.throttle,
      eSpeed,
      this.enemy.throttle,
      pan,
    );
  }

  private buildState() {
    return describe({
      doctrine: doctrineById(this.doctrineId).text,
      self: {
        x: this.enemy.x,
        y: this.enemy.y,
        vx: this.enemy.vx,
        vy: this.enemy.vy,
        health: this.enemy.health,
        reloading: this.enemy.reloading,
      },
      player: {
        x: this.player.x,
        y: this.player.y,
        vx: this.player.vx,
        vy: this.player.vy,
        health: this.player.health,
        reloading: this.player.reloading,
      },
      recent_player_actions: this.eventLog.list(),
    });
  }

  private refreshState(): void {
    this.eventLog.observe({
      selfX: this.enemy.x,
      selfY: this.enemy.y,
      playerX: this.player.x,
      playerY: this.player.y,
      playerVx: this.player.vx,
      playerVy: this.player.vy,
    });
    this.currentState = this.buildState();
    this.debug.setState(this.currentState);
  }

  private applyPlayerInput(): void {
    if (this.debug.visible) {
      this.player.setRelativeDrive(0, 0);
      return;
    }

    const move = this.touch.move;
    const aim = this.touch.aim;
    const desk = this.desktop.drive();
    const dz = TwinStickInput.DEADZONE;

    if (move.active && move.magnitude > dz) {
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
        this.notePlayerShellEnd(shell);
        shell.destroy();
        continue;
      }

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
        this.particles.hitSparks(shell.x, shell.y, COLORS.cover);
        this.notePlayerShellEnd(shell);
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
        shell.hitTank = true;
        synth.hitTank();
        vibrate(60);
        this.shake();
        this.particles.hitSparks(shell.x, shell.y, COLORS.hit);
        if (shell.owner === 'player') this.eventLog.playerHitMe();
        shell.destroy();
        if (target.health <= 0) {
          synth.explode();
          this.particles.explode(target.x, target.y);
        }
        continue;
      }

      next.push(shell);
    }
    this.shells = next;
  }

  private notePlayerShellEnd(shell: Shell): void {
    if (shell.owner !== 'player') return;
    if (shell.hitTank) return;
    this.eventLog.playerMissed();
  }

  private shake(): void {
    if (prefersReducedMotion()) return;
    this.cameras.main.shake(120, 0.006);
  }

  private updateIntents(dt: number): void {
    if (!this.enemy.alive) {
      this.intents.update(dt, {
        x: this.enemy.x,
        y: this.enemy.y,
        playerX: this.player.x,
        playerY: this.player.y,
        coverX: this.enemy.x,
        coverY: this.enemy.y,
        flankSide: this.brain.flankSide,
        probabilities: null,
      });
      return;
    }
    const spot = nearestCoverSpot(
      this.enemy.x,
      this.enemy.y,
      this.player.x,
      this.player.y,
      COVER_LAYOUT,
    );
    const raw = this.brain.debug.lastAnswers?.maneuver.probabilities ?? null;
    const probabilities = raw
      ? (raw as Record<ManeuverId, number>)
      : null;
    this.intents.update(dt, {
      x: this.enemy.x,
      y: this.enemy.y,
      playerX: this.player.x,
      playerY: this.player.y,
      coverX: spot.x,
      coverY: spot.y,
      flankSide: this.brain.flankSide,
      probabilities,
    });
  }

  private updateHud(): void {
    const intent = this.brain.debug.lastAnswers?.player_intent.choice ?? 'unclear';
    const conf = this.brain.debug.lastAnswers?.player_intent.confidence ?? 0;
    const latencyLabel =
      this.brainMode === 'local'
        ? 'LOCAL BRAIN'
        : this.brain.debug.offline
          ? 'JEV OFFLINE'
          : this.brain.debug.latencyMs != null
            ? `JEV ${Math.round(this.brain.debug.latencyMs)}MS`
            : 'JEV ...';
    drawHud(this.hudGfx, {
      playerHp: this.player.health,
      enemyHp: this.enemy.health,
      intentChoice: intent,
      intentConfidence: conf,
      latencyLabel,
      muted: this.muted,
    });
  }

  private drawSticks(): void {
    const g = this.stickGfx;
    g.clear();
    if (this.debug.visible) return;

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
      g.lineStyle(6, color, 0.08);
      g.strokeCircle(ox, oy, r);
      g.lineStyle(1.5, color, 0.35);
      g.strokeCircle(ox, oy, r);
      glowSeg(g, ox, oy, kx, ky, color, 0.9);
      g.lineStyle(6, color, 0.12);
      g.strokeCircle(kx, ky, 14);
      g.lineStyle(1.5, color, 0.9);
      g.strokeCircle(kx, ky, 14);
    };

    drawOne(this.touch.move, COLORS.player);
    drawOne(this.touch.aim, COLORS.enemy);
  }

  private endRound(won: boolean): void {
    if (this.ended) return;
    this.ended = true;
    synth.stopEngines();
    this.time.delayedCall(700, () => {
      this.scene.start('Result', {
        won,
        doctrineId: this.doctrineId,
        brain: this.brainMode,
      });
    });
  }
}
