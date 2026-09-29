import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftImageExportArtifact } from "./browser-media-export-evidence";
import { chooseSegment, downloadImage, expandSection, field, openRiso, setChoice, setNumber } from "./riso-test-helpers";
import { expect, test } from "./toolcraft-product-test";

const paper = [244, 240, 232, 255] as const;

test("browser: riso image export has selected format and size", async ({ page }) => {
  await openRiso(page);
  const session = await createToolcraftBrowserProofSession(page);
  // One black ink in continuous tone makes the decoded pixels predictable.
  await expandSection(page, "Slices");
  await setNumber(page, "slices.amount", 0);
  await expandSection(page, "Inks");
  await chooseSegment(page, "inks.count", "1");
  const ink = field(page, "inks.first").getByRole("textbox").first();
  await ink.fill("#000000");
  await ink.press("Enter");
  await setNumber(page, "inks.density", 1.6);
  await setNumber(page, "inks.contrast", 2.5);
  await expandSection(page, "Print");
  await chooseSegment(page, "print.screen", "Tone");
  await setNumber(page, "print.grain", 0);

  // 1920×1080 canvas; the sample is cover-cropped into it.
  for (const [format, resolution, edge] of [["PNG", "2K", 2048], ["JPG", "4K", 4096], ["PNG", "8K", 8192]] as const) {
    await setChoice(page, "export.image.format", format);
    await setChoice(page, "export.image.resolution", resolution);
    await expect(page.getByRole("button", { name: `Export ${format}`, exact: true })).toBeVisible();
    await expectToolcraftImageExportArtifact(session.targetAction("actions.output", () => downloadImage(page)), {
      page,
      requirementId: "export.image.artifact",
      backgroundRgba: paper,
      expectedMediaType: format === "PNG" ? "image/png" : "image/jpeg",
      expectedWidth: edge,
      expectedHeight: Math.round((edge * 1080) / 1920),
      expectedBounds: { x: 0, y: 0, width: 1, height: 1 },
      expectedPixels: [
        { xRatio: 0.2, yRatio: 0.17, rgba: paper },
        { xRatio: 0.5, yRatio: 0.96, rgba: [7, 7, 7, 255] },
      ],
      additionalArtifactRequirements: [
        { requirementId: "export.image.format", target: "export.image.format" },
        { requirementId: "export.image.resolution", target: "export.image.resolution" },
      ],
    });
  }
  await page.getByRole("button", { name: "Reset Image Export section", exact: true }).click();
  await expect(page.getByRole("button", { name: "Export PNG", exact: true })).toBeVisible();
});
