import { expectToolcraftCanvasRenderScaleEvidence } from "./browser-render-scale-evidence";
import { expectToolcraftDiscreteSliderMarkers } from "./performance-control-layout-helpers";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { expandSection, field, openRiso, risoSelector, setNumber } from "./riso-test-helpers";
import { expect, test } from "./toolcraft-product-test";

test("browser: riso keeps selected backing resolution", async ({ page }) => {
  const session = await openRiso(page);
  await expectToolcraftProductObservableToChange(
    session,
    // openRiso starts at scale 1; returning to the default 2 doubles the backing.
    session.controlAction("canvas.renderScale", async () => setNumber(page, "canvas.renderScale", 2)),
    { requirementId: "riso.backing", selector: risoSelector },
  );
  await expectToolcraftDiscreteSliderMarkers(page, "canvas.renderScale", "riso.backing");
  await expandSection(page, "Print");
  const slider = field(page, "print.grain").getByRole("slider");
  await slider.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const box = (await slider.boundingBox())!;
  await expectToolcraftCanvasRenderScaleEvidence(page, {
    canvasSelector: risoSelector,
    requirementId: "riso.backing",
    target: "canvas.renderScale",
    selectedScale: 2,
    stateTransitions: [
      { state: "interaction", run: async () => { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 36, box.y + box.height / 2, { steps: 4 }); } },
      { state: "playback", run: async () => { await page.mouse.up(); await page.getByRole("slider", { name: "Playback position" }).press("Home"); await page.getByRole("button", { name: "Play playback" }).click(); await expect(page.getByRole("button", { name: "Pause playback" })).toBeVisible(); } },
      { state: "steady", run: async () => { await page.getByRole("button", { name: "Pause playback" }).click(); await expect(slider).not.toHaveAttribute("aria-valuenow", "0.35"); } },
    ],
  });
});
