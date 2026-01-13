/**
 * WebGL-accelerated metaball rendering
 * Uses GPU shaders for massively parallel pixel calculations
 */

import type { Particle } from "./types.ts";
import { RENDER } from "./constants.ts";

// Vertex shader for fullscreen quad
const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_screenPos;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_screenPos = (a_position + 1.0) * 0.5;
  }
`;

// Fragment shader for metaball rendering
// Uses texture to store particle data and calculates metaball influence per pixel
const FRAGMENT_SHADER = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform sampler2D u_particleData;
  uniform int u_particleCount;
  uniform float u_particleRadius;
  uniform float u_threshold;
  uniform sampler2D u_heatLut;
  uniform int u_textureWidth;

  varying vec2 v_screenPos;

  // Unpack 2 float16 values from RGBA bytes
  vec2 unpackFloat16(vec4 rgba) {
    vec2 result;
    result.x = rgba.r + rgba.g / 255.0;
    result.y = rgba.b + rgba.a / 255.0;
    return result;
  }

  void main() {
    vec2 pixelPos = v_screenPos * u_resolution;
    float r2 = u_particleRadius * u_particleRadius;
    float maxDistSq = u_particleRadius * u_particleRadius * 9.0;

    float influenceSum = 0.0;
    float heatWeightedSum = 0.0;

    // Each particle uses 2 texels: [x,y] and [heat,unused]
    for (int i = 0; i < 4096; i++) {
      if (i >= u_particleCount) break;

      int texelIndex = i * 2;
      int row = texelIndex / u_textureWidth;
      int col = texelIndex - (row * u_textureWidth);

      vec2 uvPos = (vec2(float(col), float(row)) + 0.5) / vec2(float(u_textureWidth), float(u_textureWidth));
      vec2 uvHeat = (vec2(float(col + 1), float(row)) + 0.5) / vec2(float(u_textureWidth), float(u_textureWidth));

      vec4 posData = texture2D(u_particleData, uvPos);
      vec4 heatData = texture2D(u_particleData, uvHeat);

      vec2 particlePos = unpackFloat16(posData);
      float heat = heatData.r;

      vec2 delta = pixelPos - particlePos;
      float distSq = dot(delta, delta);

      if (distSq < maxDistSq) {
        float influence = r2 / (distSq + 1.0);
        influenceSum += influence;
        heatWeightedSum += influence * heat;
      }
    }

    if (influenceSum <= u_threshold) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    float heat = heatWeightedSum / influenceSum;
    gl_FragColor = texture2D(u_heatLut, vec2(heat, 0.5));
  }
`;

