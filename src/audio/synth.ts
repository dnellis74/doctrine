/** Analog-style Web Audio synth — all sounds generated live, no sample files. */

type EngineSide = 'player' | 'enemy';

interface EngineVoice {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode | null;
  started: boolean;
}

interface OneShotSlot {
  nodes: AudioNode[];
  endsAt: number;
}

const MAX_ONESHOTS = 12;

const MANEUVER_HZ: Record<string, number> = {
  advance: 420,
  retreat: 300,
  take_cover: 260,
  flank: 540,
  hold: 220,
};

class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted = false;
  private unlocked = false;
  private oneshots: OneShotSlot[] = [];
  private engines: Partial<Record<EngineSide, EngineVoice>> = {};
  private enginesRunning = false;

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMasterGain();
  }

  unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    this.unlocked = true;
    this.applyMasterGain();
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (!this.unlocked || this.muted) return;
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  /** Start continuous engine drones (call when Arena begins). */
  startEngines(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    this.stopEngines();
    this.engines.player = this.makeEngine(ctx, 78, false);
    this.engines.enemy = this.makeEngine(ctx, 52, true); // ~fifth lower
    this.enginesRunning = true;
    this.updateEngines(0, 0, 0, 0, 0);
  }

  stopEngines(): void {
    for (const side of Object.keys(this.engines) as EngineSide[]) {
      const v = this.engines[side];
      if (!v) continue;
      try {
        v.oscA.stop();
        v.oscB.stop();
      } catch {
        /* already stopped */
      }
      try {
        v.oscA.disconnect();
        v.oscB.disconnect();
        v.filter.disconnect();
        v.gain.disconnect();
        v.pan?.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.engines = {};
    this.enginesRunning = false;
  }

  /**
   * speedNorm 0..1 from |velocity|/maxSpeed
   * throttle -1..1 (player) or 0..1 (enemy)
   * enemyPan -1..1 from screen x
   */
  updateEngines(
    playerSpeed: number,
    playerThrottle: number,
    enemySpeed: number,
    enemyThrottle: number,
    enemyPan: number,
  ): void {
    if (!this.enginesRunning || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.driveEngine(this.engines.player, playerSpeed, playerThrottle, 0, t, 1);
    this.driveEngine(this.engines.enemy, enemySpeed, enemyThrottle, enemyPan, t, 2 / 3);
  }

  uiTap(): void {
    this.blip(880, 0.045, 'triangle', 0.12);
  }

  fire(pan = 0): void {
    const ctx = this.ctx;
    if (!this.canPlay() || !ctx || !this.master) return;

    const now = ctx.currentTime;
    const slot = this.acquireSlot(now + 0.35);
    if (!slot) return;

    // Noise burst + downward lowpass sweep
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = 'lowpass';
    nFilter.frequency.setValueAtTime(2800, now);
    nFilter.frequency.exponentialRampToValueAtTime(180, now + 0.12);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.0001, now);
    nGain.gain.exponentialRampToValueAtTime(0.45, now + 0.008);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, now);
    thump.frequency.exponentialRampToValueAtTime(40, now + 0.15);
    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(0.0001, now);
    tGain.gain.exponentialRampToValueAtTime(0.55, now + 0.01);
    tGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    const panner = this.makePan(ctx, pan);

    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(panner);
    thump.connect(tGain);
    tGain.connect(panner);
    panner.connect(this.master);

    noise.start(now);
    noise.stop(now + 0.16);
    thump.start(now);
    thump.stop(now + 0.17);

    slot.nodes = [noise, nFilter, nGain, thump, tGain, panner];
    this.scheduleCleanup(slot, now + 0.2);
  }

  hitCover(): void {
    const ctx = this.ctx;
    if (!this.canPlay() || !ctx || !this.master) return;
    const now = ctx.currentTime;
    const slot = this.acquireSlot(now + 0.12);
    if (!slot) return;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.35, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

    noise.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    noise.start(now);
    noise.stop(now + 0.08);

    slot.nodes = [noise, bp, g];
    this.scheduleCleanup(slot, now + 0.1);
  }

  hitTank(): void {
    const ctx = this.ctx;
    if (!this.canPlay() || !ctx || !this.master) return;
    const now = ctx.currentTime;
    const slot = this.acquireSlot(now + 0.25);
    if (!slot) return;

    const f0 = 420;
    const ratio = 1.41;
    const nodes: AudioNode[] = [];

    for (const [mult, vol] of [
      [1, 0.22],
      [ratio, 0.18],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f0 * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(vol, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(g);
      g.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.2);
      nodes.push(osc, g);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = 'highpass';
    nFilter.frequency.value = 900;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.0001, now);
    nGain.gain.exponentialRampToValueAtTime(0.28, now + 0.004);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.master);
    noise.start(now);
    noise.stop(now + 0.1);
    nodes.push(noise, nFilter, nGain);

    slot.nodes = nodes;
    this.scheduleCleanup(slot, now + 0.22);
  }

  explode(): void {
    const ctx = this.ctx;
    if (!this.canPlay() || !ctx || !this.master) return;
    const now = ctx.currentTime;
    const slot = this.acquireSlot(now + 1.4);
    if (!slot) return;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, now);
    lp.frequency.exponentialRampToValueAtTime(80, now + 1.1);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.0001, now);
    nGain.gain.exponentialRampToValueAtTime(0.7, now + 0.02);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(90, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 0.9);
    const sGain = ctx.createGain();
    sGain.gain.setValueAtTime(0.0001, now);
    sGain.gain.exponentialRampToValueAtTime(0.65, now + 0.03);
    sGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);

    noise.connect(lp);
    lp.connect(nGain);
    nGain.connect(this.master);
    sub.connect(sGain);
    sGain.connect(this.master);

    noise.start(now);
    noise.stop(now + 1.25);
    sub.start(now);
    sub.stop(now + 1.05);

    slot.nodes = [noise, lp, nGain, sub, sGain];
    this.scheduleCleanup(slot, now + 1.35);
  }

  reloadReady(): void {
    if (!this.canPlay()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    this.noteAt(now, 660, 0.06, 'square', 0.1);
    this.noteAt(now + 0.07, 880, 0.07, 'square', 0.1);
  }

  maneuverChange(id: string): void {
    const ctx = this.ctx;
    if (!this.canPlay() || !ctx || !this.master) return;
    const now = ctx.currentTime;
    const slot = this.acquireSlot(now + 0.25);
    if (!slot) return;

    const hz = MANEUVER_HZ[id] ?? 320;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = hz;
    filter.Q.value = 10;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.2);

    slot.nodes = [osc, filter, g];
    this.scheduleCleanup(slot, now + 0.22);
  }

  win(): void {
    this.arpeggio(true);
  }

  lose(): void {
    this.arpeggio(false);
  }

  tie(): void {
    if (!this.canPlay()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    this.noteAt(now, 330, 0.12, 'triangle', 0.14);
    this.noteAt(now + 0.14, 330, 0.18, 'triangle', 0.12);
  }

  // --- internals ---

  private canPlay(): boolean {
    if (this.muted) return false;
    this.unlock();
    return !!this.ctx && !!this.master && !!this.noiseBuf;
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;
      master.connect(compressor);
      compressor.connect(ctx.destination);

      this.ctx = ctx;
      this.master = master;
      this.noiseBuf = this.buildNoise(ctx);
      this.applyMasterGain();
      return ctx;
    } catch {
      return null;
    }
  }

  private applyMasterGain(): void {
    if (!this.master || !this.ctx) return;
    const target = this.muted ? 0.0001 : 0.55;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(target, t, 0.03);
  }

  private buildNoise(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private makePan(ctx: AudioContext, pan: number): StereoPannerNode | GainNode {
    try {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      return p;
    } catch {
      return ctx.createGain();
    }
  }

  private makeEngine(ctx: AudioContext, baseHz: number, withPan: boolean): EngineVoice {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    const pan = withPan ? (this.makePan(ctx, 0) as StereoPannerNode) : null;

    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = baseHz;
    const oscB = ctx.createOscillator();
    oscB.type = 'sawtooth';
    oscB.frequency.value = baseHz * 1.01;

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    if (pan) {
      gain.connect(pan);
      pan.connect(this.master!);
    } else {
      gain.connect(this.master!);
    }

    oscA.start();
    oscB.start();

    return { oscA, oscB, filter, gain, pan, started: true };
  }

  private driveEngine(
    voice: EngineVoice | undefined,
    speedNorm: number,
    throttle: number,
    pan: number,
    t: number,
    pitchScale: number,
  ): void {
    if (!voice) return;
    const speed = Math.max(0, Math.min(1, speedNorm));
    const thr = Math.abs(throttle);
    const base = (pitchScale === 1 ? 78 : 52) * (1 + thr * 0.35 + speed * 0.2);
    voice.oscA.frequency.setTargetAtTime(base, t, 0.05);
    voice.oscB.frequency.setTargetAtTime(base * 1.012, t, 0.05);

    const cutoff = 180 + speed * 900 + thr * 400;
    voice.filter.frequency.setTargetAtTime(cutoff, t, 0.06);

    const idle = 0.02;
    const level = idle + speed * 0.14 + thr * 0.06;
    voice.gain.gain.setTargetAtTime(Math.max(0.0001, level), t, 0.08);

    if (voice.pan) {
      voice.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.08);
    }
  }

  private blip(
    hz: number,
    dur: number,
    type: OscillatorType,
    vol: number,
  ): void {
    if (!this.canPlay()) return;
    this.noteAt(this.ctx!.currentTime, hz, dur, type, vol);
  }

  private noteAt(
    when: number,
    hz: number,
    dur: number,
    type: OscillatorType,
    vol: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const slot = this.acquireSlot(when + dur + 0.05);
    if (!slot) return;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(when);
    osc.stop(when + dur + 0.02);
    slot.nodes = [osc, g];
    this.scheduleCleanup(slot, when + dur + 0.05);
  }

  private arpeggio(rising: boolean): void {
    if (!this.canPlay()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const notes = rising
      ? [220, 277, 330, 440, 554]
      : [440, 330, 277, 220, 165];

    const slot = this.acquireSlot(now + 1.2);
    if (!slot) return;
    const nodes: AudioNode[] = [];

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(rising ? 600 : 1800, now);
    filter.frequency.exponentialRampToValueAtTime(rising ? 2400 : 200, now + 0.9);
    filter.connect(this.master!);
    nodes.push(filter);

    notes.forEach((hz, i) => {
      const t0 = now + i * 0.09;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.connect(g);
      g.connect(filter);
      osc.start(t0);
      osc.stop(t0 + 0.32);
      nodes.push(osc, g);
    });

    slot.nodes = nodes;
    this.scheduleCleanup(slot, now + 1.15);
  }

  private acquireSlot(endsAt: number): OneShotSlot | null {
    const now = this.ctx?.currentTime ?? 0;
    this.oneshots = this.oneshots.filter((s) => s.endsAt > now - 0.05);
    if (this.oneshots.length >= MAX_ONESHOTS) {
      // Steal oldest
      const old = this.oneshots.shift();
      if (old) this.killSlot(old);
    }
    const slot: OneShotSlot = { nodes: [], endsAt };
    this.oneshots.push(slot);
    return slot;
  }

  private scheduleCleanup(slot: OneShotSlot, when: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const delayMs = Math.max(0, (when - ctx.currentTime) * 1000) + 30;
    window.setTimeout(() => {
      this.killSlot(slot);
      this.oneshots = this.oneshots.filter((s) => s !== slot);
    }, delayMs);
  }

  private killSlot(slot: OneShotSlot): void {
    for (const n of slot.nodes) {
      try {
        if ('stop' in n && typeof (n as OscillatorNode).stop === 'function') {
          try {
            (n as OscillatorNode).stop();
          } catch {
            /* ignore */
          }
        }
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    slot.nodes = [];
  }
}

export const synth = new Synth();
