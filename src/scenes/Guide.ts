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
</style>

<h2>ROLES</h2>
<p>Each side picks a controller: <strong>Human</strong>, a local preset (<strong>Cautious</strong> / <strong>Berserker</strong> / <strong>Ambusher</strong>), or <strong>Jev</strong>.</p>
<p><strong>Human YOU</strong> — WASD drive, mouse aim, click fire. <strong>Human ENEMY</strong> — arrow keys drive, auto-aim, Enter fire.</p>
<p><strong>Jev</strong> — driven by that side's prompt (<code>doctrine</code>). Two Jevs can face off with two prompts.</p>
<p>In the payload, <code>self</code> is the Jev tank being controlled. The field named <code>player</code> is always the opponent.</p>

<h2>WHAT JEV SEES</h2>
<p class="muted">Numbers become words. Jev never gets raw coordinates or timers.</p>
<p>In the payload, <code>self</code> is <strong>your</strong> tank. The field named <code>player</code> is the <strong>enemy</strong> (the opponent).</p>

<h2>SELF (YOU)</h2>
<ul>
  <li><code>health</code> — <code>low</code> (1 HP), <code>half</code> (2), <code>high</code> (3–4)</li>
  <li><code>reloading</code> — cannon cooling down</li>
  <li><code>in_cover</code> — no line of sight to the enemy (blocked by geometry)</li>
  <li><code>nearest_cover</code> — compass + distance band toward a safer spot (e.g. <code>north-west, medium</code>)</li>
</ul>

<h2>PLAYER FIELD (ENEMY)</h2>
<ul>
  <li><code>direction</code> — 8-way compass from you to them</li>
  <li><code>distance</code> — <code>close</code> / <code>medium</code> / <code>far</code></li>
  <li><code>health</code> — same bands as you</li>
  <li><code>in_cover</code> — they have no LoS to you (same geometry test)</li>
  <li><code>reloading</code></li>
  <li><code>moving</code> — <code>toward me</code>, <code>away from me</code>, <code>still</code>, or <code>sideways</code></li>
</ul>

<h2>SHARED</h2>
<ul>
  <li><code>line_of_sight</code> — clear shot between tanks</li>
  <li><code>recent_player_actions</code> — last few enemy verbs (moved toward me, fired, hit me, entered cover, …)</li>
  <li><code>doctrine</code> — your prompt text</li>
</ul>

<h2>JEV ANSWERS</h2>
<p>Jev picks a <strong>maneuver</strong> (code then aims and fires):</p>
<ul>
  <li><code>advance</code> — close distance</li>
  <li><code>retreat</code> — open space away</li>
  <li><code>take_cover</code> — move to nearest cover</li>
  <li><code>flank</code> — circle sideways</li>
  <li><code>hold</code> — stay put</li>
</ul>
<p>Also scores <strong>aggression</strong> (avoid / trade / press) and reads enemy <strong>intent</strong> (rushing / camping / fleeing / unclear) for the HUD.</p>

<h2>ENEMY MACHINES</h2>
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
