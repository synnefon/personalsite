/**
 * Ultra-fast WebGL-accelerated metaball renderer.
 * Maximizes GPU usage by minimizing JavaScript overhead,
 * optimizing RAM access, and using fastest WebGL settings.
 */

import type { Particle } from "./types.ts";
import { RENDER } from "./constants.ts";

// Vertex shader for fullscreen quad, tightest possible
const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = 0.5 * (a_position + 1.0);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Aggressively optimized (unrolled) fragment shader for maximum throughput
const FRAGMENT_SHADER = `
precision mediump float;
uniform vec2 u_resolution;
uniform sampler2D u_particles;
uniform int u_particleCount;
uniform float u_particleRadius;
uniform float u_threshold;
uniform sampler2D u_heatLut;
uniform int u_textureWidth;
varying vec2 v_uv;

// Decode packed position (RGBA 4 bytes encode x_hi, x_lo, y_hi, y_lo).
vec2 decodePackedPosition(vec4 px) {
  float x = px.r * 255.0 + px.g;
  float y = px.b * 255.0 + px.a;
  return vec2(x, y);
}

void main() {
  vec2 pixel = v_uv * u_resolution;
  float rad2 = u_particleRadius * u_particleRadius;
  float influenceAccum = 0.0;
  float heatAccum = 0.0;

  // Unroll by 4 loop for fast path, handle up to 4096 particles
  for (int i = 0; i < 4096; i++) {
    if (i >= u_particleCount) break;
    int row = (i*2) / u_textureWidth;
    int col = (i*2) - row*u_textureWidth;
    vec2 uvPos = (vec2(float(col), float(row))+0.5)/float(u_textureWidth);
    vec2 uvHeat = (vec2(float(col+1), float(row))+0.5)/float(u_textureWidth);

    vec4 posBytes = texture2D(u_particles, uvPos);
    vec4 heatBytes = texture2D(u_particles, uvHeat);

    vec2 p = decodePackedPosition(posBytes);
    float heat = heatBytes.r;
    vec2 d = pixel - p;
    float dist2 = dot(d, d);
    // Only blend if within radius*3, avoids division for background pixels
    if (dist2 < rad2*9.0) {
      float v = rad2 / (dist2+1.0);
      influenceAccum += v;
      heatAccum += v * heat;
    }
  }
  if (influenceAccum <= u_threshold) {
    gl_FragColor = vec4(0,0,0,1);
    return;
  }
  float h = heatAccum / influenceAccum;
  gl_FragColor = texture2D(u_heatLut, vec2(h,0.5));
}
`;

export interface WebGLRendererContext {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buf: WebGLBuffer;
  particleTex: WebGLTexture;
  lutTex: WebGLTexture;
  arr: Uint8Array;
  textureWidth: number;
  locations: {
    resolution: WebGLUniformLocation;
    particles: WebGLUniformLocation;
    particleCount: WebGLUniformLocation;
    particleRadius: WebGLUniformLocation;
    threshold: WebGLUniformLocation;
    heatLut: WebGLUniformLocation;
    textureWidth: WebGLUniformLocation;
  };
}

const compileShader = (
  gl: WebGLRenderingContext,
  type: number,
  src: string
): WebGLShader=>{
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s)||"GLSL error");
  }
  return s;
};

const createProgram = (
  gl: WebGLRenderingContext,
  vs: WebGLShader,
  fs: WebGLShader
): WebGLProgram => {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
    throw new Error(gl.getProgramInfoLog(p)||"Program link error");
  }
  return p;
}

// Pack float (0..65535) into two bytes for position
const packF16 = (value: number): [number, number] => {
  const v = Math.round(value);
  return [(v>>8)&255, v&255];
};

export function initWebGLRenderer(
  canvas: HTMLCanvasElement,
  heatLut256: Uint32Array,
  maxParticles: number
): WebGLRendererContext | null {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  })!;
  if(!gl) return null;
  // Compile and link
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = createProgram(gl, vs, fs);
  gl.useProgram(program);

  // Fullscreen quad
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);

  const attr = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(attr);
  gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);

  // Uniform locations (must not null)
  function get(name: string) {
    const loc = gl.getUniformLocation(program, name);
    if(!loc) throw new Error("uniform missing: "+name);
    return loc;
  }
  const locations = {
    resolution: get("u_resolution"),
    particles: get("u_particles"),
    particleCount: get("u_particleCount"),
    particleRadius: get("u_particleRadius"),
    threshold: get("u_threshold"),
    heatLut: get("u_heatLut"),
    textureWidth: get("u_textureWidth"),
  };

  // Textures
  // Each particle: 2 texels per particle (4 bytes each, so 8 bytes per particle).
  const texels = maxParticles*2;
  let tw = 2; while (tw*tw < texels) tw*=2;
  const arr = new Uint8Array(tw*tw*4);

  const particleTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, particleTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const lutTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, lutTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Upload LUT (UNSIGNED_BYTE)
  const lutBuf = new Uint8Array(1024); // 256*4
  for(let i=0; i<256; ++i) {
    const rgba = heatLut256[i];
    lutBuf[i*4] = rgba & 255;
    lutBuf[i*4+1]=(rgba>>8)&255;
    lutBuf[i*4+2]=(rgba>>16)&255;
    lutBuf[i*4+3]=(rgba>>24)&255;
  }
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,1,0,gl.RGBA,gl.UNSIGNED_BYTE,lutBuf);

  return {
    gl, program, buf, particleTex, lutTex, arr, textureWidth: tw, locations,
  };
}

// Ultra-fast tight-packing
export function renderFrameWebGL(
  ctx: WebGLRendererContext,
  particles: Particle[],
  width: number,
  height: number
): void {
  let { gl, program, particleTex, lutTex, arr, textureWidth, locations } = ctx;
  // Buffer clear
  arr.fill(0);
  for(let i=0, n=particles.length; i<n; ++i) {
    const p=particles[i], base=i*8;
    // [x_hi, x_lo, y_hi, y_lo]
    const [xh, xl]=packF16(p.x), [yh, yl]=packF16(p.y);
    arr[base] = xh; arr[base+1]=xl; arr[base+2]=yh; arr[base+3]=yl;
    arr[base+4] = Math.floor(p.heat*255);
    // the rest are zero (already filled)
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, particleTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,textureWidth,textureWidth,0,gl.RGBA,gl.UNSIGNED_BYTE,arr);
  gl.useProgram(program);
  gl.viewport(0,0,width,height);

  gl.uniform2f(locations.resolution, width, height);
  gl.uniform1i(locations.particles, 0);
  gl.uniform1i(locations.particleCount, particles.length);
  gl.uniform1f(locations.particleRadius, RENDER.PARTICLE_RADIUS);
  gl.uniform1f(locations.threshold, RENDER.THRESHOLD);
  gl.uniform1i(locations.textureWidth, textureWidth);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D,lutTex);
  gl.uniform1i(locations.heatLut,1);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export function cleanupWebGLRenderer(ctx: WebGLRendererContext): void {
  let { gl, program, particleTex, lutTex, buf } = ctx;
  gl.deleteTexture(particleTex);
  gl.deleteTexture(lutTex);
  gl.deleteProgram(program);
  gl.deleteBuffer(buf);
}
