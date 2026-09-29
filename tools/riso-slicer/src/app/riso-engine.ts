import type { ToolcraftProductExportFrameContext } from "@/toolcraft/runtime";

import type { RisoSettings } from "./riso-params";
import { hexToRgb, inkSeparationMatrix } from "./riso-separation";
import { risoFragmentShader, risoVertexShader } from "./riso-shaders";
import type { RisoPixels } from "./riso-source";

export type RisoFrame = Readonly<{
  settings: RisoSettings;
  /** Timeline loop progress in [0, 1]. */
  progress: number;
  /** Product frame size in scene pixels; screen and misregistration sizes are measured in it. */
  frameWidth: number;
  frameHeight: number;
}>;

/** Prepared source pixels, keyed by what produced them. */
export type RisoSource = Readonly<{ key: string; pixels: RisoPixels }>;

export type RisoEngine = Readonly<{
  isBoundTo: (canvas: HTMLCanvasElement) => boolean;
  setSource: (source: RisoSource | null) => void;
  sourceKey: () => string | null;
  draw: (frame: RisoFrame, width: number, height: number) => void;
  /** Paints the frame into the runtime's export context; the live preview canvas is untouched. */
  exportFrame: (frame: RisoFrame, request: ToolcraftProductExportFrameContext) => void;
  dispose: () => void;
}>;

/**
 * Export renders in tiles so 8K output never needs one oversized drawing buffer.
 * 2048 is the smallest MAX_TEXTURE_SIZE WebGL2 allows, so a tile always fits.
 */
export const risoExportTileSize = 2048;

const modeIndex = { strips: 0, grid: 1, radial: 2 } as const;
const patternIndex = { wave: 0, random: 1, steps: 2 } as const;
const screenIndex = { grain: 0, halftone: 1, tone: 2 } as const;

