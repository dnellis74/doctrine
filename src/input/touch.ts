export interface StickState {
  active: boolean;
  originX: number;
  originY: number;
  x: number;
  y: number;
  /** -1..1 */
  nx: number;
  /** -1..1 */
  ny: number;
  magnitude: number;
  pointerId: number | null;
}

const DEADZONE = 0.18;
const MAX_RADIUS = 56;

function emptyStick(): StickState {
  return {
    active: false,
    originX: 0,
    originY: 0,
    x: 0,
    y: 0,
    nx: 0,
    ny: 0,
    magnitude: 0,
    pointerId: null,
  };
}

export class TwinStickInput {
  static readonly DEADZONE = DEADZONE;
  static readonly MAX_RADIUS = MAX_RADIUS;

  readonly move: StickState = emptyStick();
  readonly aim: StickState = emptyStick();
  private fireReleased = false;
  private aimWasPastDeadzone = false;
  private el: HTMLElement;
  private bound = false;

  private onStart = (e: PointerEvent) => this.handleStart(e);
  private onMove = (e: PointerEvent) => this.handleMove(e);
  private onEnd = (e: PointerEvent) => this.handleEnd(e);

  constructor(el: HTMLElement) {
    this.el = el;
  }

  attach(): void {
    if (this.bound) return;
    this.bound = true;
    this.el.addEventListener('pointerdown', this.onStart, { passive: false });
    this.el.addEventListener('pointermove', this.onMove, { passive: false });
    this.el.addEventListener('pointerup', this.onEnd, { passive: false });
    this.el.addEventListener('pointercancel', this.onEnd, { passive: false });
  }

  detach(): void {
    if (!this.bound) return;
    this.bound = false;
    this.el.removeEventListener('pointerdown', this.onStart);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onEnd);
    this.el.removeEventListener('pointercancel', this.onEnd);
    this.reset();
  }

  reset(): void {
    Object.assign(this.move, emptyStick());
    Object.assign(this.aim, emptyStick());
    this.fireReleased = false;
    this.aimWasPastDeadzone = false;
  }

  /** True once when aim stick released past deadzone. */
  consumeFire(): boolean {
    if (!this.fireReleased) return false;
    this.fireReleased = false;
    return true;
  }

  private sideFor(clientX: number): 'left' | 'right' {
    const rect = this.el.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2 ? 'left' : 'right';
  }

  private handleStart(e: PointerEvent): void {
    // Desktop mouse uses WASD + mouse aim; sticks are for touch/pen
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    const side = this.sideFor(e.clientX);
    const stick = side === 'left' ? this.move : this.aim;
    if (stick.active) return;
    stick.active = true;
    stick.pointerId = e.pointerId;
    stick.originX = e.clientX;
    stick.originY = e.clientY;
    stick.x = e.clientX;
    stick.y = e.clientY;
    this.updateNorm(stick);
    if (side === 'right') this.aimWasPastDeadzone = stick.magnitude > DEADZONE;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  private handleMove(e: PointerEvent): void {
    const stick = this.stickForId(e.pointerId);
    if (!stick) return;
    e.preventDefault();
    stick.x = e.clientX;
    stick.y = e.clientY;
    this.updateNorm(stick);
    if (stick === this.aim && stick.magnitude > DEADZONE) {
      this.aimWasPastDeadzone = true;
    }
  }

  private handleEnd(e: PointerEvent): void {
    const stick = this.stickForId(e.pointerId);
    if (!stick) return;
    e.preventDefault();
    if (stick === this.aim && this.aimWasPastDeadzone) {
      this.fireReleased = true;
    }
    Object.assign(stick, emptyStick());
    if (stick === this.aim) this.aimWasPastDeadzone = false;
  }

  private stickForId(id: number): StickState | null {
    if (this.move.pointerId === id) return this.move;
    if (this.aim.pointerId === id) return this.aim;
    return null;
  }

  private updateNorm(stick: StickState): void {
    const dx = stick.x - stick.originX;
    const dy = stick.y - stick.originY;
    const mag = Math.hypot(dx, dy);
    const clamped = Math.min(mag, MAX_RADIUS);
    const scale = mag > 0 ? clamped / mag : 0;
    const cx = dx * scale;
    const cy = dy * scale;
    stick.nx = cx / MAX_RADIUS;
    stick.ny = cy / MAX_RADIUS;
    stick.magnitude = Math.hypot(stick.nx, stick.ny);
  }
}
