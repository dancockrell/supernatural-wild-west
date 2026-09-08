export type EventScoreKey =
  | "hand-high-card"
  | "hand-pair"
  | "hand-two-pair"
  | "hand-trips"
  | "hand-straight"
  | "hand-flush"
  | "hand-full-house"
  | "hand-quads"
  | "hand-straight-flush"
  | "hand-royal-flush"
  | "feature-graveyard"
  | "feature-saloon"
  | "feature-jail"
  | "feature-mine"
  | "feature-church"
  | "feature-witch"
  | "feature-fortune"
  | "feature-ride";

interface EventScoreVoice {
  token: number;
  key: EventScoreKey;
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  envelope: number;
  closing: boolean;
  fade?: ReturnType<typeof setInterval>;
  deadline?: ReturnType<typeof setTimeout>;
}

export class SoundBus {
  private eventScore?: EventScoreVoice;
  private eventScoreVoices = new Set<EventScoreVoice>();
  private eventScoreToken = 0;

  /** The media owner supplies its native duration and clock on every actual playing event. */
  playEventScore(
    key: EventScoreKey,
    durationSeconds = 10,
    offsetSeconds = 0,
  ): () => void {
    // A replacement owns the music lane, including any older fading voices.
    this.stopAllEventScores();
    if (!this.active || document.hidden) return () => {};
    try {
      this.prepare();
      void this.context!.resume();
      const audio = new Audio(`/audio/event-scores-v1/${key}.mp3`);
      audio.preload = "auto";
      audio.preservesPitch = true;
      audio.volume = 0;
      const source = this.context!.createMediaElementSource(audio);
      // Event music follows the music fader, not the effects fader or night low-pass.
      source.connect(this.compressor!);
      const voice: EventScoreVoice = {
        token: ++this.eventScoreToken,
        key,
        audio,
        source,
        envelope: 0,
        closing: false,
      };
      this.eventScore = voice;
      this.eventScoreVoices.add(voice);
      // Reserve the duck while audio loads, avoiding a full-volume theme burst.
      this.fadeMusic(this.musicVolume * this.themeDuckScale(), 80);
      const span = Math.max(
        7,
        Math.min(10, Number.isFinite(durationSeconds) ? durationSeconds : 10),
      );
      const offset = Math.max(
        0,
        Number.isFinite(offsetSeconds) ? offsetSeconds : 0,
      );
      const requestedAt = performance.now();
      let started = false;
      const start = () => {
        if (
          started ||
          voice.closing ||
          this.eventScore !== voice ||
          !this.active ||
          document.hidden
        )
          return;
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
        started = true;
        const elapsed = offset + (performance.now() - requestedAt) / 1000;
        if (elapsed >= span) {
          this.closeEventScore(voice, 0);
          return;
        }
        // Preserve the complete composition and its cadence when the native film is 7–10 seconds.
        const rate = audio.duration / span;
        audio.playbackRate = Math.max(0.7, Math.min(1.5, rate));
        audio.currentTime = Math.min(
          audio.duration - 0.01,
          elapsed * audio.playbackRate,
        );
        void audio
          .play()
          .then(() => {
            if (
              voice.closing ||
              this.eventScore !== voice ||
              !this.active ||
              document.hidden
            ) {
              audio.pause();
              this.closeEventScore(voice, 0);
              return;
            }
            const audibleElapsed =
              offset + (performance.now() - requestedAt) / 1000;
            if (audibleElapsed >= span) {
              this.closeEventScore(voice, 0);
              return;
            }
            const position = Math.min(
              audio.duration - 0.01,
              audibleElapsed * audio.playbackRate,
            );
            if (Math.abs(audio.currentTime - position) > 0.12)
              audio.currentTime = position;
            voice.envelope = 1;
            audio.volume = this.musicVolume * 0.92;
            this.fadeMusic(this.musicVolume * this.themeDuckScale(), 80);
          })
          .catch(() => this.closeEventScore(voice, 0));
      };
      audio.onloadedmetadata = start;
      audio.onplaying = () => {
        if (
          voice.closing ||
          this.eventScore !== voice ||
          !this.active ||
          document.hidden
        ) {
          audio.pause();
          return;
        }
        const elapsed = offset + (performance.now() - requestedAt) / 1000;
        if (elapsed >= span) {
          this.closeEventScore(voice, 0);
          return;
        }
        const position = Math.min(
          audio.duration - 0.01,
          elapsed * audio.playbackRate,
        );
        // A resumed audio buffer must catch up to the still-running visual performance.
        if (Math.abs(audio.currentTime - position) > 0.12)
          audio.currentTime = position;
      };
      audio.onended = () => this.closeEventScore(voice, 0);
      audio.onerror = () => this.closeEventScore(voice, 0);
      voice.deadline = setTimeout(
        () => this.closeEventScore(voice, 0),
        (span - Math.min(offset, span)) * 1000 + 1000,
      );
      audio.load();
      if (audio.readyState >= 1) start();
      return () => this.closeEventScore(voice, 250);
    } catch {
      // A music transport failure must never affect a result or a character's media clock.
      return () => {};
    }
  }

