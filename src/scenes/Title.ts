import Phaser from 'phaser';
import {
  COLORS,
  CONTROLLER_OPTIONS,
  DEFAULT_JEV_PROMPT,
  PROMPT_MAX_LEN,
  clampPrompt,
  loadEnemyControl,
  loadEnemyPrompt,
  loadMute,
  loadPlayerControl,
  loadPlayerPrompt,
  saveEnemyControl,
  saveEnemyPrompt,
  saveMute,
  savePlayerControl,
  savePlayerPrompt,
  type ControllerId,
  isControllerId,
} from '../game/constants';
import { synth } from '../audio/synth';
import { drawText } from '../render/font';
import { enableGlowBlend, glowRect } from '../render/vector';
import { PromptBox } from '../ui/promptBox';
import { DomSelect } from '../ui/domSelect';

const SELECT_OPTS = CONTROLLER_OPTIONS.map((o) => ({
  value: o.id,
  label: o.label.toUpperCase(),
}));

export class Title extends Phaser.Scene {
  private playerControl: ControllerId = loadPlayerControl();
  private enemyControl: ControllerId = loadEnemyControl();
  private muted = loadMute();
  private gfx!: Phaser.GameObjects.Graphics;
  private playerSelect: DomSelect | null = null;
  private enemySelect: DomSelect | null = null;
  private playerPrompt: PromptBox | null = null;
  private enemyPrompt: PromptBox | null = null;

  constructor() {
    super('Title');
  }

