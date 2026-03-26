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
uniform vec2  uOrigin;

float ss(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float bell(float x, float c, float s) {
  float d = (x - c) / s;
  return exp(-0.5 * d * d);
}

// Simple hash for organic noise
float hash(float n) { return fract(sin(n * 127.1) * 43758.5); }

// Damped spring: fast attack, overshoots, settles. omega=frequency, zeta=damping
float dampedSpring(float t, float omega, float zeta) {
  if (t <= 0.0) return 0.0;
  float wd = omega * sqrt(1.0 - zeta * zeta);
  return 1.0 - exp(-zeta * omega * t) * cos(wd * t);
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

  float approachSign = (uOrigin.x > 0.5) ? -1.0 : 1.0;

  vec2 totalDisp = vec2(0.0);
  float totalBlur = 0.0;

  float impactTime = 0.40;

  // ════════════════════════════════════════════════════════════════
  // SUPERNOVA BEACON — glows from the START (preboom.png)
  // Starts dim at p=0, grows brighter as ball approaches.
  // At impact, reaches max brightness.
  // ════════════════════════════════════════════════════════════════

  // Pre-impact: supernova beacon growing at GZ
  float beaconGlow = ss(0.0, impactTime, p); // 0→1 during approach
  // Post-impact: main flash then recession pulse
  float novaPulse = 0.0;
  float novaPhase = (p - impactTime) / 0.20;
  if (novaPhase > 0.0 && novaPhase < 1.0) {
    novaPulse = exp(-pow(novaPhase - 0.15, 2.0) / 0.01)
              - exp(-pow(novaPhase - 0.5, 2.0) / 0.008) * 0.5
              + exp(-pow(novaPhase - 0.78, 2.0) / 0.012) * 0.2;
    novaPulse = max(0.0, novaPulse);
  }
  // Combined supernova intensity: beacon pre-impact + flash post-impact
  float novaI = beaconGlow * 0.4 + novaPulse;
  float novaRadius = 0.06 + beaconGlow * 0.04 + novaPulse * 0.06;

  // Wave distortion near GZ — visible even during approach (boom.jpg)
  float waveT = ss(0.15, impactTime, p);
  float waveFalloff = exp(-distGZ * 4.0 / maxD);
  float waveDisp = sin(distGZ * 40.0 - p * 20.0) * waveT * waveFalloff * 0.006;
  totalDisp += dirGZ * waveDisp;

  // ════════════════════════════════════════════════════════════════
  // DISTORTION BALL — subtle RGB circle approaching GZ
  // ════════════════════════════════════════════════════════════════

  float ballT = clamp(p / impactTime, 0.0, 1.0);
  float ballEase = ballT * ballT * (3.0 - 2.0 * ballT * ballT);
  float ballDistFromGZ = (1.0 - ballEase) * 0.55;
  vec2 ballPos = uOrigin + vec2(approachSign * ballDistFromGZ / aspect, 0.0);
  float ballRadius = 0.07;
  float ballVisible = 1.0 - ss(impactTime - 0.02, impactTime + 0.03, p);

  vec2 toBall = (uv - ballPos) * ar;
  float ballD = length(toBall);

  // Subtle refraction inside ball
  if (ballD < ballRadius && ballVisible > 0.0) {
    float nd = ballD / ballRadius;
    float refract = (1.0 - nd * nd) * 0.008 * ballVisible;
    vec2 bDir = ballD > 0.001 ? toBall / ballD : vec2(0.0);
    totalDisp += bDir * refract / ar;
  }

  // Minor blur at top during approach (preboom.png annotation)
  float topBlurT = ss(0.10, impactTime, p) * (1.0 - ss(impactTime, impactTime + 0.1, p));
  float topWeight = max(0.0, 1.0 - uv.y * 1.5); // fades below top third
  totalBlur += topBlurT * topWeight * 0.006;

  // ════════════════════════════════════════════════════════════════
  // POST-IMPACT: proximity ripple (postboom.jpg)
  // Single distortion band sweeping outward from GZ
  // ════════════════════════════════════════════════════════════════

  float rippleStart = impactTime + 0.02;
  float rippleT = clamp((p - rippleStart) / 0.35, 0.0, 1.0);
  if (rippleT > 0.0 && rippleT < 1.0) {
    float rippleRadius = dampedSpring(rippleT, 6.0, 0.5) * maxD * 1.1;
    float rippleWidth = 0.05 + rippleT * 0.04;
    float ringDist = abs(distGZ - rippleRadius);
    float rippleStrength = exp(-ringDist * ringDist / (rippleWidth * rippleWidth))
                         * (1.0 - rippleT);
    // Content bends at the wavefront
    totalDisp += -dirGZ * rippleStrength * 0.015;
    totalBlur += rippleStrength * 0.004;
  }

  // ════════════════════════════════════════════════════════════════
  // POST-BOOM: blur WHOLE PAGE, supernova area stays CLEAR
  // (postboomt2.jpg — "blur whole page" + "supernova clearer than page")
  // ════════════════════════════════════════════════════════════════

  float postBoomBlur = ss(impactTime, impactTime + 0.15, p) * (1.0 - ss(0.85, 1.0, p));
  // Whole page gets blurred
  totalBlur += postBoomBlur * 0.015;
  // BUT supernova area SUBTRACTS blur — stays sharp/clear
  float novaClearZone = exp(-distGZ * distGZ / (novaRadius * novaRadius * 4.0 + 0.001));
  totalBlur -= novaClearZone * postBoomBlur * 0.018;
  totalBlur = max(0.0, totalBlur);

  // Lens warp that grows from GZ after impact
  float lensStart = impactTime + 0.05;
  float lensRaw = clamp((p - lensStart) / 0.50, 0.0, 1.0);
  float lensT = lensRaw > 0.0 ? dampedSpring(lensRaw, 8.0, 0.35) : 0.0;
  float lensFade = 1.0 - ss(0.88, 1.0, p);
  float lensAngle = atan(toGZ.y, toGZ.x);
  float blobNoise = hash(floor(lensAngle * 5.0)) * 0.10 - 0.05;
  float lensRadius = lensT * maxD * (0.85 + blobNoise);

  if (distGZ < lensRadius && lensT > 0.0) {
    float nd = distGZ / max(lensRadius, 0.001);
    float yOffset = (uOrigin.y - uv.y);
    float asymmetry = 1.0 + clamp(yOffset * 2.0, -0.3, 0.8);
    float barrelShape = (1.0 - nd * nd) * (1.0 - nd * 0.3);
    float wobble = 1.0 + sin(lensAngle * 3.0 + p * 8.0) * 0.06;
    float barrelStrength = barrelShape * lensT * lensFade * 0.03 * asymmetry * wobble;
    totalDisp += -dirGZ * barrelStrength;
  }

  // Impact screen-shake
  float shakeEnv = bell(p, impactTime + 0.01, 0.015);
  totalDisp += vec2(sin(p * 200.0) * 0.003, cos(p * 170.0) * 0.002) * shakeEnv;

  // Snap-back at end
  if (p > 0.92) {
    float snapT = (p - 0.92) / 0.08;
    totalDisp *= 1.0 + sin(snapT * 3.14159) * 0.005 * (1.0 - snapT) * 3.0;
  }

  // ════════════════════════════════════════════════════════════════
  // SAMPLE with blur
  // ════════════════════════════════════════════════════════════════

  vec2 sampleUV = uv + totalDisp;
  vec3 color = vec3(0.0);

  if (totalBlur > 0.0005) {
    vec2 blurDir = length(totalDisp) > 0.0001
                 ? normalize(totalDisp) : vec2(0.0, 1.0);
    vec2 perpDir = vec2(-blurDir.y, blurDir.x);
    float totalW = 0.0;
    for (int i = -5; i <= 5; i++) {
      float fi = float(i);
      float w = exp(-fi * fi * 0.16);
      vec2 off = blurDir * fi * totalBlur + perpDir * fi * totalBlur * 0.25;
      color += texture(uPage, clamp(sampleUV + off, 0.0, 1.0)).rgb * w;
      totalW += w;
    }
    color /= totalW;
  } else {
    color = texture(uPage, clamp(sampleUV, 0.0, 1.0)).rgb;
  }

  // ════════════════════════════════════════════════════════════════
  // VISUAL EFFECTS
  // ════════════════════════════════════════════════════════════════

  // Ball: subtle RGB colored circle overlay — NOT heavy distortion
  // Just a thin colored tint circle that moves across the page
  if (ballD < ballRadius * 1.15 && ballVisible > 0.05) {
    float nd = ballD / ballRadius;
    float edgeSoft = 1.0 - ss(ballRadius * 0.85, ballRadius * 1.1, ballD);

    // RGB tint: red on one side, green center, blue on other side
    float angle = atan(toBall.y, toBall.x);
    vec3 rgbTint = vec3(
      0.5 + 0.5 * cos(angle),              // R
      0.5 + 0.5 * cos(angle + 2.094),      // G (120 deg offset)
      0.5 + 0.5 * cos(angle + 4.189)       // B (240 deg offset)
    );
    // Very subtle overlay — just enough to see the circle
    color += rgbTint * edgeSoft * ballVisible * 0.08;

    // Thin rim line
    float rim = ss(ballRadius*0.88, ballRadius, ballD)
              * (1.0 - ss(ballRadius, ballRadius*1.08, ballD));
    color += vec3(0.6, 0.7, 1.0) * rim * ballVisible * 0.2;
  }

  // Supernova beacon + flash — glows from START, peaks at impact
  // (preboom.png: "supernova emitting as soon as distortion ball starts")
  if (novaI > 0.01) {
    vec2 novaD = (uv - uOrigin) * ar * vec2(1.0, 2.0);
    float novaDist = length(novaD);

    // White-hot core
    float coreR = novaRadius * 0.4;
    float coreF = exp(-novaDist * novaDist / (coreR * coreR + 0.0001));
    color = mix(color, vec3(1.0), clamp(coreF * novaI * 2.5, 0.0, 0.98));

    // Warm bloom
    float bloomR = novaRadius * 1.0;
    float bloomF = exp(-novaDist * novaDist / (bloomR * bloomR + 0.0001));
    color = mix(color, vec3(1.0, 0.97, 0.93), clamp(bloomF * novaI * 0.8, 0.0, 0.6));

    // Red/pink lip
    float lipR = novaRadius * 0.75;
    float lipDist2 = abs(novaDist - lipR);
    float lipF = exp(-lipDist2 * lipDist2 / (0.004 + 0.002 * novaRadius));
    float lipVal = lipF * novaI * 0.5;
    color += vec3(0.85, 0.12, 0.22) * lipVal;
    color += vec3(0.65, 0.08, 0.35) * lipVal * 0.3;

    // Soft outer haze
    float hazeR = novaRadius * 2.2;
    float hazeF = exp(-novaDist * novaDist / (hazeR * hazeR));
    color += vec3(1.0, 0.94, 0.96) * hazeF * novaI * 0.08;
  }

  // Purple/blue hue shift inside lens — FIX 12: concentrated at top
  if (distGZ < lensRadius && lensT > 0.0) {
    float nd = distGZ / max(lensRadius, 0.001);
    float yOffset = (uOrigin.y - uv.y);
    float asymHue = 1.0 + clamp(yOffset * 1.5, -0.2, 0.6);
    // Stronger at top of screen, fades toward bottom
    float topHueWeight = (1.0 - uv.y) * (1.0 - uv.y); // quadratic
    // FIX 23: hue builds gradually — squared raw gives gentle ramp
    float hueProgress = lensRaw * lensRaw; // slow start, strong finish
    float hueInside = (1.0 - nd * 0.5) * hueProgress * lensFade * 0.10 * asymHue * (0.3 + topHueWeight * 0.7);
    float cosH2 = cos(hueInside * 6.28318);
    float sinH2 = sin(hueInside * 6.28318);
    vec3 shifted2 = vec3(
      dot(color, vec3(0.667+cosH2*0.333, 0.333-cosH2*0.333+sinH2*0.577, 0.333-cosH2*0.333-sinH2*0.577)),
      dot(color, vec3(0.333-cosH2*0.333-sinH2*0.577, 0.667+cosH2*0.333, 0.333-cosH2*0.333+sinH2*0.577)),
      dot(color, vec3(0.333-cosH2*0.333+sinH2*0.577, 0.333-cosH2*0.333-sinH2*0.577, 0.667+cosH2*0.333))
    );
    color = mix(color, shifted2, lensT * lensFade * 0.35);
  }

  // Rainbow fringe at lens edge
  if (fringeStrength > 0.02) {
    float angle = atan(toGZ.y, toGZ.x);
    float hue = fract(angle / 6.28318 + p * 0.4);
    vec3 rainbow;
    float h6 = hue * 6.0;
    rainbow.r = clamp(abs(h6 - 3.0) - 1.0, 0.0, 1.0);
    rainbow.g = clamp(2.0 - abs(h6 - 2.0), 0.0, 1.0);
    rainbow.b = clamp(2.0 - abs(h6 - 4.0), 0.0, 1.0);
    rainbow = mix(vec3(1.0), rainbow, 0.45);
    color += rainbow * fringeStrength * 0.28; // FIX 24: more visible fringe
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

    // Apply blur/transform to sidebar content container
    const sidebarContent = (document.querySelector('.container') ||
      document.body.firstElementChild ||
      document.body) as HTMLElement;
    const origFilter = sidebarContent.style.filter;
    const origTransform = sidebarContent.style.transform;
    const origTransition = sidebarContent.style.transition;
    // No transition delay — update every frame for tight sync
    sidebarContent.style.transition = 'none';

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

      const approachDir = originUV[0] < 0.5 ? 1 : -1;
      const impactTime = 0.4; // matches shader

      // ── 1. Distortion ball — accelerating toward GZ ──
      const ballT = Math.min(p / impactTime, 1);
      const ballEase = ballT * ballT * (3 - 2 * ballT * ballT);
      const ballSpeed = ballEase * 2;
      const ballDistPx = (1 - ballEase) * w * 0.35;
      const bx = ox + approachDir * ballDistPx;
      const by = oy;
      const br = 28 + (1 - ballEase) * 5;
      // Tighter overlap — ball fades INTO nova
      const ballVis = 1 - smoothstep(impactTime - 0.02, impactTime + 0.03, p);

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

      // ── Ball wake: blur trail ──
      if (p < impactTime + 0.05 && ballVis > 0.1) {
        const wakeLen = ballSpeed * 25;
        if (wakeLen > 3) {
          const wx = bx - approachDir * wakeLen;
          const wg = ctx.createLinearGradient(bx, by, wx, by);
          wg.addColorStop(
            0,
            `rgba(180, 190, 255, ${ballSpeed * ballVis * 0.08})`,
          );
          wg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.strokeStyle = wg;
          ctx.lineWidth = br * 0.6;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(wx, by);
          ctx.stroke();
        }
      }

      // ── Pre-impact tension: content near GZ pulls ──
      const tensionT =
        smoothstep(0.25, impactTime, p) *
        (1 - smoothstep(impactTime, impactTime + 0.1, p));

      // ── 2. Supernova beacon — glows from START, peaks at impact ──
      const beaconGlow = smoothstep(0.0, impactTime, p);
      const novaPhase = (p - impactTime) / 0.2;
      let novaPulse = 0;
      if (novaPhase > 0 && novaPhase < 1) {
        const d1 = novaPhase - 0.15;
        const d2 = novaPhase - 0.5;
        const d3 = novaPhase - 0.78;
        novaPulse = Math.max(
          0,
          Math.exp(-(d1 * d1) / 0.01) -
            Math.exp(-(d2 * d2) / 0.008) * 0.5 +
            Math.exp(-(d3 * d3) / 0.012) * 0.2,
        );
      }
      const novaI = beaconGlow * 0.4 + novaPulse;
      const novaRadius = 20 + beaconGlow * 12 + novaPulse * 18;
      if (novaI > 0.02) {
        // White core — HOT, small, bright
        const coreR = 15 + novaI * 8;
        const coreG = ctx.createRadialGradient(ox, oy, 0, ox, oy, coreR);
        coreG.addColorStop(
          0,
          `rgba(255, 255, 255, ${Math.min(novaI * 1.5, 1)})`,
        );
        coreG.addColorStop(0.5, `rgba(255, 252, 250, ${novaI * 0.8})`);
        coreG.addColorStop(1, 'rgba(255, 248, 245, 0)');
        ctx.fillStyle = coreG;
        ctx.fillRect(ox - coreR, oy - coreR * 1.3, coreR * 2, coreR * 2.6);

        // Red/pink lip around the core
        const lipR = novaRadius * 0.9;
        const lipG = ctx.createRadialGradient(
          ox,
          oy,
          coreR * 0.5,
          ox,
          oy,
          lipR,
        );
        lipG.addColorStop(0, 'rgba(255, 50, 80, 0)');
        lipG.addColorStop(0.4, `rgba(230, 40, 70, ${novaI * 0.35})`);
        lipG.addColorStop(0.7, `rgba(200, 30, 100, ${novaI * 0.2})`);
        lipG.addColorStop(1, 'rgba(180, 20, 120, 0)');
        ctx.fillStyle = lipG;
        ctx.fillRect(ox - lipR, oy - lipR, lipR * 2, lipR * 2);

        // Lens flare spikes — 4 lines radiating from center
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const spikeLen = 20 + novaI * 30;
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2 + 0.3; // rotated 17deg
          const sx = Math.cos(angle) * spikeLen;
          const sy = Math.sin(angle) * spikeLen;
          const sg = ctx.createLinearGradient(ox, oy, ox + sx, oy + sy);
          sg.addColorStop(0, `rgba(255, 255, 255, ${novaI * 0.7})`);
          sg.addColorStop(0.3, `rgba(255, 220, 240, ${novaI * 0.3})`);
          sg.addColorStop(1, 'rgba(255, 200, 230, 0)');
          ctx.strokeStyle = sg;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(ox - sx * 0.1, oy - sy * 0.1);
          ctx.lineTo(ox + sx, oy + sy);
          ctx.stroke();
          // Opposite direction
          ctx.beginPath();
          ctx.moveTo(ox + sx * 0.1, oy + sy * 0.1);
          ctx.lineTo(ox - sx, oy - sy);
          ctx.stroke();
        }
        ctx.restore();

        // Outer warm haze
        const hazeR = lipR * 1.5;
        const hazeG = ctx.createRadialGradient(ox, oy, 0, ox, oy, hazeR);
        hazeG.addColorStop(0, `rgba(255, 250, 252, ${novaI * 0.06})`);
        hazeG.addColorStop(1, 'rgba(255, 245, 248, 0)');
        ctx.fillStyle = hazeG;
        ctx.fillRect(ox - hazeR, oy - hazeR, hazeR * 2, hazeR * 2);
      }

      // ── 3. Convex lens bubble — damped spring (matches shader) ──
      const lensStart = impactTime + 0.05;
      const lensRaw = Math.max(0, Math.min(1, (p - lensStart) / 0.5));
      // Damped spring: omega=8, zeta=0.35
      const dampedSpringJS = (t: number) => {
        if (t <= 0) return 0;
        const wd = 8 * Math.sqrt(1 - 0.35 * 0.35);
        return 1 - Math.exp(-0.35 * 8 * t) * Math.cos(wd * t);
      };
      const lensEase = dampedSpringJS(lensRaw);
      const overshoot = 0; // spring handles the overshoot internally
      const lensT = Math.max(0, lensEase + overshoot);
      const lensFade = 1 - smoothstep(0.9, 1.0, p);
      const lensR = lensT * Math.max(w, h) * 0.6;

      // Post-impact: blur WHOLE sidebar (postboomt2.jpg)
      const postBoomBlur =
        smoothstep(impactTime, impactTime + 0.15, p) *
        (1 - smoothstep(0.85, 1.0, p));
      const blurPx = postBoomBlur * 10 + lensT * lensFade * 3;
      const pullPx =
        (tensionT * 6 + lensT * lensFade * 6) * (originUV[0] < 0.5 ? 1 : -1);
      sidebarContent.style.filter = blurPx > 0.3 ? `blur(${blurPx}px)` : '';
      sidebarContent.style.transform =
        Math.abs(pullPx) > 0.3 ? `translateX(${pullPx}px)` : '';

      // Purple/blue hue tint inside the lens bubble
      if (lensT > 0.01 && lensR > 5) {
        const lg = ctx.createRadialGradient(ox, oy, 0, ox, oy, lensR);
        lg.addColorStop(0, `rgba(140, 120, 200, ${lensT * lensFade * 0.12})`);
        lg.addColorStop(0.6, `rgba(120, 140, 210, ${lensT * lensFade * 0.06})`);
        lg.addColorStop(0.9, 'rgba(0,0,0,0)');
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(ox, oy, lensR, 0, Math.PI * 2);
        ctx.fill();

        // Rainbow chromatic fringe at the lens EDGE (wavefront)
        if (lensR > 20) {
          const edgeW = 3 + (1 - lensT) * 8;
          for (let a = 0; a < Math.PI * 2; a += 0.05) {
            const hue = ((a / (Math.PI * 2)) * 360 + p * 180) % 360;
            const x1 = ox + Math.cos(a) * lensR;
            const y1 = oy + Math.sin(a) * lensR;
            const x2 = ox + Math.cos(a + 0.06) * lensR;
            const y2 = oy + Math.sin(a + 0.06) * lensR;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = `hsla(${hue}, 65%, 72%, ${lensT * lensFade * 0.3})`;
            ctx.lineWidth = edgeW;
            ctx.stroke();
          }
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
//  Self-capture: screenshot the current page via SVG foreignObject
//  Used by the sidebar to capture its own content for WebGL warp.
// ═══════════════════════════════════════════════════════════════════════════

function _captureSelf(): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Serialize the entire document into an SVG foreignObject
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    // Remove any existing animation overlays from the clone
    clone.querySelectorAll('#agentdrop-overlay').forEach((el) => el.remove());

    const serialized = new XMLSerializer().serializeToString(clone);
    const svgData =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<foreignObject width="100%" height="100%">${serialized}</foreignObject>` +
      `</svg>`;

    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Self-capture failed'));
    };
    img.src = url;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Both page and sidebar now use the same WebGL2 shader for full per-pixel warp.
 * - Page: screenshotUrl provided by background via captureVisibleTab()
 * - Sidebar: self-captures via SVG foreignObject, then same shader
 * Falls back to Canvas 2D overlay if WebGL2 or capture fails.
 */
export function runAgentdropAnimation(
  screenshotUrl?: string,
  scheduledStart?: number,
  originSide: 'left' | 'right' = screenshotUrl ? 'right' : 'left',
): Promise<void> {
  const originUV: [number, number] =
    originSide === 'right' ? [1.0, 0.5] : [0.0, 0.5];

  if (screenshotUrl) {
    // Page mode: WebGL2 warp on captured screenshot
    return runWebGLAnimation(screenshotUrl, scheduledStart, originUV).catch(
      () => runOverlayAnimation(scheduledStart, originUV),
    );
  }

  // Sidebar mode: use overlay directly — applies CSS blur/transform to
  // the real sidebar DOM. SVG foreignObject capture is unreliable in
  // extension contexts, so we skip it and go straight to overlay which
  // gives us direct control over the sidebar content.
  return runOverlayAnimation(scheduledStart, originUV);
}
