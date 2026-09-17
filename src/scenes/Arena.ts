import Phaser from 'phaser';
import {
  COLORS,
  WORLD_H,
  WORLD_W,
  TANK,
  type ControllerId,
  clampPrompt,
  isLocalControl,
  loadEnemyControl,
  loadEnemyPrompt,
  loadMute,
  loadPlayerControl,
  loadPlayerPrompt,
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
import { TwinStickInput } from '../input/touch';
import { DesktopInput } from '../input/desktop';
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
  playerControl?: ControllerId;
  enemyControl?: ControllerId;
  playerPrompt?: string;
  enemyPrompt?: string;
}

export class Arena extends Phaser.Scene {
  private player!: Tank;
  private enemy!: Tank;
  private shells: Shell[] = [];

  private playerControl: ControllerId = 'jev';
  private enemyControl: ControllerId = 'cautious';
  private playerPrompt = '';
  private enemyPrompt = '';

  private playerLocal: LocalEnemy | null = null;
  private enemyLocal: LocalEnemy | null = null;
  private playerJev: JevBrain | null = null;
  private enemyJev: JevBrain | null = null;

  private playerLog = new EventLog();
  private enemyLog = new EventLog();

  private arenaGfx!: Phaser.GameObjects.Graphics;
  private stickGfx!: Phaser.GameObjects.Graphics;
  private hudGfx!: Phaser.GameObjects.Graphics;
  private coverGroup!: Phaser.Physics.Arcade.StaticGroup;
  private touch: TwinStickInput | null = null;
  private desktop: DesktopInput | null = null;
  private ended = false;
  /** Someone is at 0 HP — no new orders, wait for in-flight shells to resolve. */
  private resolving = false;
  private elapsed = 0;
  private wasPlayerReloading = false;
  private debug!: DebugOverlay;
  private particles!: ParticleSystem;
  private playerIntents!: IntentVectors;
  private enemyIntents!: IntentVectors;
  private lastPlayerManeuver: ManeuverId | null = null;
  private lastEnemyManeuver: ManeuverId | null = null;
  private muted = false;

  constructor() {
    super('Arena');
  }

