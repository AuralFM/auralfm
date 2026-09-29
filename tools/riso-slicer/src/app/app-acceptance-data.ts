import type { ToolcraftComponentAcceptance, ToolcraftTransferMode } from "./acceptance/types";
import { appSchema } from "./app-schema";
import { RISO_LOOP_SECONDS } from "./riso-animation";
import { risoInkTargets, risoSelectorTargets, risoSliders, risoSourceTarget, risoTarget, type RisoSliderParameter } from "./riso-params";

export { appControlSectionInventory, appProductReadiness } from "./riso-inventory";

export const appTransferMode: ToolcraftTransferMode = {
  mode: "new-toolcraft-app",
  animationIntent: {
    mode: "timeline-playback",
    loopDuration: {
      seconds: RISO_LOOP_SECONDS,
      source: "product-derived",
      evidence: "Four seconds lets each slice finish a readable swing per cycle while still looping like a short GIF; the loop stays seamless at any edited duration because motion is periodic in timeline progress.",
    },
  },
  // The linked GIF (x.com) could not be opened from this environment, so no frames were studied.
  referenceInputs: [],
};

const common = {
  automated: true,
  automatedTestName: "riso schema keeps its slicing, ink and print contracts",
  fixture: "Uploaded 1600×1000 sunset test image drawn by e2e/riso-test-helpers.ts",
} as const;

const controlsSpec = "e2e/product-riso-controls.spec.ts" as const;
const ownedInteraction: Partial<Record<string, string>> = {
  [risoTarget("amount")]: "edit-slice-offset",
  [risoTarget("misregistration")]: "edit-misregistration",
};

const sliderRows: ToolcraftComponentAcceptance[] = risoSliders.map((parameter: RisoSliderParameter) => {
  const target = risoTarget(parameter.key);
  const interactionId = ownedInteraction[target];
  return {
    ...common,
    id: target,
    target,
    kind: "control",
    componentType: "slider",
    evidence: "rendered-pixels",
    ...(interactionId ? { interactionId } : {}),
    userAction: `Drag ${parameter.label} while holding the pointer.`,
    expectedObservable: parameter.help,
    browser: { file: controlsSpec, testName: `browser: riso ${parameter.key} changes the print live`, budget: "standard" },
  };
});

const selectorRows: ToolcraftComponentAcceptance[] = Object.entries(risoSelectorTargets).map(([key, target]) => ({
  ...common,
  id: target,
  target,
  kind: "control",
  componentType: "segmented",
  evidence: "rendered-pixels",
  optionCoverage: "each-visible-item",
  userAction: "Select every option in turn.",
  expectedObservable: "Each option prints a visibly different image and reveals only the controls it uses.",
  browser: { file: controlsSpec, testName: `browser: riso ${key} options change the print`, budget: "standard" },
}));

const inkColorRows: ToolcraftComponentAcceptance[] = risoInkTargets.map((target, index) => ({
  ...common,
  id: target,
  target,
  kind: "control",
  componentType: "color",
  evidence: "rendered-pixels",
  userAction: "Type a new hex colour for this ink.",
  expectedObservable: `Ink ${index + 1} prints in the new colour and the image is re-separated for the new ink set.`,
  browser: { file: controlsSpec, testName: `browser: riso ink ${index + 1} colour reprints the image`, budget: "standard" },
}));

