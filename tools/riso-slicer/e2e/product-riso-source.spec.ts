import { risoSourceTarget } from "../src/app/riso-params";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftMediaLifecycle } from "./browser-state-evidence-helpers";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { pausePlayback, risoSampleImage, risoSelector } from "./riso-test-helpers";
import { expect, test } from "./toolcraft-product-test";

test("browser: riso source upload, transform and removal", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator(risoSelector).waitFor({ state: "attached" });
  await pausePlayback(page);
  await expect(page.locator(risoSelector)).toHaveAttribute("data-riso-source", "empty");

  const session = await createToolcraftBrowserProofSession(page);
  const media = session.observe((root) => ({
    itemIds: Array.from(root.querySelectorAll<HTMLImageElement>('[data-toolcraft-control-target="source.image"] img')).map((image) => image.alt),
    outputSignature: root.querySelector("[data-riso-canvas]")?.getAttribute("data-riso-source") === "ready" ? "printed" : "empty",
  }));
  const sample = await risoSampleImage(page);

  await expectToolcraftMediaLifecycle(
    media,
    session.targetAction(risoSourceTarget, async (currentPage) => {
      await currentPage.locator('input[type="file"]').first().setInputFiles({ name: "riso-sample.png", mimeType: "image/png", buffer: sample });
    }),
    { itemIds: ["riso-sample.png"], outputSignature: "printed" },
    { requirementId: risoSourceTarget },
  );

  // Uploading keeps the canvas size and prints the image as a cover crop.
  await expect(page.getByRole("textbox", { name: "Canvas width" })).toHaveValue("1920");

  for (const action of ["90° Right", "Flip horizontal", "Flip vertical"]) {
    await expectToolcraftProductObservableToChange(page, async () => {
      await page.getByRole("button", { name: action, exact: true }).click();
    }, { selector: risoSelector });
  }

  await expectToolcraftMediaLifecycle(
    media,
    session.targetAction(risoSourceTarget, async (currentPage) => {
      await currentPage.getByRole("button", { name: /^Remove riso-sample/ }).first().press("Enter");
    }),
    { itemIds: [], outputSignature: "empty" },
    { requirementId: risoSourceTarget },
  );

  await page.locator('input[type="file"]').first().setInputFiles({ name: "second.png", mimeType: "image/png", buffer: sample });
  await expect(page.locator(risoSelector)).toHaveAttribute("data-riso-source", "ready", { timeout: 20_000 });
  await expectToolcraftMediaLifecycle(
    media,
    session.targetAction(risoSourceTarget, async (currentPage) => {
      await currentPage.getByRole("button", { name: "Reset Source section", exact: true }).click();
    }),
    { itemIds: [], outputSignature: "empty" },
    { requirementId: risoSourceTarget },
  );
  expect(errors).toEqual([]);
});
