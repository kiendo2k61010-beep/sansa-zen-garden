// All sound is synthesized locally. No recording, external audio or unlicensed chants.
export class TempleAudio {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  muted = true;
  volume = 0.45;
  channels: Record<string, boolean> = { wind: true, birds: true, bell: true, wood: false, music: false };
  private wind: GainNode | null = null;
  private drone: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  async start() {
    if (!this.context) {
      this.context = new AudioContext();
      const ctx = this.context;
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(ctx.destination);
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02;
        data[i] = last * 3.5;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.wind = ctx.createGain();
      noise.connect(filter);
      filter.connect(this.wind);
      this.wind.connect(this.master);
      noise.start();
      this.sources.push(noise);
      this.drone = ctx.createGain();
      this.drone.connect(this.master);
      for (const f of [130.81, 196, 261.62, 329.63]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.028;
        osc.type = 'sine';
        osc.frequency.value = f;
        osc.connect(g);
        g.connect(this.drone);
        osc.start();
        this.sources.push(osc);
      }
      this.timers.push(
        setInterval(() => {
          if (this.channels.birds && !this.muted) this.bird();
        }, 4200),
        setInterval(() => {
          if (this.channels.bell && !this.muted) this.bell();
        }, 26000),
        setInterval(() => {
          if (this.channels.wood && !this.muted) this.wood();
        }, 2600),
      );
    }
    await this.context.resume();
    this.muted = false;
    this.apply();
  }
  apply() {
    if (!this.context || !this.master) return;
    const t = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.2);
    this.wind?.gain.setTargetAtTime(this.channels.wind ? 0.22 : 0, t, 0.4);
    this.drone?.gain.setTargetAtTime(this.channels.music ? 1 : 0, t, 0.8);
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    if (!muted) void this.start();
    else this.apply();
  }
  setVolume(v: number) {
    this.volume = v;
    this.apply();
  }
  toggle(channel: string) {
    this.channels[channel] = !this.channels[channel];
    this.apply();
    if (this.channels[channel] && !this.muted) {
      if (channel === 'bell') this.bell();
      if (channel === 'birds') this.bird();
      if (channel === 'wood') this.wood();
    }
  }
  private tone(
    f: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    delay = 0,
    endFreq?: number,
  ) {
    if (!this.context || !this.master || this.muted) return;
    const ctx = this.context,
      t = ctx.currentTime + delay,
      osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.1);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  bell(volume = 1) {
    const level = Math.max(0, Math.min(volume, 1));
    if (!level) return;
    [196, 392, 530, 785, 1046].forEach((f, i) => this.tone(f, 5.8 - i * 0.55, (0.16 * level) / (i + 1)));
  }
  wood() {
    this.tone(620, 0.11, 0.1, 'sine', 0, 330);
    this.tone(920, 0.06, 0.04);
  }
  bead() {
    this.tone(780, 0.08, 0.08, 'sine', 0, 390);
  }
  complete() {
    [392, 493.88, 587.33, 783.99].forEach((f, i) => this.tone(f, 2, 0.08, 'sine', i * 0.16));
  }
  bird() {
    for (let i = 0; i < 3; i++) this.tone(1900 + Math.random() * 350, 0.15, 0.026, 'sine', i * 0.19, 2900);
  }
  dispose() {
    this.timers.forEach(clearInterval);
    this.sources.forEach((s) => {
      s.stop();
      s.disconnect();
    });
    void this.context?.close();
    this.context = null;
  }
}
