/** Separate native atmosphere keeps a character's matte independent of smoke. */
export class ResidentFog {
  private host = document.createElement('div');
  private clips: HTMLVideoElement[] = [];
  private events = new AbortController();
  private reduced = false;
  private disposed = false;

  constructor(stage: HTMLElement, source: string) {
    this.host.className = 'resident-fog';
    this.host.setAttribute('aria-hidden', 'true');
    for (const [side, offset] of [['left', .8], ['right', 5.3]] as const) {
      const clip = document.createElement('video');
      clip.className = side;
      clip.src = source;
      clip.poster = source.replace(/\.(webm|mp4)$/, '.png');
      clip.muted = true;
      clip.loop = true;
      clip.playsInline = true;
      clip.preload = 'auto';
      clip.addEventListener('loadedmetadata', () => {
        if (!this.disposed && Number.isFinite(clip.duration) && clip.duration > 0)
          clip.currentTime = offset % clip.duration;
      }, {once:true, signal:this.events.signal});
      this.clips.push(clip);
      this.host.append(clip);
    }
    stage.append(this.host);
    document.addEventListener('visibilitychange', this.sync, {signal:this.events.signal});
    this.sync();
  }

  setReduced(value: boolean) {
    this.reduced = value;
    this.sync();
  }

  private sync = () => {
    for (const clip of this.clips) {
      if (this.disposed || this.reduced || document.hidden) clip.pause();
      else void clip.play().catch(() => {});
    }
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.events.abort();
    for (const clip of this.clips) {
      clip.pause();
      clip.removeAttribute('src');
      clip.load();
    }
    this.host.remove();
  }
}
