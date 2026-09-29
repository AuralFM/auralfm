import {
  assessToolcraftRenderPlan,
  defineToolcraftPerformance,
  deriveToolcraftPerformancePaths,
  type ToolcraftPerformanceConfig,
  type ToolcraftPerformanceScenario,
} from "@/toolcraft/runtime";

import { appSchema } from "./app-schema";
import { risoPipeline } from "./riso-pipeline";

const model: ToolcraftPerformanceConfig = {
  usesCustomRenderer: true,
  rendererStrategy: "webgl",
  rendererPipeline: risoPipeline,
  rendererTechnique: {
    sourceRepresentation: "image-media",
    productRepresentation: "pixel",
    previewRenderer: "webgl",
    exportRenderer: "webgl",
    rendererStrategy: "webgl",
    gpu: {
      preview: { backend: "webgl", provider: "native", exception: { kind: "browser-compatibility", evidence: "A single stateless fragment pass over one sampled texture must run in every current browser the tool is shared to; WebGL2 is available in all of them, while WebGPU is still missing on some (for example Firefox on Linux and older Safari)." } },
      export: { backend: "webgl", provider: "native", exception: { kind: "browser-compatibility", evidence: "Export reuses the preview's WebGL2 context and program so the artifact matches the preview in every browser that can show it." } },
    },
    intentionalRasterizationReason: "Riso grain, halftone dots and colour separation are per-pixel print effects on a photographic source.",
    whyNotAlternativeStrategies: [
      "SVG cannot represent stochastic grain or per-pixel colour separation of a photo.",
      "Canvas 2D would run the separation and slicing per pixel on the CPU every frame.",
    ],
    fidelityRisks: ["Sources larger than 4096 px on the long edge are resampled once before printing."],
    performanceRisks: [
      "Preview cost is quadratic in backing pixels; playback reruns one fragment pass per frame and pauses while the viewport is dragged.",
      "8K export renders and reads back in 2048 px tiles to bound GPU memory.",
    ],
    layers: [{ id: "riso-print", kind: "product-foreground", content: ["bitmap-media", "shader", "noise"], renderer: "webgl", primitiveCount: "low", exportMode: "included", uiSelector: "[data-riso-canvas]" }],
  },
  workloadEnvelope: {
    dimensions: [
      { id: "preview-scale", unit: "backing scale", source: { kind: "runtime-state", path: "canvas.renderScale" }, mapping: "quadratic", defaultValue: 2, interactiveMax: 2, batchMax: 2 },
      { id: "export-edge", unit: "pixels", source: { kind: "schema-target", target: "export.image.resolution" }, mapping: "quadratic", defaultValue: 4096, batchMax: 8192 },
    ],
  },
  fixtureAdapters: {
    dimensions: {
      "preview-scale": { dimensionId: "preview-scale", apply: (value) => value, observe: (value) => Number(value) },
      "export-edge": {
        dimensionId: "export-edge",
        kind: "exhaustive-discrete",
        domain: { kind: "schema-options", target: "export.image.resolution", optionValues: ["2k", "4k", "8k"] },
        entries: [{ value: 2048, appliedValue: "2k" }, { value: 4096, appliedValue: "4k" }, { value: 8192, appliedValue: "8k" }],
        apply: (value) => ({ 2048: "2k", 4096: "4k", 8192: "8k" })[value]!,
        observe: (value) => ({ "2k": 2048, "4k": 4096, "8k": 8192 })[String(value) as "2k"],
      },
    },
  },
  scenarios: [],
};

export const risoRenderAssessment = assessToolcraftRenderPlan(appSchema, model);
export const risoPerformancePaths = deriveToolcraftPerformancePaths(appSchema, model);

export const appPerformance = defineToolcraftPerformance({
  ...model,
  scenarios: risoPerformancePaths.map((path): ToolcraftPerformanceScenario => {
    const base = {
      id: path.id,
      pathId: path.id,
      coversTargets: path.targets,
      automated: true,
      automatedTestName: "riso performance paths keep the retained renderer",
      browser: true,
      browserTestName: `browser perf: toolcraft path ${path.id}`,
      fixture: "Canonical combined renderer fixture with the sample image uploaded",
      expectedObservable: "The riso print keeps its selected backing quality and correct output.",
      uiSelector: "[data-riso-canvas]",
    };
    return path.interaction === "export"
      ? { ...base, interaction: "export", actionValue: "export.png", controlLabel: "Export PNG", completionEvidence: "download" }
      : { ...base, interaction: path.interaction };
  }),
});
