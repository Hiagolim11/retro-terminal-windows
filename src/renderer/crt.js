/* Renderizador CRT em WebGL2.
 *
 * Passes por quadro (ver docs/ARQUITETURA.md §6):
 *   1. textura do texto (canvas 2D do terminal em resolução virtual)
 *   2. burn-in: laço de feedback ping-pong  acc = max(acc - decaimento, texto)
 *   3. bloom: redução + desfoque gaussiano separável (H e V)
 *   4. composição final: h-sync, curvatura, jitter, ruído, glow line, RGB shift,
 *      bloom, burn-in, rasterização, chroma, flicker, luz ambiente, moldura e reflexo.
 */
'use strict';

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); // y = 0 no topo
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_COPY = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
uniform vec2 uSize;
void main() { o = texture(uTex, gl_FragCoord.xy / uSize); }`;

const FRAG_BURN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uText;
uniform sampler2D uPrev;
uniform float uDecay;
uniform vec2 uSize;
void main() {
  vec2 st = gl_FragCoord.xy / uSize; // mesma orientação da textura de texto
  vec3 txt = texture(uText, st).rgb;
  vec3 prev = texture(uPrev, st).rgb;
  o = vec4(max(prev - vec3(uDecay), txt), 1.0);
}`;

const FRAG_BLUR = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
uniform vec2 uDir; // passo em coordenadas de textura
uniform vec2 uSize;
void main() {
  vec2 st = gl_FragCoord.xy / uSize;
  // gaussiano de 9 amostras (pesos normalizados)
  vec3 c = texture(uTex, st).rgb * 0.2270270270;
  c += texture(uTex, st + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, st - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, st + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uTex, st - uDir * 3.2307692308).rgb * 0.0702702703;
  o = vec4(c, 1.0);
}`;

const FRAG_FINAL = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;

uniform sampler2D uText, uBurn, uBloomTex, uNoise;
uniform vec2 uViewport;       // pixels de saída
uniform vec2 uVirtualRes;     // pixels da textura de texto
uniform float uTime;
uniform vec3 uFontColor, uBgColor, uFrameColor;
uniform float uChroma;
uniform float uCurvature, uFrameSize, uRadius;
uniform float uBloom, uBurnIn, uStaticNoise, uJitter, uGlow;
uniform float uFlicker, uHsyncScale, uHsyncFreq;
uniform float uRgbShift, uBrightness, uAmbient, uShine;
uniform int uRaster;
uniform float uRasterIntensity;
uniform int uPixelated;
uniform vec2 uNoiseScale;

vec2 distortCoordinates(vec2 coords) {
  vec2 padded = coords * (1.0 + uFrameSize * 2.0) - uFrameSize;
  vec2 cc = padded - 0.5;
  float d = dot(cc, cc) * uCurvature;
  return padded + cc * (1.0 + d) * d;
}

float rgb2grey(vec3 v) { return dot(v, vec3(0.21, 0.72, 0.04)); }

float rand2(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }

// Amostragem "pixel nítido": mantém a fonte pixelada sem serrilhado.
vec3 sampleText(vec2 uv) {
  if (uPixelated == 1) {
    vec2 px = uv * uVirtualRes;
    vec2 seam = floor(px + 0.5);
    vec2 dudv = max(fwidth(px), vec2(1e-4));
    px = seam + clamp((px - seam) / dudv, -0.5, 0.5);
    uv = px / uVirtualRes;
  }
  return texture(uText, uv).rgb;
}

float randomPass(vec2 coords) {
  return fract(smoothstep(-120.0, 0.0, coords.y - (uVirtualRes.y + 120.0) * fract(uTime * 0.15)));
}

vec3 applyRasterization(vec2 sc, vec3 texel) {
  if (uRaster == 0 || uRaster == 4 || uRasterIntensity <= 0.0) return texel;
  vec2 c = fract(sc * uVirtualRes) * 2.0 - 1.0;
  vec3 result = texel;
  float mask;
  if (uRaster == 1) {                       // Scanlines
    mask = 1.0 - abs(c.y);
  } else if (uRaster == 2) {                // Pixels
    mask = min(1.0 - abs(c.y), 1.0 - abs(c.x) * 0.9);
  } else {                                  // Sub-pixels (tríades RGB)
    vec3 offsets = vec3(1.5707964, -0.5235988, -2.6179938);
    float angle = sc.x * 6.2831853 * uVirtualRes.x;
    result = texel * (3.0 + sin(vec3(angle) + offsets)) / 4.0;
    mask = 1.0 - abs(c.y);
  }
  vec3 hi = (1.3 - result * 0.2) * result;
  vec3 lo = (0.7 + result * 0.1) * result;
  return mix(texel, mix(lo, hi, mask), uRasterIntensity);
}

vec3 convertWithChroma(vec3 c) {
  float grey = rgb2grey(c);
  vec3 fg = mix(uFontColor, c * uFontColor / max(grey, 1e-4), uChroma);
  return mix(uBgColor, fg, clamp(grey, 0.0, 1.5));
}

float roundedRectSdf(vec2 p) {
  vec2 size = uViewport;
  vec2 local = (p - 0.5) * size;
  vec2 halfSize = size * 0.5 - vec2(uRadius);
  vec2 d = abs(local) - halfSize;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - uRadius;
}

void main() {
  vec2 uv = vUv;

  // Horizontal sync: ondulação horizontal sorteada a cada passo de tempo.
  vec2 coords = uv;
  coords.x += sin((coords.y + uTime) * uHsyncFreq) * uHsyncScale;

  vec2 tc = distortCoordinates(coords);

  vec4 noise = texture(uNoise, uNoiseScale * coords + vec2(fract(uTime / 0.051), fract(uTime / 0.237)));
  vec2 ttc = tc + (noise.zw - 0.5) * vec2(0.007, 0.002) * uJitter;

  // Área da tela (retângulo arredondado) x moldura.
  float dist = roundedRectSdf(tc);
  float inScreen = smoothstep(0.0, 1.5, -dist);

  // Fora da tela as coordenadas são espelhadas: o reflexo na moldura.
  vec2 mc = 1.0 - abs(1.0 - abs(ttc));

  // RGB shift (aberração cromática)
  vec3 txt = sampleText(mc);
  if (uRgbShift > 0.0) {
    vec2 dsp = vec2(uRgbShift, 0.0);
    vec3 r = sampleText(mc + dsp);
    vec3 l = sampleText(mc - dsp);
    txt = vec3(l.r * 0.1 + r.r * 0.3 + txt.r * 0.6,
               l.g * 0.2 + r.g * 0.2 + txt.g * 0.6,
               l.b * 0.3 + r.b * 0.1 + txt.b * 0.6);
  }

  vec3 bloomColor = texture(uBloomTex, mc).rgb;
  txt += bloomColor * uBloom * 0.55;

  if (uBurnIn > 0.0) {
    vec3 burn = texture(uBurn, mc).rgb;
    txt = max(txt, burn * 0.65);
  }

  float center = length(vec2(0.5) - uv);
  float extra = noise.w * uStaticNoise * (1.0 - center * 1.3);
  extra += randomPass(tc * uVirtualRes) * uGlow;
  txt += vec3(max(extra, 0.0));

  txt = applyRasterization(tc, txt);

  vec3 screen = convertWithChroma(txt);
  screen *= uFlicker * uBrightness;

  // Luz ambiente: reflexo no vidro, mais claro no centro.
  float glass = clamp(uAmbient * sqrt(max(tc.x * (1.0 - tc.x) * tc.y * (1.0 - tc.y) * 25.0, 0.0)), 0.0, 1.0);
  screen = mix(screen, vec3(glass), 0.3 * uAmbient);

  // Moldura com sombreamento por lado (leste/oeste 66%, norte 33%, sul 100%).
  float seam = max(uRadius, 0.5) / min(uViewport.x, uViewport.y);
  float e = min(smoothstep(-seam, seam, tc.x - tc.y), smoothstep(-seam, seam, tc.x - (1.0 - tc.y)));
  float s = min(smoothstep(-seam, seam, tc.y - tc.x), smoothstep(-seam, seam, tc.x - (1.0 - tc.y)));
  float w = min(smoothstep(-seam, seam, tc.y - tc.x), smoothstep(-seam, seam, (1.0 - tc.x) - tc.y));
  float n = min(smoothstep(-seam, seam, tc.x - tc.y), smoothstep(-seam, seam, (1.0 - tc.x) - tc.y));
  float shadow = e * 0.66 + w * 0.66 + n * 0.33 + s;
  shadow *= smoothstep(0.0, 5.0, dist);
  vec3 frame = clamp(uFrameColor * (0.35 + 0.65 * shadow) + (rand2(uv * uViewport) - 0.5) * 0.04, 0.0, 1.0);
  vec3 reflection = convertWithChroma(bloomColor * 2.0 + sampleText(mc) * 0.15) - uBgColor * 0.5;
  frame = mix(frame, frame + max(reflection, 0.0), uShine);

  vec3 color = mix(frame, screen, inScreen);

  // Dithering contra faixas no gradiente.
  color += (rand2(uv * uViewport + uTime) - 0.5) * 0.02;
  o = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

class CRTRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 não disponível');
    this.gl = gl;
    this.progCopy = this._program(VERT, FRAG_COPY);
    this.progBurn = this._program(VERT, FRAG_BURN);
    this.progBlur = this._program(VERT, FRAG_BLUR);
    this.progFinal = this._program(VERT, FRAG_FINAL);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.textTex = this._texture(1, 1, gl.LINEAR);
    this.noiseTex = this._noiseTexture(512);
    this.burn = [this._target(1, 1), this._target(1, 1)];
    this.bloom = [this._target(1, 1), this._target(1, 1)];
    this.burnIndex = 0;
    this.textW = 1; this.textH = 1;
    this.uniformCache = new Map();
  }

  _shader(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  _program(vs, fs) {
    const gl = this.gl;
    const p = gl.createProgram();
    gl.attachShader(p, this._shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this._shader(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    p.loc = {};
    return p;
  }

  _texture(w, h, filter, wrap) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap || gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap || gl.CLAMP_TO_EDGE);
    return t;
  }

  _noiseTexture(size) {
    const gl = this.gl;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 256) | 0;
    const t = this._texture(size, size, gl.LINEAR, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return t;
  }

  _target(w, h) {
    const gl = this.gl;
    const tex = this._texture(w, h, gl.LINEAR);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }

  _resizeTarget(t, w, h) {
    const gl = this.gl;
    if (t.w === w && t.h === h) return false;
    t.w = w; t.h = h;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return true;
  }

  _clearTarget(t) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, t.w, t.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  _u(p, name) {
    if (!(name in p.loc)) p.loc[name] = this.gl.getUniformLocation(p, name);
    return p.loc[name];
  }

  _bindTex(p, name, unit, tex) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this._u(p, name), unit);
  }

  _draw(target, prog) {
    const gl = this.gl;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0, 0, target.w, target.h);
      gl.uniform2f(this._u(prog, 'uSize'), target.w, target.h);
    }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height); }
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /** Ajusta os tamanhos das texturas intermediárias. */
  setSizes(textW, textH, burnQuality, bloomQuality) {
    this.textW = textW; this.textH = textH;
    const bw = Math.max(16, Math.round(textW * burnQuality)), bh = Math.max(16, Math.round(textH * burnQuality));
    if (this._resizeTarget(this.burn[0], bw, bh) | this._resizeTarget(this.burn[1], bw, bh)) this.resetBurnIn();
    const lw = Math.max(16, Math.round(textW * bloomQuality * 0.5)), lh = Math.max(16, Math.round(textH * bloomQuality * 0.5));
    this._resizeTarget(this.bloom[0], lw, lh);
    this._resizeTarget(this.bloom[1], lw, lh);
  }

  resetBurnIn() {
    this._clearTarget(this.burn[0]);
    this._clearTarget(this.burn[1]);
  }

  uploadText(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }

  updateBurnIn(decay) {
    const gl = this.gl;
    const src = this.burn[this.burnIndex], dst = this.burn[1 - this.burnIndex];
    gl.useProgram(this.progBurn);
    this._bindTex(this.progBurn, 'uText', 0, this.textTex);
    this._bindTex(this.progBurn, 'uPrev', 1, src.tex);
    gl.uniform1f(this._u(this.progBurn, 'uDecay'), decay);
    this._draw(dst, this.progBurn);
    this.burnIndex = 1 - this.burnIndex;
  }

  updateBloom() {
    const gl = this.gl;
    const [a, b] = this.bloom;
    gl.useProgram(this.progCopy);
    this._bindTex(this.progCopy, 'uTex', 0, this.textTex);
    this._draw(a, this.progCopy);
    gl.useProgram(this.progBlur);
    for (let i = 0; i < 2; i++) {
      this._bindTex(this.progBlur, 'uTex', 0, a.tex);
      gl.uniform2f(this._u(this.progBlur, 'uDir'), (1.5 + i) / a.w, 0);
      this._draw(b, this.progBlur);
      this._bindTex(this.progBlur, 'uTex', 0, b.tex);
      gl.uniform2f(this._u(this.progBlur, 'uDir'), 0, (1.5 + i) / a.h);
      this._draw(a, this.progBlur);
    }
  }

  clearBloom() { this._clearTarget(this.bloom[0]); }

  renderFinal(u) {
    const gl = this.gl;
    const p = this.progFinal;
    gl.useProgram(p);
    this._bindTex(p, 'uText', 0, this.textTex);
    this._bindTex(p, 'uBurn', 1, this.burn[this.burnIndex].tex);
    this._bindTex(p, 'uBloomTex', 2, this.bloom[0].tex);
    this._bindTex(p, 'uNoise', 3, this.noiseTex);
    gl.uniform2f(this._u(p, 'uViewport'), this.canvas.width, this.canvas.height);
    gl.uniform2f(this._u(p, 'uVirtualRes'), this.textW, this.textH);
    for (const [k, v] of Object.entries(u)) {
      const loc = this._u(p, k);
      if (loc === null) continue;
      if (k === 'uRaster' || k === 'uPixelated') gl.uniform1i(loc, v);
      else if (Array.isArray(v)) (v.length === 3 ? gl.uniform3fv : gl.uniform2fv).call(gl, loc, v);
      else gl.uniform1f(loc, v);
    }
    this._draw(null);
  }
}

window.CRTRenderer = CRTRenderer;
