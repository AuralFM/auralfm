import type { ToolcraftControlSchema } from "@/toolcraft/runtime";

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
  minInks?: number;
}>;

export const risoSliders = [
  { section: "slices", key: "count", label: "Strips", value: 14, min: 2, max: 96, step: 1, discrete: true, modes: ["strips"], help: "Number of strips the image is cut into along the chosen direction." },
  { section: "slices", key: "columns", label: "Columns", value: 6, min: 1, max: 32, step: 1, discrete: true, modes: ["grid"], help: "Number of tile columns across the image." },
  { section: "slices", key: "rows", label: "Rows", value: 8, min: 1, max: 32, step: 1, discrete: true, modes: ["grid"], help: "Number of tile rows down the image." },
  { section: "slices", key: "rings", label: "Rings", value: 9, min: 1, max: 48, step: 1, discrete: true, modes: ["radial"], help: "Number of concentric rings around the centre." },
  { section: "slices", key: "wedges", label: "Wedges", value: 1, min: 1, max: 24, step: 1, discrete: true, modes: ["radial"], help: "Splits every ring into pie wedges that turn independently. 1 keeps whole rings." },
  { section: "slices", key: "amount", label: "Offset", value: 0.18, min: 0, max: 1, step: 0.01, help: "How far each slice travels. Strips and tiles wrap around inside the frame; rings turn by up to half a revolution." },
  { section: "slices", key: "frequency", label: "Wave cycles", value: 1.5, min: 0, max: 6, step: 0.05, modes: ["strips", "grid", "radial"], help: "How many wave periods run across the slices when Pattern is Wave." },
  { section: "slices", key: "gap", label: "Gutter", value: 0, min: 0, max: 0.45, step: 0.01, help: "Blank paper left between slices, as a share of each slice." },
  { section: "slices", key: "seed", label: "Seed", value: 7, min: 1, max: 99, step: 1, discrete: true, help: "Repeatable variation for Random and Steps patterns, tile directions and ink misregistration." },
  { section: "motion", key: "cycles", label: "Cycles per loop", value: 1, min: 0, max: 4, step: 1, discrete: true, help: "Whole slice cycles in one timeline loop, so the last frame meets the first. 0 holds the slices still." },
  { section: "motion", key: "inkLag", label: "Ink lag", value: 0.06, min: 0, max: 0.5, step: 0.01, help: "Each ink layer follows the slice motion later than the one before, so colours separate while the slices move." },
  { section: "inks", key: "density", label: "Density", value: 1, min: 0.3, max: 1.6, step: 0.01, help: "Scales how much ink every layer lays down." },
  { section: "inks", key: "contrast", label: "Contrast", value: 1.15, min: 0.5, max: 2.5, step: 0.01, help: "Pushes ink coverage toward full ink or bare paper." },
  { section: "print", key: "cell", label: "Screen size", value: 6, min: 2, max: 32, step: 0.5, unit: "px", screens: ["halftone", "grain"], help: "Halftone cell or grain clump size in output pixels at the canvas size." },
  { section: "print", key: "grain", label: "Ink texture", value: 0.35, min: 0, max: 1, step: 0.01, help: "Uneven drum coverage: speckle and pale patches inside solid ink." },
  { section: "print", key: "misregistration", label: "Misregistration", value: 6, min: 0, max: 40, step: 0.5, unit: "px", help: "Fixed offset of each ink pass from true register, in canvas pixels." },
  { section: "print", key: "boil", label: "Registration drift", value: 0.35, min: 0, max: 1, step: 0.01, help: "Each ink pass jitters to a new register on every animation step, like successive prints." },
] as const satisfies readonly RisoSliderParameter[];

export type RisoSliderKey = (typeof risoSliders)[number]["key"];

export const risoInkDefaults = ["#FF48B0", "#0078BF", "#FFE800"] as const;

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

function sliderApplicability(parameter: RisoSliderParameter): ToolcraftControlSchema["applicability"] {
  const all: { target: string; oneOf: string[] }[] = [];
  if (parameter.key === "frequency") {
    all.push({ target: risoSelectorTargets.pattern, oneOf: ["wave"] });
  } else if (parameter.modes) {
    all.push({ target: risoSelectorTargets.mode, oneOf: [...parameter.modes] });
  }
  if (parameter.screens) all.push({ target: risoSelectorTargets.screen, oneOf: [...parameter.screens] });
  if (parameter.key === "inkLag" || parameter.key === "misregistration" || parameter.key === "boil") {
    all.push({ target: risoSelectorTargets.inkCount, oneOf: ["2", "3"] });
  }
  return all.length > 0 ? { mode: "conditional", all } : { mode: "always" };
}

export function risoSliderControls(section: Section): Record<string, ToolcraftControlSchema> {
  return Object.fromEntries(
    risoSliders
      .filter((parameter) => parameter.section === section)
      .map((parameter: RisoSliderParameter) => [
        parameter.key,
        {
          type: "slider",
          target: risoTarget(parameter.key),
          label: parameter.label,
          description: parameter.help,
          defaultValue: parameter.value,
          min: parameter.min,
          max: parameter.max,
          step: parameter.step,
          ...(parameter.discrete
            ? {
                sliderValueKind: "discrete" as const,
                // Tick marks only fit short whole-number ranges.
                variant: (parameter.max - parameter.min) / parameter.step + 1 <= 32 ? ("discrete" as const) : ("continuous" as const),
              }
            : { sliderValueKind: "continuous" as const }),
          ...(parameter.unit ? { unit: parameter.unit } : {}),
          applicability: sliderApplicability(parameter),
          keyframeable: false,
          performanceRole: "responsiveness",
          performanceReason: "Updates one shader uniform on the retained full-frame riso pass.",
        } satisfies ToolcraftControlSchema,
      ]),
  );
}
