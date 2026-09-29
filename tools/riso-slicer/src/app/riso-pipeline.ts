import { registerToolcraftRendererPipeline, type ToolcraftRendererPipelinePassContract } from "@/toolcraft/runtime";

import type { RisoEngine } from "./riso-engine";
import type { RisoPixels } from "./riso-source";
import { risoInkTargets, risoSelectorTargets, risoSliders, risoSourceTarget, risoTarget } from "./riso-params";

export const risoRenderTargets = [
  ...risoSliders.map((parameter) => risoTarget(parameter.key)),
  ...Object.values(risoSelectorTargets),
  ...risoInkTargets,
];

const frameBounds = {
  kind: "intrinsic",
  reason: "The print is defined on the uploaded image's frame: strips and tiles wrap inside it, rings mirror inside it, and ink plates that drift past its edge leave the page.",
} as const;

export const risoPipeline = registerToolcraftRendererPipeline<{
  resources: ToolcraftRendererPipelinePassContract<RisoEngine, RisoEngine, readonly ["riso"]>;
  source: ToolcraftRendererPipelinePassContract<RisoPixels>;
  preview: ToolcraftRendererPipelinePassContract<void>;
  export: ToolcraftRendererPipelinePassContract<void>;
}>()({
  runtimeId: "riso-slicer-webgl2-v1",
  passes: [
    { id: "resources", kind: "preprocess", runsOn: "main", output: "source", quality: "full", inputs: ["surface"], invalidatedBy: ["renderer-mount"], cacheKey: ["surface"], lifecycle: { cache: "retained-resource", resourceScope: "renderer" }, cost: { dimensions: [], frequency: "once", relationship: "constant" }, sceneBounds: frameBounds },
    { id: "source", kind: "decode", runsOn: "main", output: "source", quality: "full", inputs: [risoSourceTarget], invalidatedBy: [risoSourceTarget], cacheKey: [risoSourceTarget], lifecycle: { cache: "memoized", resourceScope: "source" }, cost: { dimensions: [], frequency: "discrete", relationship: "constant" }, sceneBounds: frameBounds },
    { id: "preview", kind: "composite", runsOn: "gpu", output: "preview", quality: "retina", inputs: [...risoRenderTargets, risoSourceTarget, "timeline.time", "canvas.renderScale", "canvas.zoom"], invalidatedBy: [...risoRenderTargets, risoSourceTarget, "timeline.time", "canvas.renderScale", "canvas.zoom"], lifecycle: { cache: "none", resourceScope: "call" }, cost: { dimensions: ["preview-scale"], frequency: "frame", relationship: "quadratic" }, gpu: { stage: "render", resources: "uniforms-only", state: "stateless", surfaces: ["preview"] }, sceneBounds: frameBounds },
    { id: "export", kind: "export", runsOn: "gpu", output: "export", quality: "export", inputs: [...risoRenderTargets, risoSourceTarget, "timeline.time", "export.image.resolution", "export.image.format"], invalidatedBy: ["export", "timeline.time"], lifecycle: { cache: "none", resourceScope: "call" }, cost: { dimensions: ["export-edge"], frequency: "batch", relationship: "quadratic" }, gpu: { stage: "render", resources: "uniforms-only", state: "stateless", surfaces: ["export"] } },
  ],
  interactionInvalidation: [
    { interaction: "initial-render", targets: ["surface"], invalidates: ["resources", "preview"] },
    { interaction: "media-import", targets: [risoSourceTarget], invalidates: ["source", "preview"], mustNotInvalidate: ["resources"] },
    { interaction: "control-drag", targets: [...risoSliders.map((parameter) => risoTarget(parameter.key)), ...risoInkTargets, "canvas.renderScale"], invalidates: ["preview"], mustNotInvalidate: ["resources", "source"] },
    { interaction: "control-change", targets: Object.values(risoSelectorTargets), invalidates: ["preview"], mustNotInvalidate: ["resources", "source"] },
    { interaction: "control-change", targets: ["export.includeBackground", "appearance.background", "export.image.format", "export.image.resolution", "canvas.size.width", "canvas.size.height", "canvas.aspectRatio", "canvas.infinity"], invalidates: [], mustNotInvalidate: ["resources", "source", "preview"] },
    { interaction: "viewport-drag", targets: ["canvas.offset"], invalidates: [], mustNotInvalidate: ["resources", "source", "preview"] },
    { interaction: "viewport-zoom", targets: ["canvas.zoom"], invalidates: ["preview"], mustNotInvalidate: ["resources", "source"] },
    { interaction: "timeline-playback", targets: ["timeline.time"], invalidates: ["preview"], mustNotInvalidate: ["resources", "source"] },
    { interaction: "timeline-scrub", targets: ["timeline.time"], invalidates: ["preview"], mustNotInvalidate: ["resources", "source"] },
    { interaction: "export", targets: ["actions.output"], invalidates: ["export"], retainedAccesses: ["resources"], mustNotInvalidate: ["preview", "source"] },
  ],
});