  stopEventScore(fadeMilliseconds = 250) {
    if (this.eventScore)
      this.closeEventScore(this.eventScore, fadeMilliseconds);
  }

  private closeEventScore(voice: EventScoreVoice, milliseconds: number) {
    if (!this.eventScoreVoices.has(voice)) return;
    if (voice.closing && milliseconds > 0) return;
    voice.closing = true;
    clearTimeout(voice.deadline);
    clearInterval(voice.fade);
    voice.audio.onloadedmetadata = null;
    voice.audio.onplaying = null;
    voice.audio.onended = null;
    voice.audio.onerror = null;
    const finish = () => {
      clearInterval(voice.fade);
      voice.audio.pause();
      voice.source.disconnect();
      this.eventScoreVoices.delete(voice);
      if (this.eventScore !== voice) return;
      this.eventScore = undefined;
      if (this.active && !document.hidden)
        this.fadeMusic(this.musicVolume * this.themeDuckScale(), 600);
    };
    if (milliseconds <= 0 || voice.audio.paused || voice.envelope === 0) {
      finish();
      return;
    }
    const startedAt = performance.now(),
      initial = voice.envelope;
    voice.fade = setInterval(() => {
      const progress = Math.min(
        1,
        (performance.now() - startedAt) / milliseconds,
      );
      voice.envelope = initial * (1 - progress);
      voice.audio.volume = this.musicVolume * 0.92 * voice.envelope;
      if (progress === 1) finish();
    }, 16);
  }