export const appAcceptance: readonly ToolcraftComponentAcceptance[] = [
  {
    ...common,
    id: risoSourceTarget,
    target: risoSourceTarget,
    kind: "control",
    componentType: "fileDrop",
    evidence: "media-lifecycle",
    mediaLifecycleCoverage: ["upload", "rotate", "flip", "transform-output", "remove", "reset"],
    userAction: "Upload an image, rotate and flip it, remove it, upload again and reset.",
    expectedObservable: "Upload prints the image into the canvas frame; rotate and flip reprint it transformed; remove and reset leave an empty canvas.",
    browser: { file: "e2e/product-riso-source.spec.ts", testName: "browser: riso source upload, transform and removal", budget: "extended-io" },
  },
  ...selectorRows,
  ...sliderRows,
  ...inkColorRows,
  {
    ...common,
    id: "renderer.timeline",
    kind: "runtime",
    componentType: "timeline",
    evidence: "timeline-output",
    timelineCoverage: "playback",
    timelinePlaybackCoverage: "all-playback-behavior",
    timelineLoopProof: { direction: "forward-only", durationChange: "reproved-after-edit", reversePlayback: "forbidden", seam: "first-last-match" },
    userAction: "Play, pause, scrub, edit duration and toggle loop in the runtime Timeline.",
    expectedObservable: "Slices and ink passes move with the playhead, the first and last frames match, and the same cycle stretches to an edited duration.",
    browser: { file: "e2e/product-riso-timeline.spec.ts", testName: "browser: riso timeline loops the slices seamlessly", budget: "extended-io" },
  },
  {
    ...common,
    id: "riso.backing",
    target: "canvas.renderScale",
    kind: "runtime",
    componentType: "slider",
    evidence: "product-output",
    renderScaleCoverage: { kind: "selected-backing-pixels", states: ["interaction", "playback", "steady"] },
    userAction: "Change Resolution scale, drag a print slider, play the timeline and let it settle.",
    expectedObservable: "The print canvas keeps CSS × DPR × selected scale backing pixels during drag, playback and at rest.",
    browser: { file: "e2e/product-riso-backing.spec.ts", testName: "browser: riso keeps selected backing resolution", budget: "standard" },
  },
  {
    ...common,
    id: "background.include",
    target: "export.includeBackground",
    kind: "control",
    componentType: "switch",
    evidence: "product-output",
    backgroundOutputCoverage: "all-required-background-output",
    userAction: "Turn Background off and on, export a PNG, and repeat in Infinity canvas.",
    expectedObservable: "Paper colour disappears from preview and the PNG becomes transparent around the inks; turning it back on restores the paper.",
    browser: { file: "e2e/product-riso-background.spec.ts", testName: "browser: riso paper background matches preview and artifact", budget: "extended-io" },
  },
  {
    ...common,
    id: "background.color",
    target: "appearance.background",
    kind: "control",
    componentType: "color",
    evidence: "product-output",
    userAction: "Type a new Background color.",
    expectedObservable: "The paper under the inks changes colour.",
    browser: { file: "e2e/product-riso-background.spec.ts", testName: "browser: riso paper background matches preview and artifact", budget: "extended-io" },
  },
  {
    ...common,
    id: "export.image.artifact",
    target: "actions.output",
    kind: "control",
    componentType: "panelActions",
    evidence: "exported-bytes",
    actionCoverage: ["export.png"],
    exportArtifactCoverage: "all-required-image-export-behavior",
    userAction: "Export the print as PNG and JPG at each resolution.",
    expectedObservable: "The download decodes to the selected format and long edge and contains the printed inks.",
    browser: { file: "e2e/product-riso-export.spec.ts", testName: "browser: riso image export has selected format and size", budget: "extended-io" },
  },
  ...(["format", "resolution"] as const).map((key): ToolcraftComponentAcceptance => ({
    ...common,
    id: `export.image.${key}`,
    target: `export.image.${key}`,
    kind: "control",
    componentType: "select",
    evidence: "exported-bytes",
    optionCoverage: "each-visible-item",
    userAction: `Select each image ${key} and export.`,
    expectedObservable: `The downloaded image reflects the selected ${key}.`,
    browser: { file: "e2e/product-riso-export.spec.ts", testName: "browser: riso image export has selected format and size", budget: "extended-io" },
  })),
  {
    ...common,
    id: "riso.infinity",
    target: "canvas.infinity",
    kind: "runtime",
    componentType: "canvas",
    evidence: "viewport-side-effect",
    infinityCanvasCoverage: "mode-continuity-and-restoration",
    userAction: "Toggle Infinity canvas, pan, reload and toggle back.",
    expectedObservable: "The same print and backing survive both mode changes and finite sizing is restored.",
    browser: { file: "e2e/product-riso-infinity.spec.ts", testName: "browser: riso infinity keeps the print and its crop", budget: "extended-io" },
  },
  {
    ...common,
    id: "riso.infinity-export",
    target: "actions.output",
    kind: "runtime",
    componentType: "export",
    evidence: "exported-bytes",
    infinityCanvasCoverage: "scene-bounds-image-export",
    userAction: "Enable Infinity canvas and export PNG.",
    expectedObservable: "The export crops to the image frame the print is defined on.",
    browser: { file: "e2e/product-riso-infinity.spec.ts", testName: "browser: riso infinity keeps the print and its crop", budget: "extended-io" },
  },
  {
    ...common,
    id: "persistence.reload",
    target: "canvas.size.width",
    kind: "runtime",
    componentType: "persistence",
    evidence: "persistence-state",
    persistenceCoverage: "reload",
    persistenceSlices: appSchema.persistence.storage === "localStorage" ? appSchema.persistence.include : [],
    userAction: "Edit Canvas width and zoom, move and collapse Controls, wait for persistence, and reload the page.",
    expectedObservable: "Canvas size and zoom, their runtime values, and the moved and collapsed Controls workspace remain visibly restored after a real browser reload.",
    browser: { file: "e2e/app-persistence.spec.ts", testName: "browser: app restores exact canvas, values, and panel workspace slices after reload", budget: "extended-io" },
  },
];