const floatUniforms = [
  "uMode", "uVertical", "uPattern", "uCount", "uColumns", "uRows", "uRings", "uWedges", "uAmount",
  "uFrequency", "uGap", "uSeed", "uProgress", "uCycles", "uInkLag", "uInkCount", "uDensity",
  "uContrast", "uScreen", "uCell", "uGrain", "uMisregistration", "uDrift",
] as const;
type FloatUniform = (typeof floatUniforms)[number];

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create a WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Riso shader failed to compile: ${log ?? "unknown error"}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext): WebGLProgram {
  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, risoVertexShader);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, risoFragmentShader);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Riso shader failed to link: ${log ?? "unknown error"}`);
  }
  return program;
}

function uploadPixels(gl: WebGL2RenderingContext, width: number, height: number, data: Uint8ClampedArray<ArrayBuffer>) {
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
}

/** Paints the top-left `width`×`height` of the render surface into a rectangle of `context`. */
function paintTile(
  context: CanvasRenderingContext2D,
  surface: OffscreenCanvas,
  width: number,
  height: number,
  rect: Readonly<{ x: number; y: number; width: number; height: number }>,
) {
  context.drawImage(surface, 0, 0, width, height, rect.x, rect.y, rect.width, rect.height);
}

export function createRisoEngine(canvas: HTMLCanvasElement): RisoEngine {
  const view = canvas.getContext("bitmaprenderer");
  if (!view) throw new Error("Canvas bitmap presentation is unavailable.");
  // WebGL renders offscreen; the preview and every export tile are painted from this surface.
  const surface = new OffscreenCanvas(1, 1);
  const gl = surface.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 is unavailable.");
  return buildEngine(canvas, view, surface, gl);
}

function buildEngine(canvas: HTMLCanvasElement, view: ImageBitmapRenderingContext, surface: OffscreenCanvas, gl: WebGL2RenderingContext): RisoEngine {
  const program = link(gl);
  const vertexArray = gl.createVertexArray();
  const location = (name: string) => gl.getUniformLocation(program, name);
  const floats = Object.fromEntries(floatUniforms.map((name) => [name, location(name)])) as Record<FloatUniform, WebGLUniformLocation | null>;
  const frameSize = location("uFrameSize");
  const tile = location("uTile");
  const inks = location("uInks");
  const separation = location("uSeparation");
  const sourceSampler = location("uSource");

  let texture: WebGLTexture | null = null;
  let sourceKey: string | null = null;
  let separationKey = "";
  let separationMatrix = new Float32Array(9);

  function configure(frame: RisoFrame) {
    const s = frame.settings;
    // Lag, misregistration and drift separate ink passes; one ink has nothing to separate from.
    const multiInk = s.inkCount > 1;
    const values: Record<FloatUniform, number> = {
      uMode: modeIndex[s.mode],
      uVertical: s.direction === "vertical" ? 1 : 0,
      uPattern: patternIndex[s.pattern],
      uCount: s.count,
      uColumns: s.columns,
      uRows: s.rows,
      uRings: s.rings,
      uWedges: s.wedges,
      uAmount: s.amount,
      uFrequency: s.frequency,
      uGap: s.gap,
      uSeed: s.seed,
      uProgress: frame.progress,
      uCycles: s.cycles,
      uInkLag: multiInk ? s.inkLag : 0,
      uInkCount: s.inkCount,
      uDensity: s.density,
      uContrast: s.contrast,
      uScreen: screenIndex[s.screen],
      uCell: s.cell,
      uGrain: s.grain,
      uMisregistration: multiInk ? s.misregistration : 0,
      uDrift: multiInk ? s.boil : 0,
    };
    gl.useProgram(program);
    for (const name of floatUniforms) gl.uniform1f(floats[name], values[name]);
    gl.uniform2f(frameSize, frame.frameWidth, frame.frameHeight);
    const active = s.inks.slice(0, s.inkCount);
    const nextSeparationKey = active.join(",");
    if (nextSeparationKey !== separationKey) {
      separationKey = nextSeparationKey;
      separationMatrix = new Float32Array(inkSeparationMatrix(active));
    }
    gl.uniform3fv(separation, separationMatrix);
    gl.uniform3fv(inks, new Float32Array(s.inks.flatMap((ink) => hexToRgb(ink))));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(sourceSampler, 0);
  }

  function render(x: number, y: number, width: number, height: number) {
    gl.uniform4f(tile, x, y, width, height);
    gl.bindVertexArray(vertexArray);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function setSource(next: RisoSource | null) {
    if (sourceKey === (next?.key ?? null)) return;
    if (texture) gl.deleteTexture(texture);
    texture = null;
    sourceKey = next?.key ?? null;
    if (!next) return;
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    uploadPixels(gl, next.pixels.width, next.pixels.height, next.pixels.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function resizeSurface(width: number, height: number) {
    if (surface.width !== width) surface.width = width;
    if (surface.height !== height) surface.height = height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
  }

  function draw(frame: RisoFrame, width: number, height: number) {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (!texture) {
      view.transferFromImageBitmap(null);
      return;
    }
    resizeSurface(width, height);
    configure(frame);
    render(0, 0, 1, 1);
    // Hands the rendered frame to the visible canvas without copying pixels.
    view.transferFromImageBitmap(surface.transferToImageBitmap());
  }

  function exportFrame(frame: RisoFrame, request: ToolcraftProductExportFrameContext) {
    request.signal.throwIfAborted();
    if (!texture) throw new Error("Add a source image before exporting.");
    const width = Math.max(1, Math.round(request.frame.width * request.pixelRatio));
    const height = Math.max(1, Math.round(request.frame.height * request.pixelRatio));
    configure(frame);
    for (let top = 0; top < height; top += risoExportTileSize) {
      for (let left = 0; left < width; left += risoExportTileSize) {
        request.signal.throwIfAborted();
        const tileWidth = Math.min(risoExportTileSize, width - left);
        const tileHeight = Math.min(risoExportTileSize, height - top);
        resizeSurface(tileWidth, tileHeight);
        render(left / width, top / height, tileWidth / width, tileHeight / height);
        paintTile(request.context, surface, tileWidth, tileHeight, {
          x: request.frame.x + (left / width) * request.frame.width,
          y: request.frame.y + (top / height) * request.frame.height,
          width: (tileWidth / width) * request.frame.width,
          height: (tileHeight / height) * request.frame.height,
        });
      }
    }
  }

  return {
    isBoundTo: (candidate) => candidate === canvas,
    setSource,
    sourceKey: () => sourceKey,
    draw,
    exportFrame,
    dispose: () => {
      if (texture) gl.deleteTexture(texture);
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