  private stopAllEventScores() {
    for (const voice of [...this.eventScoreVoices])
      this.closeEventScore(voice, 0);
  }
  private active = false;
  private context?: AudioContext;
  private machine?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private musicFilter?: BiquadFilterNode;
  private scoreSource?: MediaElementAudioSourceNode;
  private duckUntil = 0;
  private quietFoleyUntil = 0;
  private featureActive = false;
  beginFeature() {
    this.featureActive = true;
  }
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
    for (const voice of this.eventScoreVoices)
      voice.audio.volume = this.musicVolume * 0.92 * voice.envelope;
    if (this.score)
      this.score.volume = this.musicVolume * this.themeDuckScale();
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
      this.stopAllEventScores();
      this.stopFeature();
      this.stopVoices();
      this.score?.pause();
      void this.context?.suspend();
    }
  }
  private themeDuckScale() {
    const incidental = performance.now() < this.duckUntil ? this.duckScale : 1;
    // Loading and fading scores still own the lane. An incidental release must
    // not bring the theme back over a score tail or a buffering restart.
    const event = this.eventScoreVoices.size > 0 ? 0.18 : 1;
    return Math.min(incidental, event);
  }
  private duckMusic(milliseconds: number, depth = 0.63) {
    if (!this.score) return;
    this.duckScale = Math.min(
      performance.now() < this.duckUntil ? this.duckScale : 1,
      depth,
    );
    this.duckUntil = Math.max(this.duckUntil, performance.now() + milliseconds);
    clearTimeout(this.restoreMusicTimer);
    this.fadeMusic(this.musicVolume * this.themeDuckScale(), 80);
    this.restoreMusicTimer = setTimeout(() => {
      this.duckScale = 1;
      this.fadeMusic(this.musicVolume * this.themeDuckScale(), 650);
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
    pan = 0,
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
    const panner = pan === 0 ? undefined : c.createStereoPanner();
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(panner);
      panner.connect(this.machine!);
    } else g.connect(this.machine!);
    o.start(time);
    this.voices.add(o);
    o.stop(time + duration + 0.02);
    o.onended = () => {
      this.voices.delete(o);
      o.disconnect();
      g.disconnect();
      panner?.disconnect();
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
    this.featureActive = false;
    if (this.eventScore?.key.startsWith("feature-")) this.stopEventScore();
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
    const places = ["graveyard", "saloon", "jail", "mine", "church"] as const;
    const place = places[Math.max(0, Math.min(4, location))];
    this.playEventScore(
      kind === "witch" ? "feature-witch" : `feature-${place}`,
    );
  }
  play(
    event:
      | "breath"
      | "lantern"
      | "pages"
      | "book-close"
      | "brazier"
      | "cloth"
      | "hoof"
      | "table-knock"
      | "cartridge"
      | "ghost-chime"
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
    if (["fortune", "awaken", "ride", "mine"].includes(event))
      this.quietFoleyUntil = performance.now() + 4500;
    if (
      ["ghost-deck", "lantern", "breath"].includes(event) &&
      (this.featureActive ||
        !!this.eventScore ||
        performance.now() < this.quietFoleyUntil)
    )
      return;
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
      if (event === "book-close") {
        this.noise(t, 0.11, 1300, 0.045);
        this.tone(94, t + 0.012, 0.16, 0.027, "triangle");
        this.noise(t + 0.08, 0.16, 2700, 0.018);
      }
      if (event === "brazier") {
        this.noise(t, 0.6, 600, 0.022);
        [326, 877, 1511].forEach((f, i) =>
          this.tone(f, t + 0.035, 1.1 / (i + 1), 0.015 / (i + 1)),
        );
      }
      if (event === "cloth") {
        this.noise(t, 0.32, 1600, 0.017);
        this.noise(t + 0.2, 0.24, 800, 0.01);
      }
      if (event === "hoof") {
        this.noise(t, 0.035, 2800, 0.033);
        this.tone(87, t, 0.1, 0.032, "triangle");
        this.noise(t + 0.025, 0.12, 420, 0.028);
      }
      if (event === "table-knock") {
        this.noise(t, 0.045, 1600, 0.022);
        this.tone(132, t, 0.12, 0.025, "triangle");
        this.tone(287, t + 0.008, 0.06, 0.008);
      }
      if (event === "cartridge") {
        this.noise(t, 0.026, 3800, 0.019);
        [1260, 2177, 3240].forEach((f, i) =>
          this.tone(f, t + i * 0.006, 0.22 / (i + 1), 0.013 / (i + 1)),
        );
      }
      if (event === "ghost-chime") {
        const index = Math.max(0, Math.min(2, Math.round(detail)));
        const root = [659.25, 783.99, 987.77][index];
        [1, 2.013, 3.97].forEach((ratio, i) =>
          this.tone(
            root * ratio,
            t,
            1.25 / (i + 1),
            0.019 / (i + 1),
            "sine",
            [-0.5, 0, 0.5][index],
          ),
        );
        this.noise(t + 0.02, 0.16, 2200, 0.004);
      }
      if (event === "ghost-deck") {
        if (detail === 0) {
          this.noise(t, 0.65, 1400, 0.018);
          [392, 587.33].forEach((f, i) =>
            this.tone(f, t + i * 0.1, 0.55, 0.008, "sine"),
          );
        } else {
          this.noise(t, 0.055, 2200, 0.018);
          this.tone(145, t, 0.09, 0.012, "triangle");
          if (detail === 5) {
            this.tone(293.66, t + 0.06, 0.25, 0.014, "triangle");
            this.tone(277.18, t + 0.25, 0.5, 0.012, "triangle");
          } else
            this.tone(440 + detail * 73.42, t + 0.025, 0.26, 0.007, "sine");
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
        // Brief material accent only; the native feature lifecycle owns its distinct music.
        this.noise(t, 0.18, 1600, 0.025);
        [1174, 1760, 2349].forEach((f, i) =>
          this.tone(f, t + i * 0.11, 0.7, 0.012 / (i + 1)),
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
        [0, 0.14, 0.31].forEach((delay, i) => {
          this.noise(t + delay, 0.12, 470 - i * 60, 0.035);
          this.tone(310 - i * 30, t + delay, 0.065, 0.018, "triangle");
        });
      }
      if (event === "gambler-loss") {
        this.noise(t, 0.45, 270, 0.04);
        this.tone(190, t, 0.07, 0.022, "triangle");
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
    this.stopAllEventScores();
    this.stopFeature();
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
