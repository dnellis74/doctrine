import type { SymbolicState } from '../game/describe';
import type { EnemyBrainDebug } from '../game/enemyBrain';

export interface DecisionRecord {
  at: number;
  state: SymbolicState;
  answers: unknown;
  latencyMs: number | null;
  model: string | null;
  offline: boolean;
}

const MAX_DECISIONS = 50;
const TOKEN_COST_PER_MILLION = 0.042;

/**
 * DOM debug overlay — browser-first (backtick), phone still has three-finger tap.
 */
export class DebugOverlay {
  visible = false;
  private root: HTMLDivElement;
  private host: HTMLElement;
  private pre: HTMLPreElement;
  private confLabel: HTMLSpanElement;
  private sampleBtn: HTMLButtonElement;
  private decisions: DecisionRecord[] = [];
  private totalInputTokens = 0;
  private lastState: SymbolicState | null = null;
  private brain: EnemyBrainDebug | null = null;
  private onToggleCbs: Array<(v: boolean) => void> = [];

  constructor(parent: HTMLElement) {
    this.host = parent;
    this.root = document.createElement('div');
    this.root.id = 'doctrine-debug';
    Object.assign(this.root.style, {
      display: 'none',
      position: 'absolute',
      left: '8px',
      top: '8px',
      right: '8px',
      bottom: '8px',
      zIndex: '1000',
      background: 'rgba(0,0,0,0.88)',
      color: '#D9F2E6',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '11px',
      lineHeight: '1.35',
      overflow: 'auto',
      padding: '10px',
      boxSizing: 'border-box',
      border: '1px solid #3E8C84',
      pointerEvents: 'auto',
      touchAction: 'manipulation',
    } as CSSStyleDeclaration);

    const toolbar = document.createElement('div');
    Object.assign(toolbar.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      alignItems: 'center',
      marginBottom: '8px',
    } as CSSStyleDeclaration);

    const title = document.createElement('strong');
    title.textContent = 'DEBUG';
    title.style.color = '#6FE3FF';
    toolbar.appendChild(title);

    const confWrap = document.createElement('span');
    const minus = mkBtn('−', () => this.nudgeConfidence(-0.05));
    const plus = mkBtn('+', () => this.nudgeConfidence(0.05));
    this.confLabel = document.createElement('span');
    this.confLabel.textContent = 'conf 0.40';
    confWrap.append(minus, this.confLabel, plus);
    toolbar.appendChild(confWrap);

    this.sampleBtn = mkBtn('sample', () => this.toggleSample());
    toolbar.appendChild(this.sampleBtn);

    toolbar.appendChild(
      mkBtn('copy 50', () => {
        void this.copyDecisions();
      }),
    );
    toolbar.appendChild(
      mkBtn('close', () => {
        this.setVisible(false);
      }),
    );

    this.pre = document.createElement('pre');
    Object.assign(this.pre.style, {
      margin: '0',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    } as CSSStyleDeclaration);

    this.root.append(toolbar, this.pre);
    parent.style.position = parent.style.position || 'relative';
    parent.appendChild(this.root);

    window.addEventListener('keydown', this.onKey);
    parent.addEventListener('touchstart', this.onTouchStart, { passive: true });
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    this.host.removeEventListener('touchstart', this.onTouchStart);
    this.root.remove();
  }

  onToggle(cb: (v: boolean) => void): void {
    this.onToggleCbs.push(cb);
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.style.display = v ? 'block' : 'none';
    for (const cb of this.onToggleCbs) cb(v);
    if (v) this.render();
  }

  bindBrain(brain: EnemyBrainDebug): void {
    this.brain = brain;
    this.syncControls();
  }

  setState(state: SymbolicState): void {
    this.lastState = state;
    if (this.visible) this.render();
  }

  recordDecision(rec: DecisionRecord): void {
    this.decisions.push(rec);
    if (this.decisions.length > MAX_DECISIONS) this.decisions.shift();
    if (this.visible) this.render();
  }

  addUsage(inputTokens: number): void {
    this.totalInputTokens += inputTokens;
  }

  private nudgeConfidence(delta: number): void {
    if (!this.brain) return;
    this.brain.confidenceThreshold = Math.min(
      0.95,
      Math.max(0.05, Math.round((this.brain.confidenceThreshold + delta) * 100) / 100),
    );
    this.syncControls();
    this.render();
  }

  private toggleSample(): void {
    if (!this.brain) return;
    this.brain.sampleManeuver = !this.brain.sampleManeuver;
    this.syncControls();
    this.render();
  }

  private syncControls(): void {
    if (!this.brain) return;
    this.confLabel.textContent = `conf ${this.brain.confidenceThreshold.toFixed(2)}`;
    this.sampleBtn.textContent = this.brain.sampleManeuver ? 'sample' : 'argmax';
  }

  private async copyDecisions(): Promise<void> {
    const jsonl = this.decisions.map((d) => JSON.stringify(d)).join('\n');
    try {
      await navigator.clipboard.writeText(jsonl || '(no decisions yet)');
      this.sampleBtn.textContent = 'copied!';
      setTimeout(() => this.syncControls(), 800);
    } catch {
      // Fallback: select text
      this.pre.textContent = jsonl || '(no decisions yet)';
    }
  }

  private render(): void {
    const b = this.brain;
    const spend =
      (this.totalInputTokens * TOKEN_COST_PER_MILLION) / 1_000_000;
    const header = {
      latencyMs: b?.latencyMs ?? null,
      model: b?.model ?? (b?.offline ? 'local' : null),
      requestCount: b?.requestCount ?? 0,
      offline: b?.offline ?? true,
      confidenceThreshold: b?.confidenceThreshold ?? 0.4,
      pick: b?.sampleManeuver ? 'sample' : 'argmax',
      estimatedSpendUsd: Number(spend.toFixed(6)),
      inputTokens: this.totalInputTokens,
    };

    this.pre.textContent = [
      '=== meta ===',
      JSON.stringify(header, null, 2),
      '',
      '=== state ===',
      JSON.stringify(this.lastState, null, 2),
      '',
      '=== answers ===',
      JSON.stringify(b?.lastAnswers ?? null, null, 2),
    ].join('\n');
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === '`' || e.code === 'Backquote') {
      e.preventDefault();
      this.toggle();
    }
  };

  private lastTriple = 0;
  private onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length < 3) return;
    const now = performance.now();
    if (now - this.lastTriple < 400) return;
    this.lastTriple = now;
    this.toggle();
  };
}

function mkBtn(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  Object.assign(btn.style, {
    background: '#0E2A2E',
    color: '#D9F2E6',
    border: '1px solid #3E8C84',
    padding: '6px 10px',
    fontFamily: 'inherit',
    fontSize: '12px',
    cursor: 'pointer',
  } as CSSStyleDeclaration);
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    onClick();
  });
  return btn;
}