  init(data: ArenaData): void {
    this.playerControl = data.playerControl ?? loadPlayerControl();
    this.enemyControl = data.enemyControl ?? loadEnemyControl();
    this.playerPrompt = clampPrompt(data.playerPrompt ?? loadPlayerPrompt());
    this.enemyPrompt = clampPrompt(data.enemyPrompt ?? loadEnemyPrompt());
    this.ended = false;
    this.resolving = false;
    this.shells = [];
    this.elapsed = 0;
    this.playerLog.clear();
    this.enemyLog.clear();
    this.lastPlayerManeuver = null;
    this.lastEnemyManeuver = null;
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
    this.playerIntents = new IntentVectors(this);
    this.enemyIntents = new IntentVectors(this);

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

    this.setupControllers();

    const parent = (this.game.canvas.parentElement ?? document.body) as HTMLElement;
    this.debug = new DebugOverlay(parent);
    const debugBrain = this.playerJev ?? this.enemyJev;
    if (debugBrain) {
      this.debug.bindBrain(debugBrain.debug);
      debugBrain.onDecision((info) => {
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
      void debugBrain.probeAtStartup(
        this.playerJev
          ? this.buildStateFor('player')
          : this.buildStateFor('enemy'),
      );
      if (this.playerJev && this.enemyJev && this.enemyJev !== debugBrain) {
        void this.enemyJev.probeAtStartup(this.buildStateFor('enemy'));
      }
    }

    if (this.playerControl === 'human' || this.enemyControl === 'human') {
      this.desktop = new DesktopInput(parent);
      this.desktop.attach();
    }
    if (this.playerControl === 'human') {
      this.touch = new TwinStickInput(parent);
      this.touch.attach();
      this.input.addPointer(2);
    }

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

  private setupControllers(): void {
    this.playerLocal = null;
    this.enemyLocal = null;
    this.playerJev = null;
    this.enemyJev = null;

    if (isLocalControl(this.playerControl)) {
      this.playerLocal = new LocalEnemy();
      this.playerLocal.setDoctrine(this.playerControl);
    } else if (this.playerControl === 'jev') {
      this.playerJev = new JevBrain();
    }

    if (isLocalControl(this.enemyControl)) {
      this.enemyLocal = new LocalEnemy();
      this.enemyLocal.setDoctrine(this.enemyControl);
    } else if (this.enemyControl === 'jev') {
      this.enemyJev = new JevBrain();
    }
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
    this.touch?.detach();
    this.desktop?.detach();
    this.debug?.destroy();
    this.particles?.destroy();
    this.playerIntents?.destroy();
    this.enemyIntents?.destroy();
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

    if (!this.resolving) {
      this.refreshLogs();
      this.tickSide('player');
      this.tickSide('enemy');
      this.noteManeuverSounds();
    } else {
      // Dead tanks stay put; living tank freezes so only final shells decide
      this.player.setRelativeDrive(0, 0);
      this.enemy.setRelativeDrive(0, 0);
      this.player.setMoveIntent(this.player.hullAngle, 0);
      this.enemy.setMoveIntent(this.enemy.hullAngle, 0);
    }

    this.player.update(dt);
    this.enemy.update(dt);

    if (
      !this.resolving &&
      this.playerControl === 'human' &&
      this.wasPlayerReloading &&
      !this.player.reloading
    ) {
      synth.reloadReady();
    }
    this.wasPlayerReloading = this.player.reloading;

    this.updateEngines();
    this.updateShells(dt);
    this.particles.update(dt);
    this.updateIntents(dt);
    this.drawSticks();
    this.updateHud();

    const playerDead = this.player.health <= 0;
    const enemyDead = this.enemy.health <= 0;

    if ((playerDead || enemyDead) && !this.resolving) {
      this.resolving = true;
    }

    if (this.resolving && this.shells.length === 0) {
      if (playerDead && enemyDead) this.endRound('tie');
      else if (enemyDead) this.endRound('win');
      else this.endRound('lose');
    }
  }

  private tickSide(side: 'player' | 'enemy'): void {
    const self = side === 'player' ? this.player : this.enemy;
    const opp = side === 'player' ? this.enemy : this.player;
    const control = side === 'player' ? this.playerControl : this.enemyControl;
    const local = side === 'player' ? this.playerLocal : this.enemyLocal;
    const jev = side === 'player' ? this.playerJev : this.enemyJev;

    if (control === 'human') {
      this.applyHuman(side);
      return;
    }

    if (local) {
      local.tick(this.elapsed, self, opp);
      local.apply(self, opp, this.elapsed);
      if (local.shouldFire(self, opp)) this.spawnShell(self);
      return;
    }

    if (jev) {
      const state = this.buildStateFor(side);
      jev.tick(this.elapsed, self, opp, state);
      jev.apply(self, opp, this.elapsed);
      if (jev.shouldFire(self, opp)) this.spawnShell(self);
      if (side === 'player' || !this.playerJev) {
        this.debug.setState(state);
      }
    }
  }

  private applyHuman(side: 'player' | 'enemy'): void {
    const tank = side === 'player' ? this.player : this.enemy;
    const opp = side === 'player' ? this.enemy : this.player;
    if (this.debug.visible) {
      tank.setRelativeDrive(0, 0);
      return;
    }

    if (side === 'player') {
      const move = this.touch?.move;
      const aim = this.touch?.aim;
      const desk = this.desktop?.driveP1() ?? { turn: 0, throttle: 0 };
      const dz = TwinStickInput.DEADZONE;

      if (move && move.active && move.magnitude > dz) {
        const turn = Math.abs(move.nx) > dz ? move.nx : 0;
        const throttle = Math.abs(move.ny) > dz ? -move.ny : 0;
        tank.setRelativeDrive(turn, throttle);
      } else if (desk.turn !== 0 || desk.throttle !== 0) {
        tank.setRelativeDrive(desk.turn, desk.throttle);
      } else {
        tank.setRelativeDrive(0, 0);
      }

      if (aim && aim.active && aim.magnitude > dz) {
        tank.setAimAngle(Math.atan2(aim.ny, aim.nx));
      } else {
        const cam = this.cameras.main;
        const ptr = this.input.activePointer;
        const world = cam.getWorldPoint(ptr.x, ptr.y);
        tank.setAim(world.x, world.y);
      }

      if (this.touch?.consumeFire() || this.desktop?.consumeFireP1()) {
        this.spawnShell(tank);
      }
    } else {
      const desk = this.desktop?.driveP2() ?? { turn: 0, throttle: 0 };
      tank.setRelativeDrive(desk.turn, desk.throttle);
      tank.setAim(opp.x, opp.y);
      if (this.desktop?.consumeFireP2()) this.spawnShell(tank);
    }
  }

  private noteManeuverSounds(): void {
    if (this.playerJev) {
      if (
        this.lastPlayerManeuver !== null &&
        this.playerJev.maneuver !== this.lastPlayerManeuver
      ) {
        synth.maneuverChange(this.playerJev.maneuver);
      }
      this.lastPlayerManeuver = this.playerJev.maneuver;
    }
    if (this.enemyJev) {
      if (
        this.lastEnemyManeuver !== null &&
        this.enemyJev.maneuver !== this.lastEnemyManeuver
      ) {
        synth.maneuverChange(this.enemyJev.maneuver);
      }
      this.lastEnemyManeuver = this.enemyJev.maneuver;
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

  private buildStateFor(side: 'player' | 'enemy') {
    const self = side === 'player' ? this.player : this.enemy;
    const opp = side === 'player' ? this.enemy : this.player;
    const doctrine = side === 'player' ? this.playerPrompt : this.enemyPrompt;
    const log = side === 'player' ? this.playerLog : this.enemyLog;
    return describe({
      doctrine,
      self: {
        x: self.x,
        y: self.y,
        vx: self.vx,
        vy: self.vy,
        health: self.health,
        reloading: self.reloading,
      },
      player: {
        x: opp.x,
        y: opp.y,
        vx: opp.vx,
        vy: opp.vy,
        health: opp.health,
        reloading: opp.reloading,
      },
      recent_player_actions: log.list(),
    });
  }

  private refreshLogs(): void {
    this.playerLog.observe({
      selfX: this.player.x,
      selfY: this.player.y,
      playerX: this.enemy.x,
      playerY: this.enemy.y,
      playerVx: this.enemy.vx,
      playerVy: this.enemy.vy,
    });
    this.enemyLog.observe({
      selfX: this.enemy.x,
      selfY: this.enemy.y,
      playerX: this.player.x,
      playerY: this.player.y,
      playerVx: this.player.vx,
      playerVy: this.player.vy,
    });
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
        this.noteShellEnd(shell);
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
        this.noteShellEnd(shell);
        shell.destroy();
        continue;
      }

      const target = shell.owner === 'player' ? this.enemy : this.player;
      if (
        target.alive &&
        Math.hypot(shell.x - target.x, shell.y - target.y) < 22
      ) {
        target.takeHit();
        shell.hitTank = true;
        synth.hitTank();
        vibrate(60);
        this.shake();
        this.particles.hitSparks(shell.x, shell.y, COLORS.hit);
        if (shell.owner === 'enemy') this.playerLog.opponentHitMe();
        if (shell.owner === 'player') this.enemyLog.opponentHitMe();
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

  private noteShellEnd(shell: Shell): void {
    if (shell.hitTank) return;
    if (shell.owner === 'enemy') this.playerLog.opponentMissed();
    if (shell.owner === 'player') this.enemyLog.opponentMissed();
  }

  private shake(): void {
    if (prefersReducedMotion()) return;
    this.cameras.main.shake(120, 0.006);
  }

  private updateIntents(dt: number): void {
    this.updateIntentFor(
      dt,
      this.playerIntents,
      this.player,
      this.enemy,
      this.playerJev,
      this.playerControl === 'jev',
    );
    this.updateIntentFor(
      dt,
      this.enemyIntents,
      this.enemy,
      this.player,
      this.enemyJev,
      this.enemyControl === 'jev',
    );
  }

  private updateIntentFor(
    dt: number,
    intents: IntentVectors,
    self: Tank,
    opp: Tank,
    jev: JevBrain | null,
    active: boolean,
  ): void {
    if (!active || !jev || !self.alive) {
      intents.update(dt, {
        x: self.x,
        y: self.y,
        playerX: opp.x,
        playerY: opp.y,
        coverX: self.x,
        coverY: self.y,
        flankSide: 1,
        probabilities: null,
      });
      return;
    }
    const spot = nearestCoverSpot(self.x, self.y, opp.x, opp.y, COVER_LAYOUT);
    const raw = jev.debug.lastAnswers?.maneuver.probabilities ?? null;
    intents.update(dt, {
      x: self.x,
      y: self.y,
      playerX: opp.x,
      playerY: opp.y,
      coverX: spot.x,
      coverY: spot.y,
      flankSide: jev.flankSide,
      probabilities: raw ? (raw as Record<ManeuverId, number>) : null,
    });
  }

  private drawSticks(): void {
    const g = this.stickGfx;
    g.clear();
    if (!this.touch || this.debug.visible) return;

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

  private controlLabel(c: ControllerId): string {
    if (c === 'human') return 'HUMAN';
    if (c === 'jev') return 'JEV';
    return c.toUpperCase();
  }

  private jevLatency(jev: JevBrain | null): string | null {
    if (!jev) return null;
    if (jev.debug.offline) return 'OFFLINE';
    if (jev.debug.latencyMs != null) return `${Math.round(jev.debug.latencyMs)}MS`;
    return '...';
  }

  private updateHud(): void {
    const focusJev = this.playerJev ?? this.enemyJev;
    const intent = focusJev?.debug.lastAnswers?.player_intent.choice ?? '';
    const conf = focusJev?.debug.lastAnswers?.player_intent.confidence ?? 0;

    const parts: string[] = [];
    const pLat = this.jevLatency(this.playerJev);
    const eLat = this.jevLatency(this.enemyJev);
    if (pLat) parts.push(`YOU ${pLat}`);
    if (eLat) parts.push(`ENEMY ${eLat}`);
    if (parts.length === 0) {
      parts.push(
        `${this.controlLabel(this.playerControl)} VS ${this.controlLabel(this.enemyControl)}`,
      );
    }

    const intentLine = focusJev
      ? this.playerJev
        ? `YOU READ ENEMY AS: ${intent.toUpperCase()} ${Math.round(conf * 100)}%`
        : `ENEMY READS YOU AS: ${intent.toUpperCase()} ${Math.round(conf * 100)}%`
      : `${this.controlLabel(this.playerControl)} VS ${this.controlLabel(this.enemyControl)}`;

    drawHud(this.hudGfx, {
      playerHp: this.player.health,
      enemyHp: this.enemy.health,
      intentChoice: intent || 'unclear',
      intentConfidence: conf,
      intentLabel: intentLine,
      latencyLabel: parts.join('  ·  '),
      muted: this.muted,
    });
  }

  private endRound(outcome: 'win' | 'lose' | 'tie'): void {
    if (this.ended) return;
    this.ended = true;
    synth.stopEngines();
    this.time.delayedCall(700, () => {
      this.scene.start('Result', {
        outcome,
        playerControl: this.playerControl,
        enemyControl: this.enemyControl,
        playerPrompt: this.playerPrompt,
        enemyPrompt: this.enemyPrompt,
      });
    });
  }
}
