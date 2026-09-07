export class SoundBus {
  private active = false;
  private context?: AudioContext;
  private machine?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private musicFilter?: BiquadFilterNode;
  private scoreSource?: MediaElementAudioSourceNode;
  private duckUntil = 0;
  private quietFoleyUntil = 0;
  private featureActive = false;
  beginFeature(){this.featureActive=true;}
  private duckScale = 1;
  private voices = new Set<AudioScheduledSourceNode>();
  private stopVoices() {
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.voices.clear();
  }
  private musicVolume = 0.2;
  private effectVolume = 0.85;
  get levels() {
    return { music: this.musicVolume, effects: this.effectVolume };
  }
  setLevels(music: number, effects: number) {
    // A manual level change owns the fader; an older duck/release cannot undo it.
    clearInterval(this.musicFadeTimer);
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.effectVolume = Math.max(0, Math.min(1, effects));
    if (this.machine) this.machine.gain.value = this.effectVolume;
    if (this.score)
      this.score.volume =
        this.musicVolume *
        (performance.now() < this.duckUntil ? this.duckScale : 1);
  }
  private prepare() {
    if (this.context) return;
    this.context = new AudioContext();
    this.machine = this.context.createGain();
    this.machine.gain.value = this.effectVolume;
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -9;
    this.compressor.knee.value = 8;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.18;
    this.machine.connect(this.compressor);
    const output = this.context.createGain();
    output.gain.value = 0.8;
    this.compressor.connect(output);
    output.connect(this.context.destination);
    this.musicFilter = this.context.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.Q.value = 0.55;
    this.musicFilter.frequency.value = this.night ? 3400 : 10000;
    this.musicFilter.connect(this.compressor);
  }
  private night = false;
  private get scorePath() {
    return "/audio/frontier-theme-matched-v1.mp3";
  }
  setNight(value: boolean) {
    if (value === this.night) return;
    this.night = value;
    if (this.musicFilter && this.context) {
      const frequency = this.musicFilter.frequency,
        t = this.context.currentTime;
      frequency.cancelScheduledValues(t);
      frequency.setTargetAtTime(value ? 3400 : 10000, t, 0.7);
    }
  }
  private score?: HTMLAudioElement;
  private restoreMusicTimer?: ReturnType<typeof setTimeout>;
  private musicFadeTimer?: ReturnType<typeof setInterval>;
  get enabled() {
    return this.active;
  }
  set enabled(value: boolean) {
    this.active = value;
    clearTimeout(this.restoreMusicTimer);
    clearInterval(this.musicFadeTimer);
    this.duckUntil = 0;
    this.duckScale = 1;
    if (value) {
      this.prepare();
      void this.context!.resume();
      this.score ||= new Audio(this.scorePath);
      if (!this.scoreSource) {
        this.scoreSource = this.context!.createMediaElementSource(this.score);
        this.scoreSource.connect(this.musicFilter!);
      }
      this.score.loop = true;
      this.score.volume = this.musicVolume;
      void this.score.play().catch(() => {});
    } else {
      this.stopVoices();
      this.score?.pause();
      void this.context?.suspend();
    }
  }
  private duckMusic(milliseconds: number, depth = 0.63) {
    if (!this.score) return;
    this.duckScale = Math.min(
      performance.now() < this.duckUntil ? this.duckScale : 1,
      depth,
    );
    this.duckUntil = Math.max(this.duckUntil, performance.now() + milliseconds);
    clearTimeout(this.restoreMusicTimer);
    this.fadeMusic(this.musicVolume * this.duckScale, 80);
    this.restoreMusicTimer = setTimeout(() => {
      this.duckScale = 1;
      this.fadeMusic(this.musicVolume, 650);
    }, this.duckUntil - performance.now());
  }
  private fadeMusic(target: number, milliseconds: number) {
    clearInterval(this.musicFadeTimer);
    if (!this.score) return;
    const startVolume = this.score.volume;
    const startedAt = performance.now();
    this.musicFadeTimer = setInterval(() => {
      const progress = Math.min(
        1,
        (performance.now() - startedAt) / milliseconds,
      );
      if (this.score)
        this.score.volume = startVolume + (target - startVolume) * progress;
      if (progress === 1) clearInterval(this.musicFadeTimer);
    }, 20);
  }
  private tone(
    frequency: number,
    time: number,
    duration: number,
    volume = 0.035,
    type: OscillatorType = "sine",
  ) {
    const c = this.context!,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.value = frequency;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(volume, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    o.connect(g);
    g.connect(this.machine!);
    o.start(time);
    this.voices.add(o);
    o.stop(time + duration + 0.02);
    o.onended = () => {
      this.voices.delete(o);
      o.disconnect();
      g.disconnect();
    };
  }
  private noise(
    time: number,
    duration: number,
    cutoff: number,
    volume: number,
  ) {
    const c = this.context!,
      buffer = c.createBuffer(
        1,
        Math.ceil(c.sampleRate * duration),
        c.sampleRate,
      ),
      data = buffer.getChannelData(0);
    // Decorative noise only; never sampled by the game engine.
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.exp((-i / data.length) * 4);
    const s = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      g = c.createGain();
    s.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    g.gain.value = volume;
    s.connect(filter);
    filter.connect(g);
    g.connect(this.machine!);
    s.start(time);
    this.voices.add(s);
    s.onended = () => {
      this.voices.delete(s);
      s.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }
  private featureVoices = new Set<AudioScheduledSourceNode>();
  stopFeature() {
    this.featureActive=false;
    for (const source of this.featureVoices) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.featureVoices.clear();
  }
  private swell(
    time: number,
    duration: number,
    cutoff: number,
    volume: number,
  ) {
    const c = this.context!,
      source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain();
    const buffer = c.createBuffer(
      1,
      Math.ceil(c.sampleRate * duration),
      c.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let air = 0;
    for (let i = 0; i < data.length; i++) {
      air = 0.96 * air + 0.04 * (Math.random() * 2 - 1);
      data[i] = air * 4;
    }
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.Q.value = 0.65;
    filter.frequency.setValueAtTime(cutoff * 0.55, time);
    filter.frequency.exponentialRampToValueAtTime(
      cutoff,
      time + duration * 0.45,
    );
    filter.frequency.exponentialRampToValueAtTime(
      cutoff * 0.65,
      time + duration,
    );
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + duration * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.machine!);
    this.voices.add(source);
    source.start(time);
    source.stop(time + duration);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
  private pluck(
    frequency: number,
    time: number,
    duration: number,
    volume: number,
  ) {
    const c = this.context!,
      source = c.createBufferSource(),
      gain = c.createGain();
    const buffer = c.createBuffer(
      1,
      Math.ceil(c.sampleRate * duration),
      c.sampleRate,
    );
    const data = buffer.getChannelData(0),
      period = Math.round(c.sampleRate / frequency);
    const string = new Float32Array(period);
    for (let i = 0; i < period; i++) string[i] = Math.random() * 2 - 1;
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const at = i % period,
        next = string[at];
      string[at] = 0.4975 * (next + last);
      last = next;
      const tail = Math.min(1, (data.length - i) / (c.sampleRate * 0.12));
      data[i] = Math.tanh(next * 1.6) * tail;
    }
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.machine!);
    this.voices.add(source);
    source.start(time);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      gain.disconnect();
    };
  }
  feature(kind: "witch" | "awaken", location = 0) {
    this.stopFeature();
    this.beginFeature();
    if (!this.active || document.hidden) return;
    try {
      this.prepare();
      void this.context!.resume();
      this.duckMusic(5400, 0.4);
      const existing = new Set(this.voices),
        t = this.context!.currentTime;
      const strike = (
        root: number,
        at: number,
        volume: number,
        length = 1.2,
      ) => {
        [1, 2.013, 3.91, 6.08].forEach((ratio, i) =>
          this.tone(
            root * ratio,
            at,
            length / (1 + i * 0.5),
            volume / (1 + i * 2),
          ),
        );
      };
      if (kind === "witch") {
        this.swell(t, 5.1, 480, 0.11);
        this.pluck(73.42, t, 3, 0.23);
        this.pluck(110, t + 0.025, 2.5, 0.1);
        [146.83, 174.61, 164.81, 110].forEach((f, i) => {
          const at = t + 0.55 + i * 0.5556;
          this.pluck(f, at, 2, 0.13);
          this.pluck(f, at + 0.24, 1.4, 0.034);
        });
        strike(73.42, t + 3.55, 0.045, 1.5);
      } else if (location === 0) {
        this.swell(t, 4.8, 360, 0.18);
        this.noise(t, 0.65, 250, 0.17);
        [0.3, 1.1, 2.65].forEach((at, i) =>
          this.noise(t + at, 0.22, 900 - i * 190, 0.055),
        );
        this.pluck(73.42, t + 0.1, 3.7, 0.1);
      } else if (location === 1) {
        // A short minor saloon phrase: bass pulse, detuned hammer strings, hanging final chord.
        [0, 0.48, 0.96, 1.44].forEach((at, i) =>
          strike(i % 2 ? 110 : 73.42, t + at, 0.065, 0.8),
        );
        [293.66, 349.23, 329.63, 220, 293.66].forEach((f, i) => {
          const at = t + 0.12 + i * 0.34;
          strike(f, at, 0.075, 1.9);
          this.tone(f * 1.006, at, 1.4, 0.027, "triangle");
          this.noise(at, 0.018, 2800, 0.035);
        });
        [146.83, 174.61, 220].forEach((f) => strike(f, t + 2.4, 0.04, 2.3));
        strike(1260, t + 3.75, 0.045, 0.7);
        this.swell(t + 1, 4, 680, 0.055);
      } else if (location === 2) {
        this.noise(t, 0.16, 2100, 0.2);
        [92, 217, 483].forEach((f) => strike(f, t + 0.03, 0.065, 1.6));
        [0.22, 0.38, 0.63, 0.81].forEach((at, i) => {
          this.noise(t + at, 0.09, 4300, 0.065);
          strike(720 + i * 91, t + at, 0.045, 0.35);
        });
        this.swell(t + 0.4, 4.3, 260, 0.12);
      } else if (location === 3) {
        this.swell(t, 5, 170, 0.24);
        [0.2, 1.45, 2.1].forEach((at) => {
          this.noise(t + at, 0.11, 630, 0.15);
          strike(67, t + at, 0.07, 0.45);
          strike(67, t + at + 0.23, 0.025, 0.6);
        });
        [196, 207].forEach((f) =>
          this.tone(f, t + 2.5, 1.7, 0.024, "sawtooth"),
        );
      } else {
        [1, 2.01, 2.61, 4.09, 5.43].forEach((ratio, i) =>
          this.tone(110 * ratio, t, 4.9 - i * 0.6, 0.11 / (i + 1)),
        );
        this.pluck(73.42, t + 0.35, 3.2, 0.065);
        this.pluck(110, t + 1.46, 2.4, 0.035);
        this.swell(t + 0.5, 4.3, 420, 0.07);
      }
      this.featureVoices = new Set(
        [...this.voices].filter((source) => !existing.has(source)),
      );
    } catch {
      /* Sound cannot change an authoritative result. */
    }
  }
  play(
    event:
      | "breath"
      | "lantern"
      | "pages"
      | "spin"
      | "fortune"
      | "dawn"
      | "scatter"
      | "wild"
      | "transform"
      | "retrigger"
      | "ui"
      | "stop"
      | "win"
      | "awaken"
      | "bell"
      | "chain"
      | "ghost-deck"
      | "gambler-win"
      | "gambler-loss"
      | "chain-snap"
      | "chain-link"
      | "piano"
      | "mine"
      | "earth"
      | "ride"
      | "card"
      | "hand",
    detail = 0,
  ) {
    if (!this.active || document.hidden) return;
    if(['fortune','awaken','ride','mine'].includes(event)) this.quietFoleyUntil=performance.now()+4500;
    if(event==='ghost-deck' && (this.featureActive || performance.now()<this.quietFoleyUntil)) return;
    if (this.score?.paused) void this.score.play().catch(() => {});
    if (event === "ride") {
      this.duckMusic(3100, 0.4);
      if (document.body.classList.contains("reduced-motion")) return;
      try {
        this.prepare();
        void this.context!.resume();
        const start = this.context!.currentTime;
        for (let stride = 0; stride < 5; stride++) {
          const weight = 0.25 + 0.75 * Math.sin((Math.PI * (stride + 0.5)) / 5);
          [0, 0.09, 0.23].forEach((beat, hoof) => {
            const at = start + 0.12 + stride * 0.53 + beat;
            this.noise(at, 0.07, 900, 0.065 * weight);
            this.tone(78 + hoof * 17, at, 0.11, 0.055 * weight, "triangle");
          });
        }
      } catch {
        /* The visual ride continues if its foley is unavailable. */
      }
      return;
    }
    if (["ride", "awaken", "bell"].includes(event)) this.duckMusic(2600);
    else if (event === "win") this.duckMusic(900);
    try {
      this.prepare();
      void this.context!.resume();
      const t = this.context!.currentTime;
      if (event === 'ghost-deck') {
        if(detail===0){
          this.noise(t,.65,1400,.018);
          [392,587.33].forEach((f,i)=>this.tone(f,t+i*.1,.55,.008,'sine'));
        } else {
          this.noise(t,.055,2200,.018);
          this.tone(145,t,.09,.012,'triangle');
          if(detail===5){
            this.tone(293.66,t+.06,.25,.014,'triangle');
            this.tone(277.18,t+.25,.5,.012,'triangle');
          } else this.tone(440+detail*73.42,t+.025,.26,.007,'sine');
        }
      }
      if (event === "card") {
        this.noise(t, 0.065, 1800, 0.055);
        this.tone(170, t + 0.05, 0.07, 0.025, "triangle");
      }
      if (event === "hand") {
        this.duckMusic(850);
        [
          293.66,
          349.23,
          440,
          ...(detail >= 3 ? [587.33] : []),
          ...(detail >= 6 ? [698.46, 880] : []),
        ].forEach((f, i) => {
          this.tone(f, t + i * 0.075, 0.23, 0.035, "triangle");
          this.noise(t + i * 0.075, 0.035, 2400, 0.018);
        });
      }
      if (event === "fortune") {
        this.duckMusic(4200);
        this.noise(t, 0.4, 700, 0.18);
        [73.42, 146.83, 220, 293.66].forEach((f) =>
          this.tone(f, t, 2, 0.08, "triangle"),
        );
        for (let i = 0; i < 14; i++)
          this.tone(
            [587.33, 440, 349.23, 293.66][i % 4],
            t + 0.35 + i * 0.09,
            0.25,
            0.045,
          );
      }
      if (event === "dawn") {
        this.duckMusic(2300);
        [146.83, 220, 293.66].forEach((f, i) =>
          this.tone(f, t + i * 0.2, 1.6, 0.055, "triangle"),
        );
        this.noise(t, 1.7, 450, 0.06);
      }
      if (event === "ui") {
        this.noise(t, 0.035, 2100, 0.045);
        this.tone(340, t, 0.045, 0.018, "triangle");
      }
      if (event === "scatter") {
        this.duckMusic(900);
        const root = [146.83, 174.61, 220, 293.66][Math.min(3, detail)];
        [1, 2.01, 3.1].forEach((ratio, i) =>
          this.tone(root * ratio, t, 1.6, 0.075 / (i + 1)),
        );
        this.noise(t, 0.65, 320, 0.075);
      }
      if (event === "wild" || event === "transform") {
        this.duckMusic(650);
        this.noise(t, 0.5, 1500, 0.13);
        this.tone(73.42, t, 0.6, 0.085, "triangle");
        [220, 293.66, 440].forEach((f, i) =>
          this.tone(f, t + i * 0.06, 0.4, 0.035),
        );
      }
      if (event === "retrigger") {
        this.duckMusic(1800);
        [146.83, 220, 293.66, 440, 587.33].forEach((f, i) =>
          this.tone(f, t + i * 0.11, 1.1, 0.065),
        );
        this.noise(t, 0.45, 480, 0.12);
      }
      if (event === "spin") {
        this.duckMusic(700);
        this.noise(t, 0.32, 1600, 0.16);
        this.tone(62, t, 0.32, 0.11, "triangle");
        for (let i = 0; i < 7; i++) {
          this.noise(t + i * 0.055, 0.035, 3600, 0.055 * (1 - i / 9));
          this.tone(240 - i * 12, t + i * 0.055, 0.045, 0.018, "triangle");
        }
      }
      if (event === "stop") {
        this.noise(t, 0.09, 2200, 0.14);
        this.tone(92 + detail * 9, t, 0.19, 0.1, "triangle");
        this.tone(420 + detail * 34, t + 0.012, 0.065, 0.027);
      }
      if (event === "win")
        [293.66, 349.23, 440, 587.33].forEach((f, i) =>
          this.tone(f, t + i * 0.09, 0.8, 0.065),
        );
      if (event === "bell" || event === "awaken") {
        [146.83, 293.66, 381.76, 599.07, 804.63].forEach((f, i) =>
          this.tone(f, t, 3.8, 0.06 / (i + 1)),
        );
        if (event !== "bell") {
          this.noise(t, 2.8, 260, 0.15);
          [73.42, 110, 146.83].forEach((f) => this.tone(f, t + 0.5, 3, 0.035));
        }
      }
      if (event === "breath") {
        this.noise(t, 1.05, 850, 0.065);
      }
      if (event === "lantern") {
        this.noise(t, 0.18, 3200, 0.045);
        [730, 1183, 1911].forEach((f, i) =>
          this.tone(f, t, 0.45, 0.025 / (i + 1)),
        );
      }
      if (event === "pages") {
        [0.0, 0.09, 0.21].forEach((delay) =>
          this.noise(t + delay, 0.13, 2400, 0.055),
        );
        this.tone(165, t + 0.25, 0.12, 0.025, "triangle");
      }
      if (event === "gambler-win") {
        [0, .14, .31].forEach((delay, i) => {
          this.noise(t + delay, .12, 470 - i * 60, .035);
          this.tone(310 - i * 30, t + delay, .065, .018, "triangle");
        });
      }
      if (event === "gambler-loss") {
        this.noise(t, .45, 270, .04);
        this.tone(190, t, .07, .022, "triangle");
      }
      if (event === "chain-snap") {
        this.noise(t, 0.065, 3600, 0.095);
        this.tone(170, t, 0.11, 0.065, "triangle");
        this.tone(1173, t + 0.012, 0.32, 0.023);
        this.noise(t + 0.07, 0.12, 5400, 0.022);
      }
      if (event === "chain-link") {
        this.noise(t, 0.04, 3100, 0.035);
        this.tone(860, t, 0.13, 0.021);
        this.tone(1297, t + 0.008, 0.21, 0.009);
      }
      if (event === "chain")
        for (let i = 0; i < 5; i++) {
          this.noise(t + i * 0.11, 0.18, 7000, 0.025);
          this.tone(940 + i * 130, t + i * 0.11, 0.5, 0.022);
        }
      if (event === "piano")
        [146.83, 174.61, 220, 293.66].forEach((f, i) => {
          this.tone(f, t + i * 0.17, 2.5, 0.04, "triangle");
          this.tone(f * 2.003, t + i * 0.17, 1.2, 0.009);
        });
      if (event === "mine") {
        this.noise(t, 2.7, 180, 0.2);
        [82, 98, 117].forEach((f, i) => this.tone(f, t + i * 0.3, 2, 0.04));
      }
      if (event === "earth") {
        this.noise(t, 1.4, 440, 0.15);
        this.tone(52, t, 2, 0.05);
      }
    } catch {
      /* Audio failure cannot affect a settled round. */
    }
  }
  suspend() {
    clearTimeout(this.restoreMusicTimer);
    clearInterval(this.musicFadeTimer);
    this.duckUntil = 0;
    this.duckScale = 1;
    if (this.score) this.score.volume = this.musicVolume;
    this.stopVoices();
    this.score?.pause();
    void this.context?.suspend();
  }
  resume() {
    if (this.active) {
      void this.score?.play().catch(() => {});
      void this.context?.resume();
    }
  }
}
