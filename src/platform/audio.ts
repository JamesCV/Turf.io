/**
 * Tiny synthesized sound kit (no audio files). iOS requires the context to be
 * resumed from a user gesture; call unlock() from the first tap.
 */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;
  private last: Record<string, number> = {};

  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private throttle(key: string, gap: number): boolean {
    const now = performance.now();
    if (now - (this.last[key] ?? 0) < gap) return false;
    this.last[key] = now;
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.enabled) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  /** Bright arpeggio; bigger captures climb higher. */
  capture(size01: number): void {
    if (!this.throttle('cap', 60)) return;
    const base = 520 + size01 * 260;
    const steps = size01 > 0.5 ? [1, 1.25, 1.5, 2] : [1, 1.25, 1.5];
    steps.forEach((m, i) => this.tone(base * m, 0.18, 'triangle', 0.16, i * 0.045));
  }

  kill(): void {
    this.tone(180, 0.18, 'square', 0.12, 0, 60);
    this.tone(880, 0.12, 'triangle', 0.14, 0.03, 1320);
    this.tone(1320, 0.18, 'triangle', 0.1, 0.09);
  }

  death(): void {
    this.tone(440, 0.5, 'sawtooth', 0.12, 0, 90);
    this.tone(220, 0.6, 'triangle', 0.14, 0.05, 55);
  }

  ability(): void {
    this.tone(300, 0.22, 'sine', 0.18, 0, 900);
  }

  click(): void {
    if (!this.throttle('click', 40)) return;
    this.tone(660, 0.06, 'triangle', 0.12);
  }

  coin(): void {
    this.tone(988, 0.08, 'square', 0.07);
    this.tone(1319, 0.2, 'square', 0.07, 0.07);
  }

  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, i * 0.1));
  }
}

export const sfx = new Sfx();
