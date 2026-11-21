// Original background music, synthesised live with the Web Audio API.
// A chunky, upbeat shuffle in A: a trotting bass, clip-clop woodblocks,
// clavinet-style stabs, a bright pentatonic lead and chiptune drums.
// No audio files involved.

const BPM = 120;
const STEP = 60 / BPM / 4; // one sixteenth note in seconds
const SWING = 0.3; // shuffle: off-sixteenths land late, which gives the trot

const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Two sections of 8 bars, chords change every 2 bars. MIDI numbers.
const SECTION_A = [
  { bass: 33, chord: [57, 61, 64, 67] }, // A7
  { bass: 38, chord: [62, 66, 69, 72] }, // D7
  { bass: 33, chord: [57, 61, 64, 67] }, // A7
  { bass: 40, chord: [64, 68, 71, 74] }, // E7
];
const SECTION_B = [
  { bass: 30, chord: [54, 57, 61, 64] }, // F#m7
  { bass: 38, chord: [62, 66, 69, 74] }, // D add9
  { bass: 40, chord: [64, 68, 71, 74] }, // E7
  { bass: 33, chord: [57, 61, 64, 69] }, // A
];

// Trotting bass over two bars (32 sixteenths): semitone offsets from the
// chord's bass note, null = rest. Short notes, lots of root and octave.
const BASS = [
  0, null, null, 0, 7, null, 0, null, 12, null, 10, null, 0, null, 7, null,
  0, null, null, 0, 7, null, 0, null, 12, null, 10, 12, null, 10, 7, 5,
];
// Clip-clop woodblocks: 1 = high block, 2 = low block.
const CLOP = [0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2, 0];
// Clavinet stabs over one bar: 1 = short chank, 2 = held stab.
const STABS = [0, 1, 0, 1, 0, 0, 2, 0, 0, 1, 0, 1, 0, 0, 2, 1];
// Drums over one bar.
const KICK = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const GHOST = [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const HAT = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 0];

// Lead: A major pentatonic, rising cheerful phrases. [step, midi, length].
const LEAD_A = [
  [0, 69, 2], [2, 71, 2], [4, 73, 2], [6, 76, 4], [12, 73, 2], [14, 76, 2],
  [16, 78, 6], [24, 76, 2], [26, 73, 2], [28, 71, 4],
  [32, 74, 2], [34, 76, 2], [36, 78, 2], [38, 81, 4], [44, 78, 2], [46, 76, 2],
  [48, 74, 6], [56, 76, 2], [58, 78, 2], [60, 74, 4],
  [64, 69, 2], [66, 73, 2], [68, 76, 2], [70, 81, 4], [76, 78, 2], [78, 76, 2],
  [80, 73, 6], [88, 76, 2], [90, 78, 2], [92, 81, 4],
  [96, 83, 2], [98, 81, 2], [100, 78, 2], [102, 76, 4], [108, 78, 2], [110, 80, 2],
  [112, 81, 8], [122, 78, 2], [124, 76, 2], [126, 73, 2],
];
const LEAD_B = [
  [0, 81, 2], [2, 83, 2], [4, 85, 4], [10, 83, 2], [12, 81, 4],
  [16, 78, 2], [18, 81, 2], [20, 85, 6], [28, 83, 2], [30, 81, 2],
  [32, 78, 4], [36, 81, 2], [38, 83, 2], [40, 86, 6], [48, 85, 2], [50, 83, 2],
  [52, 81, 4], [58, 78, 2], [60, 76, 2], [62, 78, 2],
  [64, 80, 2], [66, 83, 2], [68, 88, 4], [74, 86, 2], [76, 83, 4],
  [80, 81, 2], [82, 83, 2], [84, 85, 6], [92, 83, 2], [94, 81, 2],
  [96, 85, 2], [98, 88, 2], [100, 90, 4], [106, 88, 2], [108, 85, 2], [110, 83, 2],
  [112, 81, 8], [122, 83, 2], [124, 85, 2], [126, 88, 2],
];

