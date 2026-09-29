import { defineToolcraft, imageExportModule, mediaSourceModule, timelineModule, type ToolcraftControlSchema } from "@/toolcraft/runtime";

import appDefaults from "./app-defaults.json" with { type: "json" };
import { appIdentity } from "./app-identity";
import { RISO_LOOP_SECONDS } from "./riso-animation";
import { risoInkDefaults, risoInkTargets, risoSelectorTargets, risoSliderControls, risoSourceTarget } from "./riso-params";

const selectorReason = "Switches one shader branch on the retained full-frame riso pass.";

const inkColor = (index: 0 | 1 | 2): ToolcraftControlSchema => ({
  type: "color",
  target: risoInkTargets[index],
  label: false,
  defaultValue: risoInkDefaults[index],
  semanticGroup: "ink-colours",
  applicability: index === 0 ? { mode: "always" } : { mode: "conditional", all: [{ target: risoSelectorTargets.inkCount, oneOf: index === 1 ? ["2", "3"] : ["3"] }] },
  keyframeable: false,
  performanceRole: "responsiveness",
  performanceReason: "Recomputes a 3×3 separation matrix and updates ink uniforms.",
});

export const appSchema = defineToolcraft({
  defaults: appDefaults,
  base: {
    identity: appIdentity,
    canvas: { enabled: true, upload: true, sizing: { mode: "editable-output" }, renderScale: true },
    panels: {
      controls: {
        title: "Riso Slicer",
        sections: [
          {
            id: "background",
            title: "Background",
            controls: {
              include: { type: "switch", target: "export.includeBackground", label: "Background", defaultValue: true, applicability: { mode: "always" }, performanceRole: "responsiveness", performanceReason: "Runtime toggles its background layer; the transparent ink foreground is unchanged." },
              color: { type: "color", target: "appearance.background", label: "Background color", description: "Paper colour under the inks.", defaultValue: "#F4F0E8", applicability: { mode: "always" }, keyframeable: false, performanceRole: "responsiveness", performanceReason: "Runtime repaints its background layer only." },
            },
          },
          {
            id: "source",
            title: "Source",
            controls: {
              image: { type: "fileDrop", assetKind: "image", target: risoSourceTarget, label: false, applicability: { mode: "always" }, performanceRole: "responsiveness", performanceReason: "One upload decodes and cover-crops the source once, capped at a 4096 px long edge." },
            },
          },
          {
            id: "slices",
            title: "Slices",
            controls: {
              mode: { type: "segmented", target: risoSelectorTargets.mode, label: "Style", defaultValue: "strips", options: [{ label: "Strips", value: "strips" }, { label: "Grid", value: "grid" }, { label: "Radial", value: "radial" }], applicability: { mode: "always" }, keyframeable: false, performanceRole: "responsiveness", performanceReason: selectorReason },
              direction: { type: "segmented", target: risoSelectorTargets.direction, label: "Direction", description: "Rows are horizontal bands that slide sideways; Columns are vertical bands that slide up and down.", defaultValue: "horizontal", options: [{ label: "Rows", value: "horizontal" }, { label: "Columns", value: "vertical" }], applicability: { mode: "conditional", all: [{ target: risoSelectorTargets.mode, oneOf: ["strips"] }] }, keyframeable: false, performanceRole: "responsiveness", performanceReason: selectorReason },
              pattern: { type: "segmented", target: risoSelectorTargets.pattern, label: "Pattern", description: "Wave moves neighbouring slices together; Random gives each its own swing; Steps jumps between held positions and shuffles grid tiles.", defaultValue: "wave", options: [{ label: "Wave", value: "wave" }, { label: "Random", value: "random" }, { label: "Steps", value: "steps" }], applicability: { mode: "always" }, keyframeable: false, performanceRole: "responsiveness", performanceReason: selectorReason },
              ...risoSliderControls("slices"),
            },
          },
          { id: "motion", title: "Motion", controls: risoSliderControls("motion") },
          {
            id: "inks",
            title: "Inks",
            controls: {
              count: { type: "segmented", target: risoSelectorTargets.inkCount, label: "Inks", description: "Number of ink drums. The image is separated into these inks by colour.", defaultValue: "3", options: [{ label: "1", value: "1" }, { label: "2", value: "2" }, { label: "3", value: "3" }], applicability: { mode: "always" }, keyframeable: false, performanceRole: "responsiveness", performanceReason: selectorReason },
              first: inkColor(0),
              second: inkColor(1),
              third: inkColor(2),
              ...risoSliderControls("inks"),
            },
          },
          {
            id: "print",
            title: "Print",
            controls: {
              screen: { type: "segmented", target: risoSelectorTargets.screen, label: "Screen", description: "Grain is the stochastic riso dither; Halftone uses rotated dots per ink; Tone lays continuous ink.", defaultValue: "grain", options: [{ label: "Grain", value: "grain" }, { label: "Halftone", value: "halftone" }, { label: "Tone", value: "tone" }], applicability: { mode: "always" }, keyframeable: false, performanceRole: "responsiveness", performanceReason: selectorReason },
              ...risoSliderControls("print"),
            },
          },
        ],
      },
    },
    toolbar: { history: true, radar: true, zoom: true, theme: true },
  },
  modules: [mediaSourceModule(), timelineModule({ mode: "playback", defaultDurationSeconds: RISO_LOOP_SECONDS }), imageExportModule()],
});
