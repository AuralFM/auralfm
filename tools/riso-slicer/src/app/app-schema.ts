import { defineToolcraft, imageExportModule, mediaSourceModule, timelineModule } from "@/toolcraft/runtime";

import appDefaults from "./app-defaults.json" with { type: "json" };
import { appIdentity } from "./app-identity";
import { RISO_LOOP_SECONDS } from "./riso-animation";
import { risoInksControls, risoMotionControls, risoPrintControls, risoSlicesControls } from "./riso-controls";

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
              image: { type: "fileDrop", assetKind: "image", target: "source.image", label: false, applicability: { mode: "always" }, performanceRole: "responsiveness", performanceReason: "One upload decodes and cover-crops the source once, capped at a 4096 px long edge." },
            },
          },
          { id: "slices", title: "Slices", controls: risoSlicesControls },
          { id: "motion", title: "Motion", controls: risoMotionControls },
          { id: "inks", title: "Inks", controls: risoInksControls },
          { id: "print", title: "Print", controls: risoPrintControls },
        ],
      },
    },
    toolbar: { history: true, radar: true, zoom: true, theme: true },
  },
  modules: [mediaSourceModule(), timelineModule({ mode: "playback", defaultDurationSeconds: RISO_LOOP_SECONDS }), imageExportModule()],
});
