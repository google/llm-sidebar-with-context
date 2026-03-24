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

const DURATION = 3800;

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
uniform vec2  uOrigin;

float ss(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float bell(float x, float c, float s) {
  float d = (x - c) / s;
  return exp(-0.5 * d * d);
}

void main() {
  vec2 uv = vUV;
  float p = uProgress;
  float aspect = uResolution.x / uResolution.y;
  vec2 ar = vec2(aspect, 1.0);

  vec2 toGZ = (uOrigin - uv) * ar;
  float distGZ = length(toGZ);
  vec2 dirGZ = distGZ > 0.001 ? toGZ / distGZ : vec2(0.0);
  float maxD = length(ar);

  // Approach direction: ball comes from opposite side of origin
  float approachSign = (uOrigin.x > 0.5) ? -1.0 : 1.0;

  // ════════════════════════════════════════════════════════════════
  // 1. DISTORTION BALL — RGB hue-shift sphere traveling toward GZ
  //    Visible p=0..0.45. Localized effect — rest of page is CLEAN.
  // ════════════════════════════════════════════════════════════════

  float ballT = clamp(p / 0.45, 0.0, 1.0);
  float ballTSmooth = ballT * ballT * (3.0 - 2.0 * ballT);
  // Ball starts far from GZ, arrives at GZ at p=0.45
  float ballDistFromGZ = (1.0 - ballTSmooth) * 0.7;
  vec2 ballPos = uOrigin + vec2(approachSign * ballDistFromGZ / aspect, 0.0);
  float ballRadius = 0.08;
  float ballVisible = 1.0 - ss(0.42, 0.48, p);

  vec2 toBall = (uv - ballPos) * ar;
  float ballD = length(toBall);

  // Ball refraction: localized lens distortion inside the ball
  vec2 ballDisp = vec2(0.0);
  float ballBlur = 0.0;
  if (ballD < ballRadius && ballVisible > 0.0) {
    float nd = ballD / ballRadius;
    float refract = (1.0 - nd * nd) * 0.012 * ballVisible;
    vec2 bDir = ballD > 0.001 ? toBall / ballD : vec2(0.0);
    ballDisp = bDir * refract / ar;
    // Slight blur inside ball
    ballBlur = (1.0 - nd) * ballVisible * 0.004;
  }

  // ════════════════════════════════════════════════════════════════
  // 2. SUPERNOVA — small white flash at GZ when ball arrives
  //    Peaks at p=0.48, small radius. NOT full-page.
  // ════════════════════════════════════════════════════════════════

  float novaEnv = bell(p, 0.48, 0.08); // tight bell — fast flash
  float novaRadius = 0.08 + novaEnv * 0.04; // SMALL radius

  // Localized pull ONLY near GZ during nova (not whole page)
  float novaPull = novaEnv * 0.015;
  float novaPullFalloff = exp(-distGZ * 8.0 / maxD); // very localized
  vec2 novaDisp = dirGZ * novaPull * novaPullFalloff;

  // Localized blur near GZ during nova
  float novaBlur = novaEnv * novaPullFalloff * 0.006;

  // ════════════════════════════════════════════════════════════════
  // 3. RIPPLE WAVE — single expanding ring AFTER the explosion
  //    Starts at p=0.50, expands outward from GZ.
  // ════════════════════════════════════════════════════════════════

  float rippleT = clamp((p - 0.50) / 0.40, 0.0, 1.0);
  float rippleSmooth = rippleT * rippleT * (3.0 - 2.0 * rippleT);
  float rippleRadius = rippleSmooth * maxD * 1.2;
  float rippleWidth = 0.04 + rippleT * 0.03;

  // Distance from the ripple ring
  float ringDist = abs(distGZ - rippleRadius);
  float rippleStrength = 0.0;
  if (rippleT > 0.0 && rippleT < 1.0) {
    rippleStrength = exp(-ringDist * ringDist / (rippleWidth * rippleWidth))
                   * (1.0 - rippleT);
  }

  // Ripple displacement: push pixels outward at the wavefront
  vec2 rippleDisp = -dirGZ * rippleStrength * 0.012;

  // Ripple blur: localized to the ring
  float rippleBlur = rippleStrength * 0.005;

  // ════════════════════════════════════════════════════════════════
  // COMPOSE — all displacements are LOCALIZED, page stays clean
  // ════════════════════════════════════════════════════════════════

  vec2 totalDisp = ballDisp + novaDisp + rippleDisp;
  vec2 sampleUV = uv + totalDisp;
  float totalBlur = ballBlur + novaBlur + rippleBlur;

  vec3 color = vec3(0.0);

  if (totalBlur > 0.0005) {
    vec2 blurDir = length(totalDisp) > 0.0001
                 ? normalize(totalDisp) : vec2(1.0, 0.0);
    vec2 perpDir = vec2(-blurDir.y, blurDir.x);
    float totalW = 0.0;
    for (int i = -3; i <= 3; i++) {
      float fi = float(i);
      float w = exp(-fi * fi * 0.25);
      vec2 off = blurDir * fi * totalBlur
               + perpDir * fi * totalBlur * 0.3;
      color += texture(uPage, clamp(sampleUV + off, 0.0, 1.0)).rgb * w;
      totalW += w;
    }
    color /= totalW;
  } else {
    color = texture(uPage, clamp(sampleUV, 0.0, 1.0)).rgb;
  }

  // ════════════════════════════════════════════════════════════════
  // VISUAL EFFECTS — all localized
  // ════════════════════════════════════════════════════════════════

  // Ball: RGB hue shift inside the sphere
  if (ballD < ballRadius * 1.1 && ballVisible > 0.05) {
    float nd = ballD / ballRadius;
    float hueAmt = (1.0 - nd) * 0.15 * ballVisible;
    float cosH = cos(hueAmt * 6.28318);
    float sinH = sin(hueAmt * 6.28318);
    vec3 shifted = vec3(
      dot(color, vec3(0.667+cosH*0.333, 0.333-cosH*0.333+sinH*0.577, 0.333-cosH*0.333-sinH*0.577)),
      dot(color, vec3(0.333-cosH*0.333-sinH*0.577, 0.667+cosH*0.333, 0.333-cosH*0.333+sinH*0.577)),
      dot(color, vec3(0.333-cosH*0.333+sinH*0.577, 0.333-cosH*0.333-sinH*0.577, 0.667+cosH*0.333))
    );
    float edgeSoft = ss(ballRadius, ballRadius * 0.8, ballD);
    color = mix(color, shifted, edgeSoft * ballVisible * 0.6);

    // Subtle rim highlight on ball edge
    float rim = ss(ballRadius * 0.75, ballRadius, ballD) * (1.0 - ss(ballRadius, ballRadius * 1.1, ballD));
    color += vec3(0.5, 0.6, 1.0) * rim * ballVisible * 0.2;
  }

  // Supernova: small white glow at GZ
  if (novaEnv > 0.01) {
    float novaF = exp(-distGZ * distGZ / (novaRadius * novaRadius));
    color = mix(color, vec3(1.0), clamp(novaF * novaEnv * 1.5, 0.0, 0.9));
  }

  // Ripple ring: subtle chromatic fringe at the wavefront
  if (rippleStrength > 0.02) {
    // Rainbow hue varies with angle
    float angle = atan(toGZ.y, toGZ.x);
    float hue = fract(angle / 6.28318 + p * 0.3);
    vec3 rainbow;
    float h6 = hue * 6.0;
    rainbow.r = clamp(abs(h6 - 3.0) - 1.0, 0.0, 1.0);
    rainbow.g = clamp(2.0 - abs(h6 - 2.0), 0.0, 1.0);
    rainbow.b = clamp(2.0 - abs(h6 - 4.0), 0.0, 1.0);
    rainbow = mix(vec3(1.0), rainbow, 0.4); // pastel
    color += rainbow * rippleStrength * 0.15;
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

      const bellJS = (x: number, c: number, s: number) =>
        Math.exp(-0.5 * ((x - c) / s) ** 2);

      const approachDir = originUV[0] < 0.5 ? 1 : -1;

      // ── 1. Distortion ball traveling toward GZ ──
      const ballT = Math.min(p / 0.45, 1);
      const ballSmooth = ballT * ballT * (3 - 2 * ballT);
      const ballDistPx = (1 - ballSmooth) * w * 0.35;
      const bx = ox + approachDir * ballDistPx;
      const by = oy;
      const br = 30;
      const ballVis = 1 - smoothstep(0.42, 0.48, p);

      if (ballVis > 0.05) {
        // RGB hue-shifted translucent ball
        const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        bg.addColorStop(0, `rgba(180, 160, 255, ${0.12 * ballVis})`);
        bg.addColorStop(0.5, `rgba(160, 200, 255, ${0.06 * ballVis})`);
        bg.addColorStop(0.85, `rgba(120, 180, 220, ${0.03 * ballVis})`);
        bg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(bx, by, br * 1.2, 0, Math.PI * 2);
        ctx.fill();
        // Rim
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(150, 180, 255, ${0.25 * ballVis})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // ── 2. Localized blur ONLY near ball + GZ ──
      const novaEnv = bellJS(p, 0.48, 0.08);
      const blurPx = novaEnv * 6; // small, localized
      sidebarContent.style.filter = blurPx > 0.3 ? `blur(${blurPx}px)` : '';
      // Small pull toward GZ during nova only
      const pullPx = novaEnv * 8 * (originUV[0] < 0.5 ? 1 : -1);
      sidebarContent.style.transform =
        Math.abs(pullPx) > 0.3 ? `translateX(${pullPx}px)` : '';

      // ── 3. Small supernova flash at GZ ──
      if (novaEnv > 0.01) {
        const nr = 25 + novaEnv * 15; // SMALL
        const ng = ctx.createRadialGradient(ox, oy, 0, ox, oy, nr);
        ng.addColorStop(0, `rgba(255, 255, 255, ${novaEnv * 0.9})`);
        ng.addColorStop(0.5, `rgba(255, 252, 248, ${novaEnv * 0.3})`);
        ng.addColorStop(1, 'rgba(255, 250, 245, 0)');
        ctx.fillStyle = ng;
        ctx.fillRect(
          Math.max(0, ox - nr),
          Math.max(0, oy - nr),
          nr * 2,
          nr * 2,
        );
      }

      // ── 4. Ripple wave expanding outward from GZ ──
      const rippleT = Math.max(0, (p - 0.5) / 0.4);
      if (rippleT > 0 && rippleT < 1) {
        const rippleSmooth = rippleT * rippleT * (3 - 2 * rippleT);
        const ringR = rippleSmooth * Math.max(w, h) * 0.8;
        const ringW = 4 + (1 - rippleT) * 12;
        const ringAlpha = (1 - rippleT) * 0.4;

        // Rainbow ring
        for (let a = 0; a < Math.PI * 2; a += 0.04) {
          const hue = ((a / (Math.PI * 2)) * 360 + p * 180) % 360;
          const x1 = ox + Math.cos(a) * ringR;
          const y1 = oy + Math.sin(a) * ringR;
          const x2 = ox + Math.cos(a + 0.05) * ringR;
          const y2 = oy + Math.sin(a + 0.05) * ringR;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = `hsla(${hue}, 70%, 75%, ${ringAlpha})`;
          ctx.lineWidth = ringW;
          ctx.stroke();
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
