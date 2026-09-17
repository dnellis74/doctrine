import Phaser from 'phaser';
import {
  COLORS,
  WORLD_H,
  WORLD_W,
  TANK,
  type DoctrineId,
  clampPrompt,
  loadMute,
  loadPrompt,
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
import { LocalEnemy } from '../game/localEnemy';
import { JevBrain } from '../game/jevBrain';
import { drawHud, HUD_HOME_ZONE, HUD_MUTE_ZONE } from '../render/hud';
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
  /** Free-text doctrine prompt for the player's Jev brain. */
  doctrinePrompt?: string;
}

export class Arena extends Phaser.Scene {
  private player!: Tank;
  private enemy!: Tank;
  private shells: Shell[] = [];
  private enemyAi = new LocalEnemy();
  private jev = new JevBrain();
  private doctrineId: DoctrineId = 'cautious';
  private doctrinePrompt = '';
  private arenaGfx!: Phaser.GameObjects.Graphics;
  private hudGfx!: Phaser.GameObjects.Graphics;
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
    this.doctrinePrompt = clampPrompt(
      data.doctrinePrompt ?? loadPrompt(this.doctrineId),
    );
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

    this.enemyAi = new LocalEnemy();
    this.enemyAi.setDoctrine(this.doctrineId);

    this.jev = new JevBrain();

    const parent = (this.game.canvas.parentElement ?? document.body) as HTMLElement;
    this.debug = new DebugOverlay(parent);
    this.debug.bindBrain(this.jev.debug);

    this.jev.onDecision((info) => {
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

    void this.jev.probeAtStartup(this.buildState());

    this.hudGfx = this.add.graphics().setScrollFactor(0).setDepth(90);
    enableGlowBlend(this.hudGfx);

    this.add
      .zone(HUD_MUTE_ZONE.x, HUD_MUTE_ZONE.y + 6, HUD_MUTE_ZONE.w, HUD_MUTE_ZONE.h)
      .setScrollFactor(0)
      .setDepth(95)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.toggleMute());

    this.add
      .zone(HUD_HOME_ZONE.x, HUD_HOME_ZONE.y + 6, HUD_HOME_ZONE.w, HUD_HOME_ZONE.h)
      .setScrollFactor(0)
      .setDepth(95)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.goHome());

    this.input.keyboard?.on('keydown-M', () => this.toggleMute());
    this.input.keyboard?.on('keydown-ESC', () => this.goHome());

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

  private goHome(): void {
    if (this.ended) return;
    this.ended = true;
    synth.unlock();
    synth.uiTap();
    synth.stopEngines();
    this.scene.start('Title');
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
    this.input.keyboard?.off('keydown-ESC');
    synth.stopEngines();
    this.debug?.destroy();
    this.particles?.destroy();
    this.intents?.destroy();
    for (const s of this.shells) s.destroy();
    this.shells = [];
  }

  private drawArena(): void {
    const g = this.arenaGfx;
    g.clear();

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

    this.refreshState();

    // Player = Jev; enemy = local doctrine machine
    if (this.currentState) {
      this.jev.tick(this.elapsed, this.player, this.enemy, this.currentState);
    }
    this.jev.apply(this.player, this.enemy, this.elapsed);
    if (this.jev.shouldFire(this.player, this.enemy)) {
      this.spawnShell(this.player);
    }

    this.enemyAi.tick(this.elapsed, this.enemy, this.player);
    this.enemyAi.apply(this.enemy, this.player, this.elapsed);
    if (this.enemyAi.shouldFire(this.enemy, this.player)) {
      this.spawnShell(this.enemy);
    }

    this.player.update(dt);
    this.enemy.update(dt);

    if (this.wasPlayerReloading && !this.player.reloading) {
      synth.reloadReady();
    }
    this.wasPlayerReloading = this.player.reloading;

    if (this.lastManeuver !== null && this.jev.maneuver !== this.lastManeuver) {
      synth.maneuverChange(this.jev.maneuver);
    }
    this.lastManeuver = this.jev.maneuver;

    this.updateEngines();
    this.updateShells(dt);
    this.particles.update(dt);
    this.updateIntents(dt);
    this.updateHud();

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

  /** Symbolic state from Jev's POV: self = player tank, player = enemy opponent. */
  private buildState() {
    return describe({
      doctrine: this.doctrinePrompt,
      self: {
        x: this.player.x,
        y: this.player.y,
        vx: this.player.vx,
        vy: this.player.vy,
        health: this.player.health,
        reloading: this.player.reloading,
      },
      player: {
        x: this.enemy.x,
        y: this.enemy.y,
        vx: this.enemy.vx,
        vy: this.enemy.vy,
        health: this.enemy.health,
        reloading: this.enemy.reloading,
      },
      recent_player_actions: this.eventLog.list(),
    });
  }

  private refreshState(): void {
    // Track opponent (enemy) actions relative to self (player / Jev)
    this.eventLog.observe({
      selfX: this.player.x,
      selfY: this.player.y,
      playerX: this.enemy.x,
      playerY: this.enemy.y,
      playerVx: this.enemy.vx,
      playerVy: this.enemy.vy,
    });
    this.currentState = this.buildState();
    this.debug.setState(this.currentState);
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
        this.noteOpponentShellEnd(shell);
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
        this.noteOpponentShellEnd(shell);
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
        if (shell.owner === 'enemy') this.eventLog.opponentHitMe();
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

  private noteOpponentShellEnd(shell: Shell): void {
    if (shell.owner !== 'enemy') return;
    if (shell.hitTank) return;
    this.eventLog.opponentMissed();
  }

  private shake(): void {
    if (prefersReducedMotion()) return;
    this.cameras.main.shake(120, 0.006);
  }

  private updateIntents(dt: number): void {
    // Intent vectors sit on the Jev-driven player tank
    if (!this.player.alive) {
      this.intents.update(dt, {
        x: this.player.x,
        y: this.player.y,
        playerX: this.enemy.x,
        playerY: this.enemy.y,
        coverX: this.player.x,
        coverY: this.player.y,
        flankSide: this.jev.flankSide,
        probabilities: null,
      });
      return;
    }
    const spot = nearestCoverSpot(
      this.player.x,
      this.player.y,
      this.enemy.x,
      this.enemy.y,
      COVER_LAYOUT,
    );
    const raw = this.jev.debug.lastAnswers?.maneuver.probabilities ?? null;
    const probabilities = raw ? (raw as Record<ManeuverId, number>) : null;
    this.intents.update(dt, {
      x: this.player.x,
      y: this.player.y,
      playerX: this.enemy.x,
      playerY: this.enemy.y,
      coverX: spot.x,
      coverY: spot.y,
      flankSide: this.jev.flankSide,
      probabilities,
    });
  }

  private updateHud(): void {
    const intent = this.jev.debug.lastAnswers?.player_intent.choice ?? 'unclear';
    const conf = this.jev.debug.lastAnswers?.player_intent.confidence ?? 0;
    const latencyLabel = this.jev.debug.offline
      ? 'JEV OFFLINE'
      : this.jev.debug.latencyMs != null
        ? `JEV ${Math.round(this.jev.debug.latencyMs)}MS`
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

  private endRound(won: boolean): void {
    if (this.ended) return;
    this.ended = true;
    synth.stopEngines();
    this.time.delayedCall(700, () => {
      this.scene.start('Result', {
        won,
        doctrineId: this.doctrineId,
        doctrinePrompt: this.doctrinePrompt,
      });
    });
  }
}
