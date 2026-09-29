import { describe, expect, it } from "vitest";

import { appSchema } from "./app-schema";
import { risoPerformancePaths, risoRenderAssessment } from "./app-performance";
import { getRisoProgress } from "./riso-animation";
import { readRisoSettings, risoInkTargets, risoSelectorTargets, risoSliders, risoTarget } from "./riso-params";
import { risoPipeline } from "./riso-pipeline";
import { inkSeparationMatrix, printInks, separatePixel, hexToRgb } from "./riso-separation";
import { getRisoSourcePixelSize, risoMaxSourceEdge } from "./riso-source";

describe("riso product", () => {
  it("riso schema keeps its slicing, ink and print contracts", () => {
    const targets = new Set(appSchema.panels.controls.sections.flatMap((section) => Object.values(section.controls).map((control) => control.target)));
    for (const parameter of risoSliders) expect(targets.has(risoTarget(parameter.key))).toBe(true);
    for (const target of [...Object.values(risoSelectorTargets), ...risoInkTargets]) expect(targets.has(target)).toBe(true);
    expect(appSchema.timeline?.defaultDurationSeconds ?? 4).toBe(4);

    const defaults = readRisoSettings({});
    expect(defaults.mode).toBe("strips");
    expect(defaults.inkCount).toBe(3);
    expect(readRisoSettings({ "inks.count": "1", "slices.mode": "nope" })).toMatchObject({ inkCount: 1, mode: "strips" });
  });

  it("separates a colour into inks that print it back", () => {
    const inks = ["#FF48B0", "#0078BF", "#FFE800"];
    const matrix = inkSeparationMatrix(inks);
    for (const hex of ["#e2477a", "#0f5e73", "#ffb347", "#808080"]) {
      const printed = printInks(separatePixel(hexToRgb(hex), matrix, 3), inks);
      hexToRgb(hex).forEach((channel, index) => expect(Math.abs(printed[index]! - channel)).toBeLessThan(0.02));
    }
    expect(separatePixel([1, 1, 1], matrix, 3)).toEqual([0, 0, 0]);
  });

  it("loops: progress is periodic in the runtime duration", () => {
    expect(getRisoProgress({ currentTimeSeconds: 2, durationSeconds: 4, isLooping: true })).toBeCloseTo(0.5);
    expect(getRisoProgress({ currentTimeSeconds: 5, durationSeconds: 4, isLooping: true })).toBeCloseTo(0.25);
    expect(getRisoProgress({ currentTimeSeconds: 4, durationSeconds: 4, isLooping: false })).toBe(1);
  });

  it("caps the prepared source at the long-edge limit and keeps its aspect", () => {
    const size = getRisoSourcePixelSize({ id: "a", size: { width: 1920, height: 1080 }, sourceSize: { width: 12000, height: 8000 } });
    expect(Math.max(size.width, size.height)).toBe(risoMaxSourceEdge);
    expect(size.width / size.height).toBeCloseTo(1920 / 1080, 2);
  });

  it("riso performance paths keep the retained renderer", () => {
    expect(risoRenderAssessment.errors ?? []).toEqual([]);
    expect(risoPerformancePaths.length).toBeGreaterThan(0);
    expect(risoPipeline.getPass("resources")).toBeDefined();
  });
});
