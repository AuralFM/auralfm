import type { Page } from "@playwright/test";

import { expectToolcraftInfinityCanvasImageExportEvidence, expectToolcraftInfinityCanvasModeEvidence, observeInfinityCanvas } from "./browser-infinity-canvas-evidence";
import { downloadImage, inspectImage, openRiso, panEmpty, risoSelector, setChoice } from "./riso-test-helpers";
import { expect, test } from "./toolcraft-product-test";

async function toggleWithContinuity(page: Page, action: () => Promise<void>) {
  const host = await page.locator("[data-toolcraft-product-scene]").elementHandle();
  const output = await page.locator(risoSelector).elementHandle();
  await action();
  return {
    productHostPreserved: await host!.evaluate((element) => element === document.querySelector("[data-toolcraft-product-scene]")),
    productOutputPreserved: await output!.evaluate((element) => element === document.querySelector("[data-riso-canvas]")),
  };
}

test("browser: riso infinity keeps the print and its crop", async ({ page }) => {
  await openRiso(page);
  await setChoice(page, "export.image.resolution", "2K");
  const finite = (await inspectImage(page, await downloadImage(page))).inspection;
  const before = await observeInfinityCanvas(page);
  const beforeToEnabled = await toggleWithContinuity(page, () => page.getByRole("switch", { name: "Infinity canvas", exact: true }).check());
  const enabled = await observeInfinityCanvas(page);
  await panEmpty(page);
  const afterPan = await observeInfinityCanvas(page);
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toHaveAttribute("data-toolcraft-persistence-status", "success");
  await page.reload();
  await expect(page.locator(risoSelector)).toHaveAttribute("data-riso-source", "ready", { timeout: 20_000 });
  const afterReload = await observeInfinityCanvas(page);
  const afterReloadToRestored = await toggleWithContinuity(page, () => page.getByRole("switch", { name: "Infinity canvas", exact: true }).uncheck());
  const restored = await observeInfinityCanvas(page);
  const restoredToUndone = await toggleWithContinuity(page, () => page.getByRole("button", { name: "Undo", exact: true }).click());
  const undone = await observeInfinityCanvas(page);
  const infiniteExport = (await inspectImage(page, await downloadImage(page))).inspection;
  const undoneToRedone = await toggleWithContinuity(page, () => page.getByRole("button", { name: "Redo", exact: true }).click());
  const redone = await observeInfinityCanvas(page);
  await expectToolcraftInfinityCanvasModeEvidence(
    { before, enabled, afterPan, afterReload, restored, undone, redone },
    { beforeToEnabled, afterReloadToRestored, restoredToUndone, undoneToRedone },
    { expectedFiniteSize: { width: 1920, height: 1080 }, expectedSceneRect: { x: -960, y: -540, width: 1920, height: 1080 }, requirementId: "riso.infinity", target: "canvas.infinity" },
  );
  // The print is defined on the image frame, which covers the canvas, so both crops match.
  await expectToolcraftInfinityCanvasImageExportEvidence(
    { finite, infinite: infiniteExport },
    { expectedFiniteSize: { width: 2048, height: 1152 }, expectedInfiniteSize: { width: 2048, height: 1152 }, requirementId: "riso.infinity-export", target: "actions.output" },
  );
});