export class Music {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.playing = false;
    this.muted = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.intensity = 1;
    this.paused = false;
    this.custom = null; // an <audio> element playing a track the player supplied
  }

  // Play a track from a URL the player chose instead of the built-in loop.
  useTrack(url) {
    const el = new Audio(url);
    el.loop = true;
    el.volume = 0.5;
    el.preload = 'auto';
    // If the track cannot be fetched, fall back to the built-in loop.
    el.addEventListener('error', () => {
      if (this.custom !== el) return;
      this.custom = null;
      if (this.playing && this.ctx && !this.paused) {
        this.step = 0;
        this.nextTime = this.ctx.currentTime + 0.1;
        this.timer = setInterval(() => this.schedule(), 40);
      }
    });
    this.custom = el;
  }

  // Must be called from a user gesture the first time.
  start() {
    if (this.playing) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.playing = true;
    if (this.custom) {
      this.custom.muted = this.muted;
      if (!this.paused) this.custom.play().catch(() => {});
      return;
    }
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    if (!this.paused) this.timer = setInterval(() => this.schedule(), 40);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    if (this.custom) this.custom.muted = this.muted;
    return this.muted;
  }

  // Lower the band a little during screens that need concentration.
  setIntensity(v) {
    this.intensity = v;
  }

  // Pause the band (sound effects still play). Resumes where it left off.
  setPaused(p) {
    if (this.paused === p) return;
    this.paused = p;
    if (this.custom && this.playing) {
      if (p) this.custom.pause();
      else this.custom.play().catch(() => {});
    }
    if (!this.ctx || this.custom) return;
    if (p) {
      clearInterval(this.timer);
      this.timer = null;
    } else if (this.playing) {
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 40);
    }
  }

  // Falling or rising slide used by the production chart.
  slide(up, dur = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(up ? 220 : 880, t);
    o.frequency.exponentialRampToValueAtTime(up ? 880 : 220, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.03);
    g.gain.setValueAtTime(0.25, t + dur - 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Short blip for a winning land bid.
  ding() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.2, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.3);
      o.connect(g);
      g.connect(this.master);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 0.35);
    });
  }

  // One short, bright tick: a unit just changed hands on the trading floor.
  ping() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(1760, t);
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.18);
  }

  schedule() {
    const ahead = this.ctx.currentTime + 0.2;
    while (this.nextTime < ahead) {
      this.playStep(this.step, this.nextTime + (this.step % 2 ? STEP * SWING : 0));
      this.step = (this.step + 1) % 256;
      this.nextTime += STEP;
    }
  }

  playStep(step, t) {
    const section = step < 128 ? SECTION_A : SECTION_B;
    const local = step % 128;
    const chord = section[Math.floor(local / 32)];
    const bar16 = step % 16;
    const two = step % 32;
    const quiet = this.intensity < 1;
    const lastBar = local >= 112;

    if (KICK[bar16]) this.kick(t);
    if (SNARE[bar16]) this.snare(t, 1);
    if (GHOST[bar16] && !quiet) this.snare(t, 0.3);
    if (HAT[bar16]) this.hat(t, HAT[bar16] === 2 ? 0.16 : 0.045, quiet ? 0.5 : 1);
    if (CLOP[bar16]) this.block(t, CLOP[bar16] === 1 ? 1760 : 1175, quiet ? 0.5 : 1);
    if (lastBar && bar16 >= 12) this.snare(t, 0.5); // little fill into the next section

    const b = BASS[two];
    if (b !== null) this.bass(hz(chord.bass + b), t, STEP * 0.9);

    const st = STABS[bar16];
    if (st && !quiet) this.stab(chord.chord, t, st === 2 ? STEP * 1.6 : STEP * 0.5);

    const lead = step < 128 ? LEAD_A : LEAD_B;
    lead.forEach(([s, n, len]) => {
      if (s === local) this.lead(hz(n), t, len * STEP * 0.8);
    });
  }

  env(gainNode, t, attack, decay, peak, sustain, dur, release) {
    const g = gainNode.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.linearRampToValueAtTime(sustain, t + attack + decay);
    g.setValueAtTime(sustain, t + dur);
    g.linearRampToValueAtTime(0, t + dur + release);
  }

  kick(t) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
  }

  noise(t, dur, filterType, freq, vol) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  snare(t, vol) {
    this.noise(t, 0.16, 'bandpass', 2000, 0.5 * vol);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(230, t);
    o.frequency.exponentialRampToValueAtTime(130, t + 0.07);
    g.gain.setValueAtTime(0.4 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.15);
  }

  hat(t, dur, vol) {
    this.noise(t, dur, 'highpass', 7500, 0.2 * vol);
  }

  // Woodblock: a short, pitched knock. Two of them alternating is the trot.
  block(t, freq, vol) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.7, t + 0.05);
    g.gain.setValueAtTime(0.35 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.09);
  }

  bass(freq, t, dur) {
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o2.type = 'square';
    o.frequency.value = freq;
    o2.frequency.value = freq;
    o2.detune.value = -1200;
    f.type = 'lowpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(2200, t);
    f.frequency.exponentialRampToValueAtTime(260, t + 0.14);
    this.env(g, t, 0.004, 0.08, 0.75, 0.4, dur, 0.05);
    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.master);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.1);
    o2.stop(t + dur + 0.1);
  }

  // Clavinet-ish: thin, bright, very short.
  stab(notes, t, dur) {
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.12);
    this.env(g, t, 0.003, 0.05, 0.2, 0.08, dur, 0.04);
    notes.forEach((n, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = hz(n);
      o.detune.value = (i - 1.5) * 5;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.1);
    });
    f.connect(g);
    g.connect(this.master);
  }

  lead(freq, t, dur) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const v = this.ctx.createOscillator();
    const vg = this.ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    v.frequency.value = 6;
    vg.gain.value = 5;
    v.connect(vg);
    vg.connect(o.detune);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3400;
    const peak = this.intensity < 1 ? 0.07 : 0.12;
    this.env(g, t, 0.008, 0.05, peak, peak * 0.75, dur, 0.07);
    o.connect(f);
    f.connect(g);
    g.connect(this.master);
    o.start(t);
    v.start(t);
    o.stop(t + dur + 0.1);
    v.stop(t + dur + 0.1);
  }
}
