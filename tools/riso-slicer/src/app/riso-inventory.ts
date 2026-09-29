import type { ToolcraftControlSectionInventoryEntry, ToolcraftFiniteSelectorInventoryEntry, ToolcraftProductReadiness } from "./acceptance/types";
import { risoInkTargets, risoSelectorTargets, risoSliders, risoSourceTarget, risoTarget, type RisoSliderParameter } from "./riso-params";

const sliderTargets = (section: RisoSliderParameter["section"]) =>
  risoSliders.filter((parameter: RisoSliderParameter) => parameter.section === section).map((parameter) => risoTarget(parameter.key));

const discreteSelectors = (section: RisoSliderParameter["section"]): ToolcraftFiniteSelectorInventoryEntry[] =>
  risoSliders
    .filter((parameter: RisoSliderParameter) => parameter.section === section && parameter.discrete)
    .map((parameter) => ({ target: risoTarget(parameter.key), role: "parameter" as const, reason: `Sets the whole-number ${parameter.label.toLowerCase()} used by the print.` }));

export const appControlSectionInventory: readonly ToolcraftControlSectionInventoryEntry[] = [
  {
    id: "background", title: "Background", entity: "Paper", entityId: "background",
    groupingReason: "Runtime-owned transparent foreground switch and the paper colour under the inks.",
    targets: ["export.includeBackground", "appearance.background"],
    finiteSelectors: [{ target: "export.includeBackground", role: "parameter", reason: "Includes the paper colour in preview and PNG output; the fixed background recipe proves transparency." }],
  },
  {
    id: "source", title: "Source", entity: "Source image", entityId: "source",
    groupingReason: "The one uploaded image every ink plate is separated from.",
    targets: [risoSourceTarget],
    finiteSelectors: [],
  },
  {
    id: "slices", title: "Slices", entity: "Slicing", entityId: "slices",
    groupingReason: "Style, pattern and geometry of how the image is cut and displaced share one reset scope.",
    targets: [risoSelectorTargets.mode, risoSelectorTargets.direction, risoSelectorTargets.pattern, ...sliderTargets("slices")],
    finiteSelectors: [
      { target: risoSelectorTargets.mode, role: "branch", affectedTargets: [risoTarget("amount"), risoTarget("gap"), risoTarget("seed"), risoSelectorTargets.pattern], reason: "Strips, Grid and Radial cut the image differently and reveal their own count controls." },
      { target: risoSelectorTargets.pattern, role: "branch", affectedTargets: [risoTarget("amount")], reason: "Wave, Random and Steps set how slices move; only Wave uses Wave cycles." },
      { target: risoSelectorTargets.direction, role: "parameter", reason: "Chooses horizontal or vertical strips." },
      ...discreteSelectors("slices"),
    ],
  },
  {
    id: "motion", title: "Motion", entity: "Loop motion", entityId: "motion",
    groupingReason: "How many slice cycles fit the timeline loop and how far ink passes trail each other.",
    targets: sliderTargets("motion"),
    finiteSelectors: discreteSelectors("motion"),
  },
  {
    id: "inks", title: "Inks", entity: "Ink drums", entityId: "inks",
    groupingReason: "Number of drums, their colours and how much ink they lay down define the colour separation.",
    targets: [risoSelectorTargets.inkCount, ...risoInkTargets, ...sliderTargets("inks")],
    finiteSelectors: [
      { target: risoSelectorTargets.inkCount, role: "branch", affectedTargets: [risoInkTargets[0], risoTarget("density"), risoTarget("contrast")], reason: "One, two or three drums re-separate the image and reveal their colours and pass controls." },
    ],
  },
  {
    id: "print", title: "Print", entity: "Print texture", entityId: "print",
    groupingReason: "Screen, ink texture and registration are properties of the printed pass, not of the slicing.",
    targets: [risoSelectorTargets.screen, ...sliderTargets("print")],
    finiteSelectors: [
      { target: risoSelectorTargets.screen, role: "branch", affectedTargets: [risoTarget("grain")], reason: "Grain, Halftone and Tone screen each ink differently; Tone has no screen size." },
    ],
  },
  {
    id: "runtime.image-export", title: "Image Export", entity: "Image artifact", entityId: "image-export",
    groupingReason: "Runtime-owned format and resolution for the exported still.",
    targets: ["export.image.format", "export.image.resolution"],
    finiteSelectors: [
      { target: "export.image.format", role: "parameter", reason: "Selects the output image encoding." },
      { target: "export.image.resolution", role: "parameter", reason: "Selects the output pixel dimensions." },
    ],
  },
];

const requestEvidence = {
  source: "user-request" as const,
  detail: "i would like to make a toolcraft.sh tool as Image slicer tool + risograph shader",
};

export const appProductReadiness: ToolcraftProductReadiness = {
  mode: "product",
  productName: "Riso Slicer",
  productSummary: "Cuts an uploaded image into animated strips, tiles or rings and prints it as layered risograph inks.",
  requestedBehavior:
    "An image slicer plus risograph shader, like the referenced GIF: strips that slide/offset, grid tiles that shuffle, radial ring slices, and ink misregistration between riso colour passes, looping on the timeline and exported as an image.",
  exportIntent: { image: { mode: "toolcraft-default" }, svg: { mode: "not-requested" }, video: { mode: "not-requested" } },
  viewInteraction: { mode: "non-spatial", reason: "A flat printed image; there is no three-dimensional scene or camera to orbit." },
  interactionOwnership: [
    {
      id: "edit-slice-offset", target: risoTarget("amount"), capability: "property-edit", surface: "panel", selectionScope: { mode: "global" },
      evidence: requestEvidence,
      reason: "Offset is one global amplitude for every slice; a slider gives a precise, resettable value.",
      alternative: { surface: "canvas", reason: "Dragging slices on the canvas would edit one slice while the effect applies to all of them." },
    },
    {
      id: "edit-misregistration", target: risoTarget("misregistration"), capability: "property-edit", surface: "panel", selectionScope: { mode: "global" },
      evidence: requestEvidence,
      reason: "Misregistration sets how far every ink plate drifts; a pixel slider is exact and repeatable.",
      alternative: { surface: "canvas", reason: "Dragging an ink plate on the canvas would conflict with viewport pan and hide which plate moved." },
    },
  ],
};
