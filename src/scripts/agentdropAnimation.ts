/**
 * Agentdrop Animation — NameDrop-accurate sequence.
 *
 * From frame-by-frame video analysis (namedrop.mp4 @ 100ms intervals):
 *
 * The effect is NOT an explosion. It's a gooey, viscous lens warp that
 * PULLS content toward the junction point (ground zero), blurs it
 * DIRECTIONALLY toward that point, creates a soft white portal glow,
 * then settles with an elastic bounce. Like dropping a blob of honey.
 *
 * PHASES:
 *   1 (0–25%)   Subtle hue-shimmer near GZ. Content begins being pulled
 *               toward junction. Very gentle at first.
 *   2 (25–45%)  Pull intensifies — content stretches like taffy toward GZ.
 *               Directional blur TOWARD junction (not uniform, not top-down).
 *               Soft white glow begins growing at GZ.
 *   3 (45–55%)  Peak warp. Maximum pull + blur. White portal glow peaks.
 *               The "plop" moment. Content is maximally smeared toward GZ.
 *   4 (55–70%)  Glow recedes with elastic spring. Content begins settling.
 *               Blur reduces. Convex lens distortion remains.
 *   5 (70–100%) Elastic settlement. Content bounces slightly past rest and
 *               snaps back. Blur clears. Everything sharpens.
 *
 * Ground zero = junction edge between page and sidebar:
 *   Page:    right-center  (1.0, 0.5) in UV
 *   Sidebar: left-center   (0.0, 0.5) in UV
 */

const DURATION = 3400;

// ═══════════════════════════════════════════════════════════════════════════
//  WebGL2 shader
// ═══════════════════════════════════════════════════════════════════════════

const VERT_SRC = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uPage;
uniform float uProgress;
uniform vec2  uResolution;
uniform vec2  uOrigin;       // ground zero in UV

// ── helpers ──

