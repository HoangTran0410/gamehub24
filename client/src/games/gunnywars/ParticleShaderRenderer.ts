import { WORLD_WIDTH, WORLD_HEIGHT } from "./constants";
import { PARTICLE_STRIDE } from "./constants";

const VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;
layout(location = 4) in float a_life;
layout(location = 6) in float a_size;
layout(location = 7) in float a_type;
layout(location = 8) in vec3 a_color;

uniform vec2 u_cameraPos;
uniform vec2 u_viewSize;
uniform float u_zoom;
uniform vec2 u_worldSize;

out float v_life;
out float v_type;
out vec3 v_color;

void main() {
  // World to screen transformation
  vec2 screenPos = (a_pos - u_cameraPos) * u_zoom;

  // Convert to clip space
  vec2 clipSpace = (screenPos / u_viewSize) * 2.0 - 1.0;
  gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);

  gl_PointSize = a_size * u_zoom;
  v_life = a_life;
  v_type = a_type;
  v_color = a_color;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform int u_pass; // 0 = Alpha Pass (Smoke/Debris), 1 = Additive Pass (Fire/Sparks)
uniform float u_time; // For flicker

in float v_life;
in float v_type;
in vec3 v_color;

out vec4 fragColor;

void main() {
  float dist = length(gl_PointCoord - 0.5);
  if (dist > 0.5) discard;

  bool isFire = v_type > 0.5;

  // Filter based on pass
  if (u_pass == 0 && isFire) discard;
  if (u_pass == 1 && !isFire) discard;

  if (isFire) { // fire, spark, glow
    // High intensity center + LARGE soft outer glow for shining effect
    float core = 1.0 - smoothstep(0.0, 0.2, dist);
    float glow = 1.0 - smoothstep(0.0, 0.5, dist);
    float aura = 1.0 - smoothstep(0.2, 0.5, dist); // Extra layer for volume

    // Flicker effect
    float flicker = 0.8 + 0.2 * sin(u_time * 0.05 + v_life * 100.0);

    // Boost brightness significantly
    vec3 col = v_color * 1.8 * flicker;
    col = mix(col, vec3(1.0, 1.0, 0.95), core * 0.8); // Very hot white-yellow core

    // Output with high alpha for additive pass
    // Multiply by v_life for fade out
    fragColor = vec4(col * (glow * 0.6 + aura * 0.4) * v_life, 1.0);
  } else { // smoke
    // Softer smoke edges
    float smokeAlpha = 1.0 - smoothstep(0.2, 0.5, dist);
    fragColor = vec4(v_color, smokeAlpha * v_life * 0.6);
  }
}
`;

export class ParticleShaderRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private isInitialized = false;

  private uniforms: {
    cameraPos: WebGLUniformLocation | null;
    viewSize: WebGLUniformLocation | null;
    zoom: WebGLUniformLocation | null;
    worldSize: WebGLUniformLocation | null;
    pass: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
  } = {
    cameraPos: null,
    viewSize: null,
    zoom: null,
    worldSize: null,
    pass: null,
    time: null,
  };

  init(gl: WebGL2RenderingContext): boolean {
    this.gl = gl;

    const vertShader = this.compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragShader = this.compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      FRAGMENT_SHADER,
    );

    if (!vertShader || !fragShader) return false;

    const program = gl.createProgram();
    if (!program) return false;

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(
        "Particle program link error:",
        gl.getProgramInfoLog(program),
      );
      return false;
    }

    this.program = program;
    this.uniforms = {
      cameraPos: gl.getUniformLocation(program, "u_cameraPos"),
      viewSize: gl.getUniformLocation(program, "u_viewSize"),
      zoom: gl.getUniformLocation(program, "u_zoom"),
      worldSize: gl.getUniformLocation(program, "u_worldSize"),
      pass: gl.getUniformLocation(program, "u_pass"),
      time: gl.getUniformLocation(program, "u_time"),
    };

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    // Stride is 12 floats: [x,y, vx,vy, life,decay, size,type, r,g,b, additive]
    const FSIZE = 4;
    const stride = PARTICLE_STRIDE * FSIZE;

    // Pos (x, y)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);

    // Life
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 4 * FSIZE);

    // Size
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 1, gl.FLOAT, false, stride, 6 * FSIZE);

    // Type
    gl.enableVertexAttribArray(7);
    gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 7 * FSIZE);

    // Color (r, g, b)
    gl.enableVertexAttribArray(8);
    gl.vertexAttribPointer(8, 3, gl.FLOAT, false, stride, 8 * FSIZE);

    this.isInitialized = true;
    return true;
  }

  render(
    buffer: Float32Array,
    count: number,
    camX: number,
    camY: number,
    viewW: number,
    viewH: number,
    zoom: number,
  ): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.vao || count === 0) return;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Set uniforms
    gl.uniform2f(this.uniforms.cameraPos, camX, camY);
    gl.uniform2f(this.uniforms.viewSize, viewW, viewH);
    gl.uniform1f(this.uniforms.zoom, zoom);
    gl.uniform2f(this.uniforms.worldSize, WORLD_WIDTH, WORLD_HEIGHT);
    gl.uniform1f(this.uniforms.time, performance.now());

    // Upload buffer data (dynamic)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      buffer.subarray(0, count * PARTICLE_STRIDE),
      gl.DYNAMIC_DRAW,
    );

    // Sorting is complex, so we use two-pass filtering in the shader.

    // Pass 1: Alpha Blending for Smoke/Debris
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(this.uniforms.pass, 0);
    gl.drawArrays(gl.POINTS, 0, count);

    // Pass 2: Additive Blending for Fire/Sparks/Glow
    // This makes the explosions "glow" and look much more vibrant
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform1i(this.uniforms.pass, 1);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  private compileShader(
    gl: WebGL2RenderingContext,
    type: number,
    source: string,
  ): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
}
