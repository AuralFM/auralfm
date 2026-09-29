import { describe, expect, it } from "vitest";

import {
  appAcceptance,
  validateProductAcceptanceCoverage,
} from "./app-acceptance";
import { appPerformance } from "./app-performance";
import { appSchema } from "./app-schema";

describe("appSchema", () => {
  it("assembles the riso slicer on an editable canvas with upload, playback and image export", () => {
    expect(appSchema.canvas.enabled).toBe(true);
    expect(appSchema.canvas.sizing).toEqual({ mode: "editable-output" });
    expect(appSchema.canvas.upload).toBe(true);
    expect(appSchema.panels.layers).toBeUndefined();
    expect(appSchema.assembly.capabilities).toEqual(
      expect.arrayContaining(["canvas.upload", "timeline.playback"]),
    );
    expect(appSchema.assembly.capabilities).not.toContain("timeline.keyframes");
    expect(
      appSchema.modulePlan.capabilities.map(({ capabilityId }) => capabilityId),
    ).toEqual(expect.arrayContaining(["media.source"]));
    expect(appSchema.modulePlan.modules.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["media-source"]),
    );
  });

  it("lists the product sections after runtime Setup in workflow order", () => {
    const productTitles =
      appSchema.panels.controls?.sections
        .filter((section) => !section.id.startsWith("runtime."))
        .map((section) => section.title) ?? [];

    expect(appSchema.panels.controls?.sections[1]?.title).toBe("Settings");
    expect(productTitles).toEqual(
      expect.arrayContaining(["Source", "Slices", "Motion", "Inks", "Print"]),
    );
    expect(productTitles.indexOf("Source")).toBeLessThan(productTitles.indexOf("Slices"));
    expect(productTitles.indexOf("Inks")).toBeLessThan(productTitles.indexOf("Print"));
  });

  it("derives a performance scenario for every canonical renderer path", () => {
    expect(appPerformance.workloadEnvelope.dimensions.map(({ id }) => id)).toEqual([
      "preview-scale",
      "export-edge",
    ]);
    expect(appPerformance.scenarios.length).toBeGreaterThan(0);
  });

  it("declares production reload coverage for the product schema", () => {
    expect(appSchema.persistence.storage).toBe("localStorage");
    if (appSchema.persistence.storage !== "localStorage") {
      throw new Error("The product must persist user settings in localStorage.");
    }
    expect(appSchema.persistence.include).toEqual(
      expect.arrayContaining(["canvas", "values", "media", "timeline"]),
    );
    expect(
      appAcceptance.find((entry) => entry.id === "persistence.reload"),
    ).toMatchObject({
      automated: true,
      browser: {
        budget: "extended-io",
        file: "e2e/app-persistence.spec.ts",
      },
      evidence: "persistence-state",
      kind: "runtime",
      persistenceCoverage: "reload",
      persistenceSlices: appSchema.persistence.include,
      target: "canvas.size.width",
    });
    expect(validateProductAcceptanceCoverage()).toEqual([]);
  });
});
