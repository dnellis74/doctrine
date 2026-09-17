import Phaser from 'phaser';
import { COLORS, DOCTRINES } from '../game/constants';
import { synth } from '../audio/synth';
import { drawText } from '../render/font';
import { enableGlowBlend, glowRect } from '../render/vector';

/**
 * Explains symbolic state (what Jev sees) and the three enemy machines.
 * Body copy is DOM — stroke font lacks punctuation for a real guide.
 */
export class Guide extends Phaser.Scene {
  private panel: HTMLDivElement | null = null;

  constructor() {
    super('Guide');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.void);

    const g = this.add.graphics();
    enableGlowBlend(g);
    glowRect(g, 40, 24, width - 80, height - 48, COLORS.grid, 0.5);

    drawText(g, 'STATE GUIDE', width / 2, height * 0.06, {
      size: 4.5,
      color: COLORS.text,
      align: 'center',
    });

    drawText(g, 'BACK', width / 2, height * 0.92, {
      size: 2.8,
      color: COLORS.player,
      align: 'center',
    });

    this.panel = this.buildPanel();
    const host = (this.game.canvas.parentElement ?? document.body) as HTMLElement;
    host.appendChild(this.panel);
    this.syncPanel();

    const back = () => {
      synth.unlock();
      synth.uiTap();
      this.teardown();
      this.scene.start('Title');
    };

    this.add
      .zone(width / 2, height * 0.92 + 10, 200, 40)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', back);

    this.input.keyboard?.on('keydown-ESC', back);
    this.input.keyboard?.on('keydown-BACKSPACE', back);

    window.addEventListener('resize', this.onResize);
    this.events.once('shutdown', () => this.teardown());
    this.events.once('destroy', () => this.teardown());
  }

  private onResize = (): void => this.syncPanel();

  private teardown(): void {
    window.removeEventListener('resize', this.onResize);
    this.input.keyboard?.off('keydown-ESC');
    this.input.keyboard?.off('keydown-BACKSPACE');
    this.panel?.remove();
    this.panel = null;
  }

  private syncPanel(): void {
    if (!this.panel) return;
    const host = this.game.canvas.parentElement ?? document.body;
    const canvas =
      host.querySelector('canvas') ??
      document.querySelector('#game-container canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / this.scale.width;
    const sy = rect.height / this.scale.height;
    const padX = 64 * sx;
    const top = rect.top + this.scale.height * 0.12 * sy;
    const bottom = rect.top + this.scale.height * 0.86 * sy;
    this.panel.style.left = `${rect.left + padX}px`;
    this.panel.style.top = `${top}px`;
    this.panel.style.width = `${rect.width - padX * 2}px`;
    this.panel.style.height = `${Math.max(80, bottom - top)}px`;
  }

  private buildPanel(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'doctrine-guide';
    Object.assign(el.style, {
      position: 'fixed',
      zIndex: '280',
      overflow: 'auto',
      boxSizing: 'border-box',
      padding: '8px 12px 16px',
      color: '#D9F2E6',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '13px',
      lineHeight: '1.45',
      WebkitUserSelect: 'text',
      userSelect: 'text',
      touchAction: 'pan-y',
      overscrollBehavior: 'contain',
    });

    const enemyList = DOCTRINES.map(
      (d) =>
        `<li><strong style="color:#6FE3FF">${esc(d.label)}</strong> — ${esc(d.text)}</li>`,
    ).join('');

    el.innerHTML = `
<style>
  #doctrine-guide h2 { color: #FFB347; font-size: 14px; letter-spacing: 0.08em; margin: 18px 0 8px; font-weight: 600; }
  #doctrine-guide h2:first-child { margin-top: 4px; }
  #doctrine-guide p, #doctrine-guide li { margin: 0 0 8px; color: #D9F2E6; }
  #doctrine-guide ul { margin: 0 0 8px; padding-left: 1.2em; }
  #doctrine-guide code { color: #6FE3FF; font-size: 12px; }
  #doctrine-guide .muted { color: #3E8C84; }
  #doctrine-guide strong { color: #FFB347; font-weight: 600; }
  #doctrine-guide table { width: 100%; border-collapse: collapse; margin: 0 0 12px; font-size: 12px; }
  #doctrine-guide th, #doctrine-guide td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #0E2A2E; vertical-align: top; }
  #doctrine-guide th { color: #3E8C84; font-weight: 600; letter-spacing: 0.06em; }
  #doctrine-guide td:first-child { color: #6FE3FF; white-space: nowrap; width: 7.5em; }
</style>

<h2>WHAT JEV CHOOSES</h2>
<p>Each decision tick, Jev answers three typed questions. Your prompt (<code>doctrine</code>) steers <strong>maneuver</strong> and <strong>aggression</strong>. Code aims and fires — Jev never picks those.</p>

<h2>MANEUVER</h2>
<p class="muted">Moves the tank. This is the main thing your prompt should talk about.</p>
<table>
  <tr><th>Choice</th><th>Meaning</th></tr>
  <tr><td><code>advance</code></td><td>Close distance on the opponent</td></tr>
  <tr><td><code>retreat</code></td><td>Move away (not “go to a cover spot”)</td></tr>
  <tr><td><code>take_cover</code></td><td>Move to <code>self.nearest_cover</code></td></tr>
  <tr><td><code>flank</code></td><td>Circle sideways around the opponent</td></tr>
  <tr><td><code>hold</code></td><td>Stay put</td></tr>
</table>

<h2>AGGRESSION</h2>
<p class="muted">Score 0–2. Scales how hard the tank presses (speed / pressure).</p>
<table>
  <tr><th>Score</th><th>Label</th></tr>
  <tr><td><code>0</code></td><td>Avoid combat</td></tr>
  <tr><td><code>1</code></td><td>Trade shots cautiously</td></tr>
  <tr><td><code>2</code></td><td>Press the attack</td></tr>
</table>

<h2>OPPONENT INTENT</h2>
<p class="muted">Read from recent actions. Shown on the HUD; does not steer the tank directly.</p>
<table>
  <tr><th>Choice</th><th>Meaning</th></tr>
  <tr><td><code>rushing</code></td><td>Closing distance aggressively</td></tr>
  <tr><td><code>camping</code></td><td>Waiting in cover</td></tr>
  <tr><td><code>fleeing</code></td><td>Breaking contact</td></tr>
  <tr><td><code>unclear</code></td><td>No clear pattern yet</td></tr>
</table>

<h2>ROLES</h2>
<p>Each side: <strong>Human</strong>, a local preset, or <strong>Jev</strong> (with its own prompt). Two Jevs can face off.</p>
<p><strong>Human YOU</strong> — WASD, mouse aim, click fire. <strong>Human ENEMY</strong> — arrows, auto-aim, Enter fire.</p>

<h2>WHAT JEV SEES</h2>
<p class="muted">Symbolic words only — no raw coordinates. <code>self</code> is the Jev tank; <code>player</code> is the opponent.</p>
<ul>
  <li><code>self</code> — <code>health</code> (low / half / high), <code>reloading</code>, <code>in_cover</code>, <code>nearest_cover</code></li>
  <li><code>player</code> — <code>direction</code>, <code>distance</code> (close / medium / far), <code>health</code>, <code>in_cover</code>, <code>reloading</code>, <code>moving</code></li>
  <li><code>line_of_sight</code>, <code>recent_player_actions</code>, <code>doctrine</code></li>
</ul>

<h2>LOCAL PRESETS</h2>
<ul>${enemyList}</ul>
`;

    return el;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
