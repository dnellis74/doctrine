import Phaser from 'phaser';
import {
  COLORS,
  DEFAULT_JEV_PROMPT,
  DOCTRINES,
  PROMPT_MAX_LEN,
  WORLD_H,
  WORLD_W,
  clampPrompt,
  loadDoctrineId,
  loadMute,
  loadPrompt,
  saveDoctrineId,
  saveMute,
  savePrompt,
  type DoctrineId,
} from '../game/constants';
import { synth } from '../audio/synth';
import { drawText } from '../render/font';
import { enableGlowBlend, glowRect } from '../render/vector';
import { PromptBox } from '../ui/promptBox';

const PROMPT_RECT = {
  x: WORLD_W * 0.14,
  y: WORLD_H * 0.52,
  w: WORLD_W * 0.72,
  h: WORLD_H * 0.24,
} as const;

export class Title extends Phaser.Scene {
  private selected: DoctrineId = loadDoctrineId();
  private muted = loadMute();
  private gfx!: Phaser.GameObjects.Graphics;
  private promptBox: PromptBox | null = null;

  constructor() {
    super('Title');
  }

  create(): void {
    this.selected = loadDoctrineId();
    this.muted = loadMute();
    synth.setMuted(this.muted);
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(COLORS.void);
    this.gfx = this.add.graphics();
    enableGlowBlend(this.gfx);

    const host = (this.game.canvas.parentElement ?? document.body) as HTMLElement;
    this.promptBox = new PromptBox(host, {
      x: PROMPT_RECT.x,
      y: PROMPT_RECT.y,
      w: PROMPT_RECT.w,
      h: PROMPT_RECT.h,
      maxLength: PROMPT_MAX_LEN,
    });
    this.promptBox.value = loadPrompt(this.selected);
    this.promptBox.show();

    this.redraw();

    DOCTRINES.forEach((d, i) => {
      const y = height * 0.26 + i * 36;
      const zone = this.add
        .zone(width / 2, y + 8, 420, 32)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        this.blurPrompt();
        synth.unlock();
        this.selected = d.id;
        saveDoctrineId(d.id);
        synth.uiTap();
        this.redraw();
      });
    });

    this.add
      .zone(90, height * 0.94, 140, 36)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.blurPrompt();
        this.toggleMute();
      });

    this.add
      .zone(width * 0.78, height * 0.46 + 6, 120, 28)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.resetPrompt());

    const startZone = this.add
      .zone(width / 2, height * 0.84 + 10, 480, 44)
      .setInteractive({ useHandCursor: true });

    const go = () => {
      this.blurPrompt();
      synth.unlock();
      synth.uiTap();
      const prompt = clampPrompt(this.promptBox?.value ?? loadPrompt(this.selected));
      saveDoctrineId(this.selected);
      savePrompt(prompt);
      this.teardownPrompt();
      this.scene.start('Arena', {
        doctrineId: this.selected,
        doctrinePrompt: prompt,
      });
    };

    startZone.on('pointerdown', go);
    this.input.keyboard?.on('keydown-SPACE', () => {
      // Don't steal Space while typing in the prompt
      if (this.promptBox?.isFocused()) return;
      go();
    });
    this.input.keyboard?.on('keydown-ONE', () => this.pickEnemy('cautious'));
    this.input.keyboard?.on('keydown-TWO', () => this.pickEnemy('berserker'));
    this.input.keyboard?.on('keydown-THREE', () => this.pickEnemy('ambusher'));
    this.input.keyboard?.on('keydown-M', () => {
      if (this.promptBox?.isFocused()) return;
      this.toggleMute();
    });
    this.input.keyboard?.on('keydown-R', () => {
      if (this.promptBox?.isFocused()) return;
      this.resetPrompt();
    });

    this.events.once('shutdown', () => this.teardownPrompt());
    this.events.once('destroy', () => this.teardownPrompt());
  }

  private teardownPrompt(): void {
    if (!this.promptBox) return;
    savePrompt(this.promptBox.value);
    this.promptBox.destroy();
    this.promptBox = null;
  }

  private blurPrompt(): void {
    this.promptBox?.blur();
  }

  private redraw(): void {
    const g = this.gfx;
    const { width, height } = this.scale;
    g.clear();

    glowRect(g, 40, 24, width - 80, height - 48, COLORS.grid, 0.5);

    drawText(g, 'DOCTRINE', width / 2, height * 0.08, {
      size: 6,
      color: COLORS.text,
      align: 'center',
    });
    drawText(g, 'PICK ENEMY (LOCAL STATE MACHINE)', width / 2, height * 0.18, {
      size: 2.0,
      color: COLORS.enemy,
      align: 'center',
    });

    DOCTRINES.forEach((d, i) => {
      const y = height * 0.26 + i * 36;
      const on = this.selected === d.id;
      drawText(g, d.label.toUpperCase(), width / 2, y, {
        size: 2.8,
        color: on ? COLORS.player : COLORS.text,
        align: 'center',
        alpha: on ? 1 : 0.75,
      });
    });

    drawText(g, 'YOUR JEV PROMPT (YOU)', width / 2 - 40, height * 0.46, {
      size: 2.0,
      color: COLORS.player,
      align: 'center',
    });
    drawText(g, 'RESET', width * 0.78, height * 0.46, {
      size: 2.0,
      color: COLORS.hit,
      align: 'center',
    });

    glowRect(
      g,
      PROMPT_RECT.x - 4,
      PROMPT_RECT.y - 4,
      PROMPT_RECT.w + 8,
      PROMPT_RECT.h + 8,
      COLORS.cover,
      0.55,
    );

    drawText(g, 'CLICK OR SPACE TO START', width / 2, height * 0.84, {
      size: 2.8,
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
      'WATCH THE DUEL  ·  ` DEBUG  ·  M MUTE  ·  R RESET',
      width / 2 + 40,
      height * 0.94,
      { size: 1.5, color: COLORS.cover, align: 'center' },
    );
  }

  private resetPrompt(): void {
    this.blurPrompt();
    synth.unlock();
    if (this.promptBox) this.promptBox.value = DEFAULT_JEV_PROMPT;
    savePrompt(DEFAULT_JEV_PROMPT);
    synth.uiTap();
  }

  private toggleMute(): void {
    synth.unlock();
    this.muted = !this.muted;
    synth.setMuted(this.muted);
    saveMute(this.muted);
    if (!this.muted) synth.uiTap();
    this.redraw();
  }

  private pickEnemy(id: DoctrineId): void {
    if (this.promptBox?.isFocused()) return;
    this.blurPrompt();
    synth.unlock();
    this.selected = id;
    saveDoctrineId(id);
    synth.uiTap();
    this.redraw();
  }
}