  create(): void {
    this.playerControl = loadPlayerControl();
    this.enemyControl = loadEnemyControl();
    this.muted = loadMute();
    synth.setMuted(this.muted);
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(COLORS.void);
    this.gfx = this.add.graphics();
    enableGlowBlend(this.gfx);

    const host = (this.game.canvas.parentElement ?? document.body) as HTMLElement;

    this.playerSelect = new DomSelect(host, {
      x: width * 0.08,
      y: height * 0.28,
      w: width * 0.36,
      h: 36,
      options: SELECT_OPTS,
      value: this.playerControl,
      accent: COLORS.player,
      ariaLabel: 'You controller',
    });
    this.playerSelect.onChange((v) => {
      if (!isControllerId(v)) return;
      this.playerControl = v;
      savePlayerControl(v);
      synth.unlock();
      synth.uiTap();
      this.syncPrompts();
      this.redraw();
    });
    this.playerSelect.show();

    this.enemySelect = new DomSelect(host, {
      x: width * 0.56,
      y: height * 0.28,
      w: width * 0.36,
      h: 36,
      options: SELECT_OPTS,
      value: this.enemyControl,
      accent: COLORS.enemy,
      ariaLabel: 'Enemy controller',
    });
    this.enemySelect.onChange((v) => {
      if (!isControllerId(v)) return;
      this.enemyControl = v;
      saveEnemyControl(v);
      synth.unlock();
      synth.uiTap();
      this.syncPrompts();
      this.redraw();
    });
    this.enemySelect.show();

    this.playerPrompt = new PromptBox(host, {
      id: 'doctrine-prompt-player',
      x: 0,
      y: 0,
      w: 100,
      h: 80,
      maxLength: PROMPT_MAX_LEN,
      accent: COLORS.player,
      ariaLabel: 'Your Jev prompt',
    });
    this.playerPrompt.value = loadPlayerPrompt();

    this.enemyPrompt = new PromptBox(host, {
      id: 'doctrine-prompt-enemy',
      x: 0,
      y: 0,
      w: 100,
      h: 80,
      maxLength: PROMPT_MAX_LEN,
      accent: COLORS.enemy,
      ariaLabel: 'Enemy Jev prompt',
    });
    this.enemyPrompt.value = loadEnemyPrompt();

    this.syncPrompts();
    this.redraw();

    this.add
      .zone(90, height * 0.94, 140, 36)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.blurPrompts();
        this.toggleMute();
      });

    this.add
      .zone(width * 0.42, height * 0.38 + 6, 100, 28)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.resetSidePrompt('player'));

    this.add
      .zone(width * 0.9, height * 0.38 + 6, 100, 28)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.resetSidePrompt('enemy'));

    this.add
      .zone(width * 0.78, height * 0.38 + 6, 100, 28)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (this.playerControl === 'jev' && this.enemyControl !== 'jev') {
          this.resetSidePrompt('player');
        } else if (this.enemyControl === 'jev' && this.playerControl !== 'jev') {
          this.resetSidePrompt('enemy');
        }
      });

    this.add
      .zone(width - 110, height * 0.94, 180, 36)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.openGuide());

    const startZone = this.add
      .zone(width / 2, height * 0.84 + 10, 480, 44)
      .setInteractive({ useHandCursor: true });

    const go = () => {
      if (this.anyPromptFocused()) return;
      this.blurPrompts();
      synth.unlock();
      synth.uiTap();
      this.persistAll();
      const data = this.buildArenaData();
      this.teardownDom();
      this.scene.start('Arena', data);
    };

    startZone.on('pointerdown', go);
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.anyPromptFocused()) return;
      go();
    });
    this.input.keyboard?.on('keydown-M', () => {
      if (this.anyPromptFocused()) return;
      this.toggleMute();
    });
    this.input.keyboard?.on('keydown-G', () => {
      if (this.anyPromptFocused()) return;
      this.openGuide();
    });

    this.events.once('shutdown', () => this.teardownDom());
    this.events.once('destroy', () => this.teardownDom());
  }

  private buildArenaData() {
    return {
      playerControl: this.playerControl,
      enemyControl: this.enemyControl,
      playerPrompt: clampPrompt(this.playerPrompt?.value ?? loadPlayerPrompt()),
      enemyPrompt: clampPrompt(this.enemyPrompt?.value ?? loadEnemyPrompt()),
    };
  }

  private persistAll(): void {
    savePlayerControl(this.playerControl);
    saveEnemyControl(this.enemyControl);
    if (this.playerPrompt) savePlayerPrompt(this.playerPrompt.value);
    if (this.enemyPrompt) saveEnemyPrompt(this.enemyPrompt.value);
  }

  private syncPrompts(): void {
    const { width, height } = this.scale;
    const youJev = this.playerControl === 'jev';
    const enemyJev = this.enemyControl === 'jev';
    const top = height * 0.44;
    const boxH = height * 0.28;

    if (youJev && enemyJev) {
      this.playerPrompt?.setRect(width * 0.06, top, width * 0.4, boxH);
      this.enemyPrompt?.setRect(width * 0.54, top, width * 0.4, boxH);
      this.playerPrompt?.show();
      this.enemyPrompt?.show();
    } else if (youJev) {
      this.playerPrompt?.setRect(width * 0.14, top, width * 0.72, boxH);
      this.playerPrompt?.show();
      this.enemyPrompt?.hide();
    } else if (enemyJev) {
      this.enemyPrompt?.setRect(width * 0.14, top, width * 0.72, boxH);
      this.enemyPrompt?.show();
      this.playerPrompt?.hide();
    } else {
      this.playerPrompt?.hide();
      this.enemyPrompt?.hide();
    }
  }

  private teardownDom(): void {
    this.persistAll();
    this.playerSelect?.destroy();
    this.enemySelect?.destroy();
    this.playerPrompt?.destroy();
    this.enemyPrompt?.destroy();
    this.playerSelect = null;
    this.enemySelect = null;
    this.playerPrompt = null;
    this.enemyPrompt = null;
  }

  private blurPrompts(): void {
    this.playerPrompt?.blur();
    this.enemyPrompt?.blur();
  }

  private anyPromptFocused(): boolean {
    return !!(this.playerPrompt?.isFocused() || this.enemyPrompt?.isFocused());
  }

  private redraw(): void {
    const g = this.gfx;
    const { width, height } = this.scale;
    g.clear();

    glowRect(g, 40, 24, width - 80, height - 48, COLORS.grid, 0.5);

    drawText(g, 'DOCTRINE', width / 2, height * 0.07, {
      size: 5.5,
      color: COLORS.text,
      align: 'center',
    });

    drawText(g, 'YOU', width * 0.26, height * 0.2, {
      size: 2.6,
      color: COLORS.player,
      align: 'center',
    });
    drawText(g, 'ENEMY', width * 0.74, height * 0.2, {
      size: 2.6,
      color: COLORS.enemy,
      align: 'center',
    });

    const youJev = this.playerControl === 'jev';
    const enemyJev = this.enemyControl === 'jev';

    if (youJev) {
      drawText(g, 'JEV PROMPT', width * (enemyJev ? 0.26 : 0.5), height * 0.38, {
        size: 1.8,
        color: COLORS.player,
        align: 'center',
      });
      drawText(g, 'RESET', width * (enemyJev ? 0.42 : 0.78), height * 0.38, {
        size: 1.8,
        color: COLORS.hit,
        align: 'center',
      });
      const rx = enemyJev ? width * 0.06 : width * 0.14;
      const rw = enemyJev ? width * 0.4 : width * 0.72;
      glowRect(g, rx - 4, height * 0.44 - 4, rw + 8, height * 0.28 + 8, COLORS.player, 0.45);
    }

    if (enemyJev) {
      drawText(g, 'JEV PROMPT', width * (youJev ? 0.74 : 0.5), height * 0.38, {
        size: 1.8,
        color: COLORS.enemy,
        align: 'center',
      });
      drawText(g, 'RESET', width * (youJev ? 0.9 : 0.78), height * 0.38, {
        size: 1.8,
        color: COLORS.hit,
        align: 'center',
      });
      const rx = youJev ? width * 0.54 : width * 0.14;
      const rw = youJev ? width * 0.4 : width * 0.72;
      glowRect(g, rx - 4, height * 0.44 - 4, rw + 8, height * 0.28 + 8, COLORS.enemy, 0.45);
    }

    if (!youJev && !enemyJev) {
      drawText(g, 'NO JEV PROMPTS — LOCAL OR HUMAN ONLY', width / 2, height * 0.55, {
        size: 1.8,
        color: COLORS.cover,
        align: 'center',
      });
    }

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

    drawText(g, 'STATE GUIDE', width - 110, height * 0.94, {
      size: 1.8,
      color: COLORS.enemy,
      align: 'center',
    });

    drawText(g, 'G GUIDE  ·  M MUTE', width / 2, height * 0.94, {
      size: 1.4,
      color: COLORS.cover,
      align: 'center',
    });
  }

  private resetSidePrompt(side: 'player' | 'enemy'): void {
    this.blurPrompts();
    synth.unlock();
    if (side === 'player') {
      if (this.playerControl !== 'jev') return;
      if (this.playerPrompt) this.playerPrompt.value = DEFAULT_JEV_PROMPT;
      savePlayerPrompt(DEFAULT_JEV_PROMPT);
    } else {
      if (this.enemyControl !== 'jev') return;
      if (this.enemyPrompt) this.enemyPrompt.value = DEFAULT_JEV_PROMPT;
      saveEnemyPrompt(DEFAULT_JEV_PROMPT);
    }
    synth.uiTap();
  }

  private openGuide(): void {
    this.blurPrompts();
    synth.unlock();
    synth.uiTap();
    this.persistAll();
    this.teardownDom();
    this.scene.start('Guide');
  }

  private toggleMute(): void {
    synth.unlock();
    this.muted = !this.muted;
    synth.setMuted(this.muted);
    saveMute(this.muted);
    if (!this.muted) synth.uiTap();
    this.redraw();
  }
}