export interface WebGLRendererContext {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  particleTexture: WebGLTexture;
  heatLutTexture: WebGLTexture;
  particleDataArray: Uint8Array;
  textureWidth: number;
  locations: {
    resolution: WebGLUniformLocation;
    particleData: WebGLUniformLocation;
    particleCount: WebGLUniformLocation;
    particleRadius: WebGLUniformLocation;
    threshold: WebGLUniformLocation;
    heatLut: WebGLUniformLocation;
    textureWidth: WebGLUniformLocation;
  };
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compilation error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program linking error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

// Pack a float into 2 bytes (lossy but sufficient for screen coordinates)
function packFloat16(value: number): [number, number] {
  const scaled = Math.floor(value);
  const frac = (value - scaled) * 255;
  return [scaled, Math.floor(frac)];
}

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
  });

  if (!gl) {
    console.warn("WebGL not supported");
    return null;
  }

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

  if (!vertexShader || !fragmentShader) {
    return null;
  }

  const program = createProgram(gl, vertexShader, fragmentShader);
  if (!program) {
    return null;
  }

  gl.useProgram(program);

  // Create fullscreen quad
  const positions = new Float32Array([
    -1, -1, // bottom-left
     1, -1, // bottom-right
    -1,  1, // top-left
     1,  1, // top-right
  ]);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const positionLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  // Get uniform locations
  const resolutionLoc = gl.getUniformLocation(program, "u_resolution");
  const particleDataLoc = gl.getUniformLocation(program, "u_particleData");
  const particleCountLoc = gl.getUniformLocation(program, "u_particleCount");
  const particleRadiusLoc = gl.getUniformLocation(program, "u_particleRadius");
  const thresholdLoc = gl.getUniformLocation(program, "u_threshold");
  const heatLutLoc = gl.getUniformLocation(program, "u_heatLut");
  const textureWidthLoc = gl.getUniformLocation(program, "u_textureWidth");

  if (!resolutionLoc || !particleDataLoc || !particleCountLoc ||
      !particleRadiusLoc || !thresholdLoc || !heatLutLoc || !textureWidthLoc) {
    console.error("Failed to get uniform locations");
    return null;
  }

  // Calculate texture size (each particle needs 2 texels: position + heat)
  // Use power of 2 for better performance
  const texelsNeeded = maxParticles * 2;
  const textureWidth = Math.pow(2, Math.ceil(Math.log2(Math.sqrt(texelsNeeded))));
  const particleDataArray = new Uint8Array(textureWidth * textureWidth * 4);

  // Create particle data texture
  const particleTexture = gl.createTexture();
  if (!particleTexture) return null;

  gl.bindTexture(gl.TEXTURE_2D, particleTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // Create heat LUT texture
  const heatLutTexture = gl.createTexture();
  if (!heatLutTexture) return null;

  gl.bindTexture(gl.TEXTURE_2D, heatLutTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Upload heat LUT
  const heatLutData = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const rgba = heatLut256[i];
    heatLutData[i * 4 + 0] = (rgba >> 0) & 0xff;  // R
    heatLutData[i * 4 + 1] = (rgba >> 8) & 0xff;  // G
    heatLutData[i * 4 + 2] = (rgba >> 16) & 0xff; // B
    heatLutData[i * 4 + 3] = (rgba >> 24) & 0xff; // A
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, heatLutData);

  return {
    gl,
    program,
    particleTexture,
    heatLutTexture,
    particleDataArray,
    textureWidth,
    locations: {
      resolution: resolutionLoc,
      particleData: particleDataLoc,
      particleCount: particleCountLoc,
      particleRadius: particleRadiusLoc,
      threshold: thresholdLoc,
      heatLut: heatLutLoc,
      textureWidth: textureWidthLoc,
    },
  };
}

export function renderFrameWebGL(
  ctx: WebGLRendererContext,
  particles: Particle[],
  width: number,
  height: number
): void {
  const { gl, program, particleTexture, heatLutTexture, particleDataArray, textureWidth, locations } = ctx;

  // Pack particle data into texture
  // Each particle uses 2 RGBA texels: [x_high, x_low, y_high, y_low] [heat, 0, 0, 0]
  particleDataArray.fill(0);

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const baseIdx = i * 2 * 4; // 2 texels per particle, 4 bytes per texel

    // First texel: position
    const [xHigh, xLow] = packFloat16(p.x);
    const [yHigh, yLow] = packFloat16(p.y);
    particleDataArray[baseIdx + 0] = xHigh;
    particleDataArray[baseIdx + 1] = xLow;
    particleDataArray[baseIdx + 2] = yHigh;
    particleDataArray[baseIdx + 3] = yLow;

    // Second texel: heat
    particleDataArray[baseIdx + 4] = Math.floor(p.heat * 255);
  }

  // Upload particle data
  gl.bindTexture(gl.TEXTURE_2D, particleTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    textureWidth,
    textureWidth,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    particleDataArray
  );

  // Setup rendering
  gl.useProgram(program);
  gl.viewport(0, 0, width, height);

  // Set uniforms
  gl.uniform2f(locations.resolution, width, height);
  gl.uniform1i(locations.particleCount, particles.length);
  gl.uniform1f(locations.particleRadius, RENDER.PARTICLE_RADIUS);
  gl.uniform1f(locations.threshold, RENDER.THRESHOLD);
  gl.uniform1i(locations.textureWidth, textureWidth);

  // Bind textures
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, particleTexture);
  gl.uniform1i(locations.particleData, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, heatLutTexture);
  gl.uniform1i(locations.heatLut, 1);

  // Draw fullscreen quad
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export function cleanupWebGLRenderer(ctx: WebGLRendererContext): void {
  const { gl, program, particleTexture, heatLutTexture } = ctx;

  gl.deleteTexture(particleTexture);
  gl.deleteTexture(heatLutTexture);
  gl.deleteProgram(program);
}
