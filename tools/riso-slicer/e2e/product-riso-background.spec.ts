import { expectToolcraftBackgroundOutputSemantics } from "./browser-background-output-evidence";
import { expectToolcraftInfinityCanvasBackgroundEvidence, observeInfinityCanvasBackground } from "./browser-infinity-canvas-evidence";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { downloadImage, field, inspectImage, openRiso, setChoice } from "./riso-test-helpers";
import { expect, test } from "./toolcraft-product-test";

test("browser: riso paper background matches preview and artifact", async ({ page }) => {
  await openRiso(page);
  const session = await createToolcraftBrowserProofSession(page);
  await setChoice(page, "export.image.resolution", "2K");
  await page.getByRole("switch", { name: "Background", exact: true }).setChecked(true);
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("appearance.background", async () => {
      const input = page.getByRole("textbox", { name: "Background color hex" });
      await input.fill("#D9E7F5");
      await input.press("Enter");
    }),
    { requirementId: "background.color", selector: "[data-toolcraft-editable-canvas]" },
  );
  const observation = session.observe((root) => {
    const background = root.querySelector<HTMLElement>("[data-toolcraft-finite-background-layer]");
    return { backgroundVisible: Boolean(background), outputSignature: background ? getComputedStyle(background).backgroundColor : "transparent-foreground" };
  });
  await expectToolcraftBackgroundOutputSemantics(
    observation,
    session.controlAction("export.includeBackground", async (control) => control.getByRole("switch").uncheck()),
    { backgroundVisible: false, outputSignature: "transparent-foreground" },
    session.targetAction("actions.output", () => downloadImage(page)),
    async (download) => {
      const image = await inspectImage(page, download, [0, 0, 0, 0]);
      expect(image.observation.nonBackgroundBounds).not.toBeNull();
      return { ...image.inspection, contentHash: image.inspection.decodedPixelHash, backgroundAlpha: image.observation.normalizedPixels[3] };
    },
    { requirementId: "background.include" },
  );
  await page.getByRole("switch", { name: "Background", exact: true }).check();
  await page.getByRole("switch", { name: "Infinity canvas", exact: true }).check();
  const infinite = await observeInfinityCanvasBackground(page);
  await page.getByRole("switch", { name: "Background", exact: true }).uncheck();
  const backgroundExcluded = await observeInfinityCanvasBackground(page);
  await page.getByRole("switch", { name: "Background", exact: true }).check();
  const backgroundRestored = await observeInfinityCanvasBackground(page);
  await expectToolcraftInfinityCanvasBackgroundEvidence(
    { infinite, backgroundExcluded, backgroundRestored },
    { expectedBackgroundColor: "#D9E7F5", requirementId: "background.include", target: "export.includeBackground" },
  );
  await expect(field(page, "appearance.background")).toBeVisible();
});