float ss(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// Elastic ease-out: overshoots then settles (gooey bounce)
float elasticOut(float t) {
  if (t <= 0.0) return 0.0;
  if (t >= 1.0) return 1.0;
  return pow(2.0, -10.0 * t) * sin((t - 0.075) * (2.0 * 3.14159) / 0.3) + 1.0;
}

float easeOutCubic(float t) {
  return 1.0 - pow(1.0 - t, 3.0);
}

void main() {
  vec2 uv = vUV;
  float p = uProgress;
  float aspect = uResolution.x / uResolution.y;
  vec2 ar = vec2(aspect, 1.0);

  // Vector from this pixel toward ground zero (the pull direction)
  vec2 toGZ = (uOrigin - uv) * ar;
  float distGZ = length(toGZ);
  vec2 dirToGZ = distGZ > 0.001 ? toGZ / distGZ : vec2(0.0);
  float maxD = length(ar);

  // Proximity to GZ (0 = far, 1 = at GZ)
  float proximity = exp(-distGZ * 2.0 / maxD);

  // ═══════════════════════════════════════════════════════════════════
  // GRAVITATIONAL PULL — content stretches like taffy toward junction
  // ═══════════════════════════════════════════════════════════════════

  // Ramps up, peaks at 45-55%, then settles with elastic bounce
  float pullRamp = ss(0.05, 0.45, p);
  float pullPeak = ss(0.30, 0.50, p);
  float pullSettle = ss(0.55, 0.85, p);

  // Elastic settlement: overshoots then snaps back
  float settleElastic = pullSettle > 0.0 ? elasticOut(pullSettle) : 0.0;
  float pullAmount = pullRamp * (1.0 - settleElastic * 0.95);

  // Stronger pull for pixels closer to GZ (gravitational falloff)
  float pullFalloff = pow(proximity, 0.6); // wide influence
  vec2 pullDisp = dirToGZ * pullAmount * pullFalloff * 0.08;

  // ═══════════════════════════════════════════════════════════════════
  // DIRECTIONAL BLUR — smears content TOWARD the junction
  // ═══════════════════════════════════════════════════════════════════

  // Blur amount ramps with the pull, fades during settlement
  float blurRamp = ss(0.15, 0.50, p) * (1.0 - ss(0.65, 0.95, p));
  // Pixels closer to GZ get more blur
  float blurProximity = pow(proximity, 0.4);
  float blurAmount = blurRamp * blurProximity * 0.025;

  // Also add general screen blur that ramps up
  float globalBlur = ss(0.25, 0.50, p) * (1.0 - ss(0.60, 0.90, p)) * 0.008;
  blurAmount += globalBlur;

  // ═══════════════════════════════════════════════════════════════════
  // CONVEX LENS — gooey barrel distortion spreading from GZ
  // ═══════════════════════════════════════════════════════════════════

  float lensGrow = ss(0.35, 0.55, p);
  float lensFade = 1.0 - ss(0.65, 0.95, p);
  float lensRadius = easeOutCubic(lensGrow) * maxD * 0.7;

  vec2 lensDisp = vec2(0.0);
  if (distGZ < lensRadius && lensGrow > 0.0) {
    float nd = distGZ / max(lensRadius, 0.001);
    float lensStrength = (1.0 - nd * nd) * lensGrow * lensFade * 0.035;
    // Push outward from GZ (barrel distortion)
    lensDisp = -dirToGZ * lensStrength;
  }

  // ═══════════════════════════════════════════════════════════════════
  // COMPOSE: Apply displacements + directional blur sampling
  // ═══════════════════════════════════════════════════════════════════

  vec2 totalDisp = pullDisp + lensDisp;
  vec2 sampleUV = uv + totalDisp;

  vec3 color = vec3(0.0);

  if (blurAmount > 0.001) {
    // DIRECTIONAL blur: samples are taken along the pull direction
    // This creates the taffy-stretch smear toward GZ
    float totalW = 0.0;
    int taps = 13;
    for (int i = -6; i <= 6; i++) {
      float fi = float(i);
      float w = exp(-fi * fi * 0.12);
      // Primary blur direction: toward GZ
      vec2 blurDir = dirToGZ / ar; // un-aspect-correct for UV space
      vec2 off = blurDir * fi * blurAmount;
      // Add slight perpendicular spread for softness
      vec2 perpDir = vec2(-blurDir.y, blurDir.x);
      off += perpDir * fi * blurAmount * 0.15;
      color += texture(uPage, clamp(sampleUV + off, 0.0, 1.0)).rgb * w;
      totalW += w;
    }
    color /= totalW;
  } else {
    color = texture(uPage, clamp(sampleUV, 0.0, 1.0)).rgb;
  }

  // ═══════════════════════════════════════════════════════════════════
  // VISUAL EFFECTS
  // ═══════════════════════════════════════════════════════════════════

  // -- Subtle hue shimmer near GZ (phase 1, barely visible) --
  float shimmerPhase = ss(0.0, 0.25, p) * (1.0 - ss(0.40, 0.55, p));
  if (shimmerPhase > 0.01 && proximity > 0.3) {
    float hueAmt = shimmerPhase * proximity * 0.08;
    float cosH = cos(hueAmt * 6.28318);
    float sinH = sin(hueAmt * 6.28318);
    vec3 shifted = vec3(
      dot(color, vec3(0.667 + cosH * 0.333, 0.333 - cosH * 0.333 + sinH * 0.577, 0.333 - cosH * 0.333 - sinH * 0.577)),
      dot(color, vec3(0.333 - cosH * 0.333 - sinH * 0.577, 0.667 + cosH * 0.333, 0.333 - cosH * 0.333 + sinH * 0.577)),
      dot(color, vec3(0.333 - cosH * 0.333 + sinH * 0.577, 0.333 - cosH * 0.333 - sinH * 0.577, 0.667 + cosH * 0.333))
    );
    color = mix(color, shifted, shimmerPhase * proximity * 0.5);
  }

  // -- Soft white portal glow at GZ --
  // Grows organically, not a sharp flash. Like light through frosted glass.
  float glowGrow = ss(0.25, 0.50, p);
  float glowFade = 1.0 - ss(0.55, 0.75, p);
  float glowI = glowGrow * glowFade;

  if (glowI > 0.01) {
    float glowRadius = glowGrow * 0.25;
    float glowF = exp(-distGZ * distGZ / (glowRadius * glowRadius + 0.001));
    // Soft white — not a harsh flash
    float whiteout = glowF * glowI * 1.2;
    color = mix(color, vec3(1.0, 0.99, 0.97), clamp(whiteout, 0.0, 0.95));

    // Very gentle ambient brightness lift
    color += vec3(1.0, 0.98, 0.96) * glowI * 0.03 * (1.0 - proximity);
  }

  // -- Subtle chromatic fringe at lens edge --
  if (lensGrow > 0.0 && lensFade > 0.0 && lensRadius > 0.01) {
    float edgeDist = abs(distGZ - lensRadius * 0.9);
    float fringe = exp(-edgeDist * edgeDist / (0.002 + 0.001 * lensRadius));
    float fringeAmt = fringe * lensGrow * lensFade * 0.06;
    color.r += fringeAmt * 0.2;
    color.b += fringeAmt * 0.15;
  }

  fragColor = vec4(color, 1.0);
}`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile error: ' + log);
  }
  return shader;
}

function loadTexture(
  gl: WebGL2RenderingContext,
  img: HTMLImageElement,
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

function runWebGLAnimation(
  screenshotUrl: string,
  scheduledStart: number | undefined,
  originUV: [number, number],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        startGL(img);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Failed to load screenshot'));
    img.src = screenshotUrl;

    function startGL(pageImg: HTMLImageElement) {
      const w = window.innerWidth;
      const h = window.innerHeight;

      const canvas = document.createElement('canvas');
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      canvas.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;width:100%;height:100%;pointer-events:none;';
      document.body.appendChild(canvas);

      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
      })!;
      if (!gl) throw new Error('WebGL2 not available');

      const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
        throw new Error('Program link error: ' + gl.getProgramInfoLog(prog));
      gl.useProgram(prog);

      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const aPos = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      const tex = loadTexture(gl, pageImg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(prog, 'uPage'), 0);
      gl.uniform2f(gl.getUniformLocation(prog, 'uResolution'), w, h);
      gl.uniform2f(
        gl.getUniformLocation(prog, 'uOrigin'),
        originUV[0],
        originUV[1],
      );
      const uProgress = gl.getUniformLocation(prog, 'uProgress');

      const perfOffset = performance.now() - Date.now();
      const startTime = scheduledStart
        ? scheduledStart + perfOffset
        : performance.now();

      gl.viewport(0, 0, canvas.width, canvas.height);

      function frame(now: number) {
        const elapsed = now - startTime;
        if (elapsed < 0) {
          requestAnimationFrame(frame);
          return;
        }
        const progress = Math.min(elapsed / DURATION, 1);
        gl.uniform1f(uProgress, progress);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          canvas.remove();
          gl.deleteTexture(tex);
          gl.deleteBuffer(buf);
          gl.deleteProgram(prog);
          gl.deleteShader(vs);
          gl.deleteShader(fs);
          resolve();
        }
      }
      requestAnimationFrame(frame);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  Canvas 2D overlay — for SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function runOverlayAnimation(
  scheduledStart: number | undefined,
  originUV: [number, number],
): Promise<void> {
  return new Promise((resolve) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ox = originUV[0] * w;
    const oy = originUV[1] * h;

    const overlay = document.createElement('div');
    overlay.id = 'agentdrop-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden;';

    const canvas = document.createElement('canvas');
    const dpr = devicePixelRatio;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    overlay.appendChild(canvas);
    document.body.appendChild(overlay);

    // Apply blur to sidebar content
    const sidebarContent = (document.querySelector('.sidebar-container') ||
      document.querySelector('#chat-container') ||
      document.body.firstElementChild ||
      document.body) as HTMLElement;
    const origFilter = sidebarContent.style.filter;
    const origTransform = sidebarContent.style.transform;
    const origTransition = sidebarContent.style.transition;
    sidebarContent.style.transition = 'filter 0.1s ease, transform 0.1s ease';

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const perfOffset = performance.now() - Date.now();
    const startTime = scheduledStart
      ? scheduledStart + perfOffset
      : performance.now();

    function frame(now: number) {
      const elapsed = now - startTime;
      if (elapsed < 0) {
        requestAnimationFrame(frame);
        return;
      }
      const p = Math.min(elapsed / DURATION, 1);
      ctx.clearRect(0, 0, w, h);

      // -- Directional blur + pull on sidebar content --
      const blurAmt =
        smoothstep(0.15, 0.5, p) * (1 - smoothstep(0.65, 0.95, p));
      const blurPx = blurAmt * 12;
      const pullAmt =
        smoothstep(0.05, 0.45, p) * (1 - smoothstep(0.55, 0.9, p));
      const pullPx = pullAmt * 15 * (originUV[0] < 0.5 ? 1 : -1);

      sidebarContent.style.filter = blurPx > 0.3 ? `blur(${blurPx}px)` : '';
      sidebarContent.style.transform =
        Math.abs(pullPx) > 0.5 ? `translateX(${pullPx}px)` : '';

      // -- Soft white portal glow at GZ --
      const glowGrow = smoothstep(0.25, 0.5, p);
      const glowFade = 1 - smoothstep(0.55, 0.75, p);
      const glowI = glowGrow * glowFade;

      if (glowI > 0.01) {
        const gr = glowGrow * Math.min(w, h) * 0.3;
        const gg = ctx.createRadialGradient(ox, oy, 0, ox, oy, gr);
        gg.addColorStop(0, `rgba(255, 255, 252, ${glowI * 0.8})`);
        gg.addColorStop(0.4, `rgba(255, 252, 248, ${glowI * 0.3})`);
        gg.addColorStop(1, 'rgba(255, 250, 245, 0)');
        ctx.fillStyle = gg;
        ctx.fillRect(0, 0, w, h);
      }

      // -- Subtle hue shimmer --
      if (p < 0.55 && p > 0.02) {
        const shimmer =
          smoothstep(0.0, 0.25, p) * (1 - smoothstep(0.4, 0.55, p));
        if (shimmer > 0.01) {
          const sr = 60;
          const sg = ctx.createRadialGradient(ox, oy, 0, ox, oy, sr);
          sg.addColorStop(0, `rgba(200, 180, 255, ${shimmer * 0.06})`);
          sg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = sg;
          ctx.fillRect(
            Math.max(0, ox - sr),
            Math.max(0, oy - sr),
            sr * 2,
            sr * 2,
          );
        }
      }

      if (p < 1) {
        requestAnimationFrame(frame);
      } else {
        overlay.remove();
        sidebarContent.style.filter = origFilter;
        sidebarContent.style.transform = origTransform;
        sidebarContent.style.transition = origTransition;
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════════════════════════════════

export function runAgentdropAnimation(
  screenshotUrl?: string,
  scheduledStart?: number,
  originSide: 'left' | 'right' = screenshotUrl ? 'right' : 'left',
): Promise<void> {
  const originUV: [number, number] =
    originSide === 'right' ? [1.0, 0.5] : [0.0, 0.5];

  if (screenshotUrl) {
    return runWebGLAnimation(screenshotUrl, scheduledStart, originUV).catch(
      () => runOverlayAnimation(scheduledStart, originUV),
    );
  }
  return runOverlayAnimation(scheduledStart, originUV);
}
