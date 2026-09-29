export const risoVertexShader = /* glsl */ `#version 300 es
// One full-screen triangle; no vertex buffers.
uniform vec4 uTile; // x, y, width, height of the rendered region in frame units
out vec2 vUv;
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  // y runs downward in product space, matching canvas and scene coordinates.
  vUv = uTile.xy + vec2(corner.x, 1.0 - corner.y) * uTile.zw;
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const risoFragmentShader = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource; // rows top to bottom
uniform vec2 uFrameSize;

uniform float uMode;      // 0 strips, 1 grid, 2 radial
uniform float uVertical;  // strips only
uniform float uPattern;   // 0 wave, 1 random, 2 steps
uniform float uCount;
uniform float uColumns;
uniform float uRows;
uniform float uRings;
uniform float uWedges;
uniform float uAmount;
uniform float uFrequency;
uniform float uGap;
uniform float uSeed;

uniform float uProgress;
uniform float uCycles;
uniform float uInkLag;

uniform float uInkCount;
uniform vec3 uInks[3];
uniform vec3 uSeparation[3];
uniform float uDensity;
uniform float uContrast;

uniform float uScreen;    // 0 grain, 1 halftone, 2 tone
uniform float uCell;
uniform float uGrain;
uniform float uMisregistration;
uniform float uDrift;

const float TAU = 6.28318530718;
const float PI = 3.14159265359;
const float STEPS_PER_CYCLE = 6.0;
const float DRIFT_STEPS = 12.0;

// Sine-free hashes (Dave Hoskins): cheaper than sin() and stable across GPUs.
float hash11(float n) {
  n = fract(n * 0.1031);
  n *= n + 33.33;
  n *= n + n;
  return fract(n);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// Signed per-slice displacement in [-1, 1]. Every pattern repeats exactly once
// per cycle, so a whole number of cycles per loop stitches the last frame to the first.
float sliceWave(float position, float id, float progress) {
  float phase = progress * uCycles;
  if (uPattern < 0.5) {
    return sin(TAU * (uFrequency * position + phase));
  }
  if (uPattern < 1.5) {
    float amplitude = 0.35 + 0.65 * hash11(id * 1.37 + uSeed * 7.1);
    return amplitude * sin(TAU * (hash11(id * 2.71 + uSeed * 3.3) + phase));
  }
  float total = max(1.0, uCycles * STEPS_PER_CYCLE);
  float stepIndex = uCycles > 0.0 ? floor(fract(progress) * total) : 0.0;
  return hash11(id * 13.1 + stepIndex * 7.7 + uSeed * 5.3) * 2.0 - 1.0;
}

// Output pixel size in frame units, set once per fragment.
float gPixel;

// density: slices per frame unit, so the edge softens over about one output pixel.
float gutter(float local, float density) {
  if (uGap <= 0.0) return 1.0;
  float half_ = uGap * 0.5;
  float aa = max(gPixel * density, 1e-4);
  return smoothstep(half_ - aa, half_ + aa, local) * (1.0 - smoothstep(1.0 - half_ - aa, 1.0 - half_ + aa, local));
}

vec2 mirrorWrap(vec2 p) {
  return 1.0 - abs(1.0 - mod(p, 2.0));
}

// Maps an output position (0..1, y down) to the source position it shows.
vec2 sliceSample(vec2 p, float progress, out float mask) {
  if (uMode < 0.5) {
    vec2 q = uVertical > 0.5 ? p.yx : p;
    float index = floor(q.y * uCount);
    mask = gutter(fract(q.y * uCount), uCount);
    q.x = fract(q.x - uAmount * sliceWave(index / uCount, index, progress));
    return uVertical > 0.5 ? q.yx : q;
  }
  if (uMode < 1.5) {
    vec2 cells = vec2(uColumns, uRows);
    vec2 cell = floor(p * cells);
    vec2 local = fract(p * cells);
    float id = cell.y * uColumns + cell.x;
    float position = 0.5 * (cell.x / uColumns + cell.y / uRows);
    bool horizontal = hash11(id * 3.3 + uSeed) > 0.5;
    float offset = uAmount * sliceWave(position, id, progress);
    if (uPattern > 1.5) {
      // Steps move whole tiles, so the grid reads as a shuffle.
      float span = horizontal ? uColumns : uRows;
      offset = floor(offset * span + 0.5) / span;
    }
    mask = gutter(local.x, uColumns) * gutter(local.y, uRows);
    return horizontal ? vec2(fract(p.x - offset), p.y) : vec2(p.x, fract(p.y - offset));
  }
  float aspect = uFrameSize.x / uFrameSize.y;
  vec2 q = (p - 0.5) * vec2(aspect, 1.0);
  float radius = length(q) / length(vec2(aspect, 1.0) * 0.5);
  float angle = atan(q.y, q.x);
  float ringPosition = radius * uRings;
  float ring = floor(ringPosition);
  float wedgePosition = (angle / TAU + 0.5) * uWedges;
  float wedge = floor(wedgePosition);
  float id = ring * uWedges + wedge;
  float ringDensity = uRings / length(vec2(aspect, 1.0) * 0.5);
  float wedgeDensity = uWedges / (TAU * max(length(q), 1e-3));
  mask = gutter(fract(ringPosition), ringDensity) * (uWedges > 1.5 ? gutter(fract(wedgePosition), wedgeDensity) : 1.0);
  // The wave runs out along the rings and around each ring, so wedges turn out of step.
  float turn = uAmount * PI * sliceWave(ring / uRings + wedge / uWedges, id, progress);
  float c = cos(turn);
  float s = sin(turn);
  vec2 rotated = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  return mirrorWrap(rotated / vec2(aspect, 1.0) + 0.5);
}

float contrastCurve(float x) {
  float a = pow(x, uContrast);
  float b = pow(1.0 - x, uContrast);
  return a / max(a + b, 1e-5);
}

float screenInk(float coverage, vec2 px, float ink) {
  if (coverage <= 0.002) return 0.0;
  if (uScreen > 1.5) return coverage;
  if (uScreen > 0.5) {
    float angle = radians(ink < 0.5 ? 15.0 : (ink < 1.5 ? 75.0 : 45.0));
    mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 cell = rotation * px / uCell;
    float distanceToCentre = length(fract(cell) - 0.5);
    float radius = sqrt(coverage) * 0.7072;
    float aa = max(gPixel * max(uFrameSize.x, uFrameSize.y) / uCell, 1e-3);
    return 1.0 - smoothstep(radius - aa, radius + aa, distanceToCentre);
  }
  // Stochastic grain: fine white noise shifted by clumps at the screen size.
  // Adding any field to a uniform variable mod 1 keeps it uniform, so the
  // printed share of each ink still equals its coverage.
  float fine = hash21(floor(px / max(uCell * 0.3, 0.75)) + ink * 31.7);
  float clump = valueNoise(px / uCell + ink * 19.1);
  float threshold = fract(fine + 0.6 * clump);
  return step(threshold, coverage);
}

void main() {
  // Derivatives are taken once here, in uniform control flow.
  gPixel = max(fwidth(vUv.x), fwidth(vUv.y));
  vec2 px = vUv * uFrameSize;
  float driftStep = floor(fract(uProgress) * DRIFT_STEPS);
  vec3 mixed = vec3(1.0);

  for (int k = 0; k < 3; k++) {
    float ink = float(k);
    if (ink >= uInkCount) break;

    float direction = TAU * hash11(ink * 5.1 + uSeed * 1.9);
    vec2 registration = vec2(cos(direction), sin(direction)) * uMisregistration * (0.4 + 0.6 * hash11(ink * 8.3 + uSeed));
    float driftAngle = TAU * hash11(ink * 2.9 + driftStep * 4.1 + uSeed);
    registration += vec2(cos(driftAngle), sin(driftAngle)) * uDrift * max(uMisregistration, 3.0) * hash11(ink + driftStep * 1.3 + uSeed * 0.7);

    vec2 plate = vUv - registration / uFrameSize;
    if (plate.x < 0.0 || plate.y < 0.0 || plate.x > 1.0 || plate.y > 1.0) continue;

    float mask;
    vec2 source = sliceSample(plate, uProgress - ink * uInkLag, mask);
    vec3 color = texture(uSource, source).rgb;
    vec3 absorbance = -log(max(color, vec3(0.02)));

    float coverage = clamp(dot(uSeparation[k], absorbance) * uDensity, 0.0, 1.0);
    coverage = contrastCurve(coverage);
    vec2 platePx = plate * uFrameSize;
    float patch_ = valueNoise(platePx / 90.0 + ink * 11.0);
    float speckle = hash21(floor(platePx * 0.9) + ink * 3.7);
    coverage *= 1.0 - uGrain * (0.45 * patch_ + 0.35 * step(speckle, 0.18 * uGrain + 0.02));
    coverage = screenInk(coverage, platePx, ink) * mask;

    mixed *= pow(max(uInks[k], vec3(0.02)), vec3(coverage));
  }

  // Unmix from paper white so the foreground stays transparent over the
  // runtime background and reproduces the ink colours exactly on white.
  vec3 darkness = 1.0 - mixed;
  float alpha = max(darkness.r, max(darkness.g, darkness.b));
  vec3 rgb = alpha > 1e-4 ? 1.0 - darkness / alpha : vec3(0.0);
  fragColor = vec4(rgb, alpha);
}
`;
