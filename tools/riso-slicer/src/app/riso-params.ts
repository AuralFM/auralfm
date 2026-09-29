import type { ToolcraftControlSchema } from "@/toolcraft/runtime";

import { risoInksControls, risoMotionControls, risoPrintControls, risoSlicesControls } from "./riso-controls";

export const risoSourceTarget = "source.image";

export type RisoSliceMode = "strips" | "grid" | "radial";
export type RisoStripDirection = "horizontal" | "vertical";
export type RisoSlicePattern = "wave" | "random" | "steps";
export type RisoScreen = "grain" | "halftone" | "tone";

export const risoSliceModes: readonly RisoSliceMode[] = ["strips", "grid", "radial"];
export const risoSlicePatterns: readonly RisoSlicePattern[] = ["wave", "random", "steps"];
export const risoScreens: readonly RisoScreen[] = ["grain", "halftone", "tone"];

type Section = "slices" | "motion" | "inks" | "print";

export type RisoSliderParameter = Readonly<{
  section: Section;
  key: string;
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step: number;
  discrete?: true;
  unit?: string;
  /** Slice modes that consume this parameter; omitted means every mode. */
  modes?: readonly RisoSliceMode[];
  /** Screens that consume this parameter; omitted means every screen. */
  screens?: readonly RisoScreen[];
}>;

const sections = { slices: risoSlicesControls, motion: risoMotionControls, inks: risoInksControls, print: risoPrintControls } as const;

type SliderSchema = Extract<ToolcraftControlSchema, { type: "slider" }>;

function conditionValues(control: SliderSchema, target: string): string[] | undefined {
  const applicability = control.applicability;
  if (applicability?.mode !== "conditional") return undefined;
  const condition = applicability.all.find((entry) => entry.target === target);
  return condition && "oneOf" in condition && condition.oneOf ? condition.oneOf.map(String) : undefined;
}

/** Every slider in the schema, flattened for the renderer, inventory and tests. */
export const risoSliders: readonly RisoSliderParameter[] = Object.entries(sections).flatMap(([section, controls]) =>
  Object.entries(controls as Record<string, ToolcraftControlSchema>)
    .filter((entry): entry is [string, SliderSchema] => entry[1].type === "slider")
    .map(([key, control]) => ({
      section: section as Section,
      key,
      label: String(control.label),
      help: control.description ?? "",
      value: Number(control.defaultValue),
      min: control.min ?? 0,
      max: control.max ?? 1,
      step: control.step ?? 1,
      ...(control.sliderValueKind === "discrete" ? { discrete: true as const } : {}),
      ...(control.unit ? { unit: control.unit } : {}),
      ...(conditionValues(control, "slices.mode") ? { modes: conditionValues(control, "slices.mode") as RisoSliceMode[] } : {}),
      ...(conditionValues(control, "print.screen") ? { screens: conditionValues(control, "print.screen") as RisoScreen[] } : {}),
    })),
);

export type RisoSliderKey =
  | "count" | "columns" | "rows" | "rings" | "wedges" | "amount" | "frequency" | "gap" | "seed"
  | "cycles" | "inkLag" | "density" | "contrast" | "cell" | "grain" | "misregistration" | "boil";

export const risoInkDefaults = [risoInksControls["First ink"].defaultValue, risoInksControls["Second ink"].defaultValue, risoInksControls["Third ink"].defaultValue] as const;

export type RisoSettings = Record<RisoSliderKey, number> & {
  mode: RisoSliceMode;
  direction: RisoStripDirection;
  pattern: RisoSlicePattern;
  inkCount: 1 | 2 | 3;
  inks: readonly [string, string, string];
  screen: RisoScreen;
};

export const risoTarget = (key: string): string => {
  const section = risoSliders.find((parameter) => parameter.key === key)?.section;
  return `${section ?? "slices"}.${key}`;
};

export const risoSelectorTargets = {
  mode: "slices.mode",
  direction: "slices.direction",
  pattern: "slices.pattern",
  inkCount: "inks.count",
  screen: "print.screen",
} as const;

export const risoInkTargets = ["inks.first", "inks.second", "inks.third"] as const;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hex(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function readRisoSettings(values: Readonly<Record<string, unknown>>): RisoSettings {
  const numbers = Object.fromEntries(
    risoSliders.map((parameter) => [
      parameter.key,
      finite(values[risoTarget(parameter.key)], parameter.value),
    ]),
  ) as Record<RisoSliderKey, number>;
  const inkCount = finite(values[risoSelectorTargets.inkCount], 3);
  return {
    ...numbers,
    mode: pick(values[risoSelectorTargets.mode], risoSliceModes, "strips"),
    direction: pick(values[risoSelectorTargets.direction], ["horizontal", "vertical"] as const, "horizontal"),
    pattern: pick(values[risoSelectorTargets.pattern], risoSlicePatterns, "wave"),
    inkCount: inkCount === 1 || inkCount === 2 ? inkCount : 3,
    inks: [
      hex(values[risoInkTargets[0]], risoInkDefaults[0]),
      hex(values[risoInkTargets[1]], risoInkDefaults[1]),
      hex(values[risoInkTargets[2]], risoInkDefaults[2]),
    ],
    screen: pick(values[risoSelectorTargets.screen], risoScreens, "grain"),
  };
}
