/**
 * Synthesised sound design for LUMEN, built on the Web Audio API.
 * No audio files: every sound is generated, so nothing large is downloaded.
 *
 *   click()    crisp metallic toggle: transient noise + two metal partials + low thunk
 *   ignite()   electrical crackle and a rising buzz that settles into the hum
 *   shutdown() a falling tone as the hum drains away
 *   hum        one persistent voice (100/200/300 Hz mains hum), ramped up and down,
 *              never re-created, so repeated clicks can't stack instances
 *
 * Signal chain: voices -> master gain (volume / mute) -> compressor (no clipping) -> out.
 * The context is created lazily on the first user gesture (autoplay policy).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humGain: GainNode | null = null;
  private humFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.7;
  private muted = false;
  private humLevel = 0; // 0..1 target, scaled by brightness

  /** Must be called from a user gesture before the first sound. */
  async unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 8;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      master.connect(comp).connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.noiseBuffer = this.makeNoise(ctx);
      this.buildHum();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  get ready() {
    return !!this.ctx && this.ctx.state === "running";
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.rampMaster();
  }

  setVolume(v: number) {
    this.volume = Math.min(Math.max(v, 0), 1);
    this.rampMaster();
  }

  /** Keep the hum's loudness and brightness of tone tied to the lamp's brightness. */
  setHumBrightness(b: number) {
    this.brightness = b;
    this.applyHum(0, 0.15);
  }

  private brightness = 0.8;

  private applyHum(delay: number, timeConstant: number) {
    if (!this.ctx || !this.humGain) return;
    const at = this.ctx.currentTime + delay;
    // Kept well under the clicks: a faint presence, not a buzz (~-36 dB RMS when lit).
    const target = this.humLevel * (0.35 + 0.65 * this.brightness) * 0.018;
    this.humGain.gain.setTargetAtTime(target, at, timeConstant);
    this.humFilter?.frequency.setTargetAtTime(380 + this.brightness * 520, at, 0.2);
  }

  click(strength = 1) {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || !this.noiseBuffer) return;
    const t = ctx.currentTime + 0.005;

    // Transient: a very short burst of band-passed noise (the contact snapping).
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3800;
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.55 * strength, t + 0.0015);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    noise.connect(bp).connect(ng).connect(out);
    noise.start(t, Math.random() * 0.5);
    noise.stop(t + 0.05);

    // Metallic body: two inharmonic partials that ring very briefly.
    [2350, 4120].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? "triangle" : "sine";
      o.frequency.setValueAtTime(f, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime((i === 0 ? 0.12 : 0.06) * strength, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (i === 0 ? 0.06 : 0.035));
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.08);
    });

    // Low thunk: the lever hitting its stop through the plate.
    const thunk = ctx.createOscillator();
    thunk.type = "sine";
    thunk.frequency.setValueAtTime(190, t);
    thunk.frequency.exponentialRampToValueAtTime(70, t + 0.05);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(0.35 * strength, t + 0.003);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    thunk.connect(tg).connect(out);
    thunk.start(t);
    thunk.stop(t + 0.09);
  }

  ignite() {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || !this.noiseBuffer) return;
    const t = ctx.currentTime + 0.01;

    // Crackle: a handful of tiny, irregular sparks.
    for (let i = 0; i < 6; i++) {
      const at = t + i * (0.012 + Math.random() * 0.025);
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2400 + Math.random() * 2500;
      const g = ctx.createGain();
      const peak = 0.08 + Math.random() * 0.1;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.012 + Math.random() * 0.01);
      s.connect(hp).connect(g).connect(out);
      s.start(at, Math.random());
      s.stop(at + 0.04);
    }

    // Rising buzz: the element energising, then handing over to the steady hum.
    const buzz = ctx.createOscillator();
    buzz.type = "sawtooth";
    buzz.frequency.setValueAtTime(60, t);
    buzz.frequency.exponentialRampToValueAtTime(100, t + 0.35);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + 0.2);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.7);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.09, t + 0.18);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    buzz.connect(lp).connect(bg).connect(out);
    buzz.start(t);
    buzz.stop(t + 1);

    // The steady hum fades in underneath as the ignition buzz decays.
    this.humLevel = 1;
    this.applyHum(0.25, 0.35);
  }

  shutdown() {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out) return;
    const t = ctx.currentTime + 0.01;

    // A short falling tone as the element de-energises.
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.55);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(lp).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.65);

    this.humLevel = 0;
    if (this.humGain) this.humGain.gain.setTargetAtTime(0, t, 0.25);
  }

  /**
   * Glass shattering: a sharp crack, a burst of bright noise that darkens as it
   * decays, then a cascade of tiny glass "tinkles" as the shards scatter.
   * If the bulb was lit, an electrical zap and the hum dies instantly.
   */
  shatter(wasLit: boolean) {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || !this.noiseBuffer) return;
    const t = ctx.currentTime + 0.005;

    // The crack: a hard broadband transient with a low thump underneath.
    const crack = ctx.createBufferSource();
    crack.buffer = this.noiseBuffer;
    const crackHp = ctx.createBiquadFilter();
    crackHp.type = "highpass";
    crackHp.frequency.value = 900;
    const crackG = ctx.createGain();
    crackG.gain.setValueAtTime(0.0001, t);
    crackG.gain.exponentialRampToValueAtTime(0.9, t + 0.002);
    crackG.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    crack.connect(crackHp).connect(crackG).connect(out);
    crack.start(t, Math.random() * 0.5);
    crack.stop(t + 0.12);

    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(140, t);
    thump.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const thumpG = ctx.createGain();
    thumpG.gain.setValueAtTime(0.0001, t);
    thumpG.gain.exponentialRampToValueAtTime(0.45, t + 0.004);
    thumpG.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    thump.connect(thumpG).connect(out);
    thump.start(t);
    thump.stop(t + 0.18);

    // The shatter body: bright glassy noise sweeping down as it scatters.
    const body = ctx.createBufferSource();
    body.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(7000, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.45);
    const bodyG = ctx.createGain();
    bodyG.gain.setValueAtTime(0.0001, t);
    bodyG.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    bodyG.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    body.connect(bp).connect(bodyG).connect(out);
    body.start(t, Math.random() * 0.3);
    body.stop(t + 0.6);

    // Tinkles: many tiny, high, inharmonic pings over the next second.
    for (let i = 0; i < 34; i++) {
      const at = t + 0.02 + Math.pow(Math.random(), 1.6) * 1.1;
      const o = ctx.createOscillator();
      o.type = Math.random() < 0.5 ? "sine" : "triangle";
      const f = 2600 + Math.random() * 6200;
      o.frequency.setValueAtTime(f, at);
      o.frequency.exponentialRampToValueAtTime(f * (0.97 + Math.random() * 0.02), at + 0.08);
      const g = ctx.createGain();
      const peak = (0.025 + Math.random() * 0.06) * (1 - (at - t) * 0.5);
      const len = 0.03 + Math.random() * 0.12;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.002), at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + len + 0.02);
    }

    if (wasLit) {
      // A short electrical zap as the filament snaps.
      const zap = ctx.createOscillator();
      zap.type = "sawtooth";
      zap.frequency.setValueAtTime(220, t);
      zap.frequency.exponentialRampToValueAtTime(55, t + 0.18);
      const zapLp = ctx.createBiquadFilter();
      zapLp.type = "lowpass";
      zapLp.frequency.value = 1800;
      const zapG = ctx.createGain();
      zapG.gain.setValueAtTime(0.0001, t);
      zapG.gain.exponentialRampToValueAtTime(0.14, t + 0.006);
      zapG.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      zap.connect(zapLp).connect(zapG).connect(out);
      zap.start(t);
      zap.stop(t + 0.22);
    }

    // No filament, no hum: it stops almost at once.
    this.humLevel = 0;
    if (this.humGain) this.humGain.gain.setTargetAtTime(0, t, 0.03);
  }

  /** A new bulb being screwed in: small ratchet clicks, then a firm seat. */
  screwIn(duration = 1.1) {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || !this.noiseBuffer) return;
    const t = ctx.currentTime + 0.01;
    const clicks = 9;
    for (let i = 0; i < clicks; i++) {
      // Clicks bunch up as the thread tightens.
      const at = t + duration * (1 - Math.pow(1 - i / clicks, 1.6)) * 0.9;
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800 + i * 90;
      bp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.16, at + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.018);
      s.connect(bp).connect(g).connect(out);
      s.start(at, Math.random());
      s.stop(at + 0.03);
    }
    // The bulb seats home.
    const seatAt = t + duration;
    const ctxNow = this.ctx;
    if (ctxNow) {
      window.setTimeout(() => this.click(0.75), Math.max(0, (seatAt - ctxNow.currentTime) * 1000));
    }
  }

  dispose() {
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.humGain = null;
  }

  // ---------------------------------------------------------------------------

  private rampMaster() {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  private makeNoise(ctx: AudioContext) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** One continuous hum voice, silent until ramped up. */
  private buildHum() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.connect(gain).connect(this.master);

    const partials: [number, number, OscillatorType][] = [
      [100, 1, "sine"],
      [200, 0.45, "sine"],
      [300, 0.18, "triangle"],
    ];
    partials.forEach(([f, level, type]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(filter);
      o.start();
    });

    // A slow wobble in the tone (not the level) so the hum feels alive, while
    // silence stays truly silent when the lamp is off.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    this.humGain = gain;
    this.humFilter = filter;
  }
}
