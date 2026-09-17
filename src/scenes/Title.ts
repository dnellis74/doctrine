import Phaser from 'phaser';
import {
  COLORS,
  DOCTRINES,
  doctrineById,
  loadBrainMode,
  loadDoctrineId,
  loadMute,
  saveBrainMode,
  saveDoctrineId,
  saveMute,
  type BrainMode,
  type DoctrineId,
} from '../game/constants';
import { synth } from '../audio/synth';
import { drawText, drawTextWrapped } from '../render/font';
import { enableGlowBlend, glowRect } from '../render/vector';

export class Title extends Phaser.Scene {
  private selected: DoctrineId = loadDoctrineId();
  private brain: BrainMode = loadBrainMode();
  private muted = loadMute();
  private gfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Title');
  }

  create(): void {
    this.selected = loadDoctrineId();
    this.brain = loadBrainMode();
    this.muted = loadMute();
    synth.setMuted(this.muted);
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(COLORS.void);
    this.gfx = this.add.graphics();
    enableGlowBlend(this.gfx);
    this.redraw();

    // Hit zones
    DOCTRINES.forEach((d, i) => {
      const y = height * 0.32 + i * 44;
      const zone = this.add
        .zone(width / 2, y + 10, 420, 36)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        synth.unlock();
        this.selected = d.id;
        saveDoctrineId(d.id);
        synth.uiTap();
        this.redraw();
      });
    });

    (['local', 'jev'] as const).forEach((mode, i) => {
      const x = width / 2 + (i === 0 ? -100 : 100);
      const zone = this.add
        .zone(x, height * 0.56 + 10, 140, 40)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        synth.unlock();
        this.brain = mode;
        saveBrainMode(mode);
        synth.uiTap();
        this.redraw();
      });
    });

    this.add
      .zone(90, height * 0.94, 140, 36)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.toggleMute());

    const startZone = this.add
      .zone(width / 2, height * 0.86 + 10, 480, 44)
      .setInteractive({ useHandCursor: true });

    const go = () => {
      synth.unlock();
      synth.uiTap();
      saveDoctrineId(this.selected);
      saveBrainMode(this.brain);
      this.scene.start('Arena', {
        doctrineId: this.selected,
        brain: this.brain,
      });
    };

    startZone.on('pointerdown', go);
    this.input.keyboard?.once('keydown-SPACE', go);
    this.input.keyboard?.on('keydown-ONE', () => this.pickDoctrine('cautious'));
    this.input.keyboard?.on('keydown-TWO', () => this.pickDoctrine('berserker'));
    this.input.keyboard?.on('keydown-THREE', () => this.pickDoctrine('ambusher'));
    this.input.keyboard?.on('keydown-L', () => this.pickBrain('local'));
    this.input.keyboard?.on('keydown-J', () => this.pickBrain('jev'));
    this.input.keyboard?.on('keydown-M', () => this.toggleMute());
  }

  private redraw(): void {
    const g = this.gfx;
    const { width, height } = this.scale;
    g.clear();

    // Subtle frame
    glowRect(g, 40, 24, width - 80, height - 48, COLORS.grid, 0.5);

    drawText(g, 'DOCTRINE', width / 2, height * 0.12, {
      size: 7,
      color: COLORS.text,
      align: 'center',
    });
    drawText(g, 'PICK ENEMY DOCTRINE', width / 2, height * 0.24, {
      size: 2.2,
      color: COLORS.enemy,
      align: 'center',
    });

    DOCTRINES.forEach((d, i) => {
      const y = height * 0.32 + i * 44;
      const on = this.selected === d.id;
      drawText(g, d.label.toUpperCase(), width / 2, y, {
        size: 3,
        color: on ? COLORS.player : COLORS.text,
        align: 'center',
        alpha: on ? 1 : 0.75,
      });
    });

    drawText(g, 'BRAIN', width / 2, height * 0.5, {
      size: 2.2,
      color: COLORS.enemy,
      align: 'center',
    });

    drawText(g, 'LOCAL', width / 2 - 100, height * 0.56, {
      size: 3.2,
      color: this.brain === 'local' ? COLORS.player : COLORS.text,
      align: 'center',
    });
    drawText(g, 'JEV', width / 2 + 100, height * 0.56, {
      size: 3.2,
      color: this.brain === 'jev' ? COLORS.player : COLORS.text,
      align: 'center',
    });

    const doc = doctrineById(this.selected);
    drawTextWrapped(g, doc.text, width / 2, height * 0.64, width * 0.72, {
      size: 1.55,
      color: COLORS.cover,
      align: 'center',
    });

    const brainBlurb =
      this.brain === 'jev'
        ? 'ENEMY TACTICS FROM TYPESAFE JEV'
        : 'ENEMY TACTICS FROM LOCAL RULE BRAIN';
    drawText(g, brainBlurb, width / 2, height * 0.76, {
      size: 1.7,
      color: this.brain === 'jev' ? COLORS.enemy : COLORS.cover,
      align: 'center',
    });

    drawText(g, 'CLICK OR SPACE TO START', width / 2, height * 0.86, {
      size: 3,
      color: COLORS.player,
      align: 'center',
    });

    drawText(g, this.muted ? 'MUTED' : 'SOUND', 90, height * 0.94, {
      size: 1.8,
      color: this.muted ? COLORS.hit : COLORS.cover,
      align: 'center',
    });

    drawText(
      g,
      'WASD  MOUSE AIM  CLICK FIRE  ` DEBUG  M MUTE',
      width / 2 + 40,
      height * 0.94,
      { size: 1.6, color: COLORS.cover, align: 'center' },
    );
  }

  private toggleMute(): void {
    synth.unlock();
    this.muted = !this.muted;
    synth.setMuted(this.muted);
    saveMute(this.muted);
    if (!this.muted) synth.uiTap();
    this.redraw();
  }

  private pickDoctrine(id: DoctrineId): void {
    synth.unlock();
    this.selected = id;
    saveDoctrineId(id);
    synth.uiTap();
    this.redraw();
  }

  private pickBrain(mode: BrainMode): void {
    synth.unlock();
    this.brain = mode;
    saveBrainMode(mode);
    synth.uiTap();
    this.redraw();
  }
}
