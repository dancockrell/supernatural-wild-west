/** Map the complete film width into the viewport, spending compression on its quiet centre. */
export function frontierCurve(ratio: number, segments = 128): number[] {
  const squeeze = Math.min(1, Math.max(0.001, ratio));
  const centre = Math.max(0.025, (squeeze - 0.6) / 0.4);
  const weights = Array.from({ length: segments }, (_, i) => {
    const distance = Math.abs(2 * (i + 0.5) / segments - 1);
    const t = Math.max(0, Math.min(1, (distance - 0.24) / 0.32));
    const edge = t * t * (3 - 2 * t);
    return centre + (1 - centre) * edge;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let sum = 0;
  return [0, ...weights.map(w => (sum += w) / total)];
}

/** A flat video mesh, not a replacement 3D scene. One texture upload and draw per film frame. */
export class FrontierFilm {
  private gl: WebGLRenderingContext | null;
  private fallback: CanvasRenderingContext2D | null = null;
  private program?: WebGLProgram;
  private buffer?: WebGLBuffer;
  private texture?: WebGLTexture;
  private shape = '';
  private curve: number[] = [];
  constructor(private canvas: HTMLCanvasElement) {
    const gl = this.gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) { this.fallback = canvas.getContext('2d'); return; }
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Frontier shader failed');
      return s;
    };
    const vs = shader(gl.VERTEX_SHADER, 'attribute vec2 position; attribute vec2 uv; varying vec2 film; void main(){gl_Position=vec4(position,0.,1.);film=uv;}');
    const fs = shader(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec2 film; uniform sampler2D frame; void main(){gl_FragColor=texture2D(frame,film);}');
    const p = this.program = gl.createProgram()!;
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Frontier program failed');
    gl.useProgram(p);
    this.buffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (const [name, offset] of [['position', 0], ['uv', 8]] as const) {
      const location = gl.getAttribLocation(p, name);
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 16, offset);
    }
    this.texture = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  draw(video: HTMLVideoElement) {
    const { width, height } = this.canvas;
    const ratio = width / height / (video.videoWidth / video.videoHeight);
    const key = `${width}:${height}:${video.videoWidth}:${video.videoHeight}`;
    const vertical = Math.min(1, 1 / ratio);
    const top = (1 - vertical) / 2;
    if (key !== this.shape) {
      this.shape = key; this.curve = frontierCurve(ratio);
      const vertices: number[] = [], count = this.curve.length - 1;
      for (let i = 0; i < count; i++) {
        const l = this.curve[i] * 2 - 1, r = this.curve[i + 1] * 2 - 1;
        const a = i / count, b = (i + 1) / count;
        vertices.push(l,1,a,top, l,-1,a,top+vertical, r,1,b,top,
          r,1,b,top, l,-1,a,top+vertical, r,-1,b,top+vertical);
      }
      this.gl?.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
      this.canvas.dataset.framing = ratio < 1 ? 'centre-compressed' : 'full-width';
    }
    const gl = this.gl;
    if (gl) {
      gl.viewport(0, 0, width, height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      gl.drawArrays(gl.TRIANGLES, 0, (this.curve.length - 1) * 6);
    } else if (this.fallback) {
      const n = this.curve.length - 1;
      for (let i = 0; i < n; i++) this.fallback.drawImage(video,
        video.videoWidth*i/n, video.videoHeight*top, video.videoWidth/n, video.videoHeight*vertical,
        this.curve[i]*width,0,(this.curve[i+1]-this.curve[i])*width+0.5,height);
    }
  }
  dispose() {
    const gl = this.gl;
    if (gl) { gl.deleteTexture(this.texture!); gl.deleteBuffer(this.buffer!); gl.deleteProgram(this.program!); }
  }
}
