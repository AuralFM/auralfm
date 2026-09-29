import { risoInkTargets, risoSelectorTargets, risoSliders, risoTarget, type RisoSliderParameter } from "../src/app/riso-params";
import { expectToolcraftProductObservableToChange, getToolcraftProductObservableSnapshot } from "./product-observable-helpers";
import { chooseSegment, dragNumber, expandSection, field, openRiso, risoSelector } from "./riso-test-helpers";
import { expect, test, type Page } from "./toolcraft-product-test";

const sectionTitle = { slices: "Slices", motion: "Motion", inks: "Inks", print: "Print" } as const;
const modeLabel = { strips: "Strips", grid: "Grid", radial: "Radial" } as const;

async function scrubTo(page: Page, ratio: number) {
  const scrubber = page.getByRole("slider", { name: "Playback position" });
  const box = await scrubber.boundingBox();
  if (!box) throw new Error("Timeline scrubber is unavailable.");
  await page.mouse.click(box.x + box.width * ratio, box.y + box.height / 2);
}

async function prepareFor(page: Page, parameter: RisoSliderParameter) {
  if (parameter.modes && parameter.modes.length === 1) await chooseSegment(page, risoSelectorTargets.mode, modeLabel[parameter.modes[0]!]);
  // Cycles only changes a frame away from the loop's start and end.
  if (parameter.key === "cycles") await scrubTo(page, 0.3);
  await expandSection(page, sectionTitle[parameter.section]);
}

for (const parameter of risoSliders as readonly RisoSliderParameter[]) {
  test(`browser: riso ${parameter.key} changes the print live`, async ({ page }) => {
    const session = await openRiso(page);
    await prepareFor(page, parameter);
    const target = risoTarget(parameter.key);
    const before = await getToolcraftProductObservableSnapshot(page, { selector: risoSelector });
    await expectToolcraftProductObservableToChange(
      session,
      session.controlAction(target, async () => {
        await dragNumber(page, target, async () => {
          // The print must respond while the pointer is still held.
          await expect.poll(() => getToolcraftProductObservableSnapshot(page, { selector: risoSelector })).not.toBe(before);
        });
      }),
      { requirementId: target, selector: risoSelector },
    );
  });
}

const selectorOptions: Record<keyof typeof risoSelectorTargets, readonly string[]> = {
  mode: ["Grid", "Radial", "Strips"],
  direction: ["Columns", "Rows"],
  pattern: ["Random", "Steps", "Wave"],
  inkCount: ["1", "2", "3"],
  screen: ["Halftone", "Tone", "Grain"],
};
const selectorSection: Record<keyof typeof risoSelectorTargets, string> = {
  mode: "Slices", direction: "Slices", pattern: "Slices", inkCount: "Inks", screen: "Print",
};

for (const [key, target] of Object.entries(risoSelectorTargets) as [keyof typeof risoSelectorTargets, string][]) {
  test(`browser: riso ${key} options change the print`, async ({ page }) => {
    const session = await openRiso(page);
    await expandSection(page, selectorSection[key]);
    for (const label of selectorOptions[key]) {
      await expectToolcraftProductObservableToChange(
        session,
        session.controlAction(target, async () => chooseSegment(page, target, label)),
        { requirementId: target, selector: risoSelector },
      );
    }
    if (key === "mode") {
      await chooseSegment(page, target, "Grid");
      await expect(field(page, risoTarget("columns"))).toBeVisible();
      await expect(field(page, risoTarget("count"))).toHaveCount(0);
      await chooseSegment(page, target, "Radial");
      await expect(field(page, risoTarget("rings"))).toBeVisible();
      await expect(field(page, risoSelectorTargets.direction)).toHaveCount(0);
    }
    if (key === "inkCount") {
      await chooseSegment(page, target, "1");
      await expect(field(page, risoInkTargets[1])).toHaveCount(0);
      await expect(field(page, risoTarget("misregistration"))).toHaveCount(0);
    }
  });
}

const inkHex = ["#00A95C", "#FF6C2F", "#765BA7"] as const;
const inkName = ["First ink", "Second ink", "Third ink"] as const;
risoInkTargets.forEach((target, index) => {
  test(`browser: riso ink ${index + 1} colour reprints the image`, async ({ page }) => {
    const session = await openRiso(page);
    await expandSection(page, "Inks");
    await expectToolcraftProductObservableToChange(
      session,
      session.controlAction(target, async () => {
        // Paired colours render as one row, so the input is found by its accessible name.
        const input = page.getByRole("textbox", { name: `${inkName[index]} hex`, exact: true });
        await input.fill(inkHex[index]!);
        await input.press("Enter");
      }),
      { requirementId: target, selector: risoSelector },
    );
  });
});
