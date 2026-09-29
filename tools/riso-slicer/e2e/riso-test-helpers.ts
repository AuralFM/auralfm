import { Buffer } from "node:buffer";
import { expect, type Download, type Page } from "@playwright/test";

import { inspectToolcraftImageDownload } from "./image-artifact-inspection";

export const risoSelector = "[data-riso-canvas]";
export const field = (page: Page, target: string) => page.locator(`[data-toolcraft-control-target="${target}"]`);

/** A deterministic colourful 1600×1000 landscape, drawn in the page so no binary fixture is stored. */
export async function risoSampleImage(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const surface = new OffscreenCanvas(1600, 1000);
    const g = surface.getContext("2d")!;
    const sky = g.createLinearGradient(0, 0, 0, 1000);
    sky.addColorStop(0, "#1b2a6b");
    sky.addColorStop(0.45, "#e2477a");
    sky.addColorStop(0.75, "#ffb347");
    sky.addColorStop(1, "#fff1c9");
    g.fillStyle = sky;
    g.fillRect(0, 0, 1600, 1000);
    g.fillStyle = "#ffd23f";
    g.beginPath();
    g.arc(1050, 520, 180, 0, Math.PI * 2);
    g.fill();
    for (const [color, base, freq, amp] of [["#2c1d5c", 640, 0.004, 90], ["#0f5e73", 730, 0.006, 70], ["#07203a", 830, 0.009, 55]] as const) {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, 1000);
      for (let x = 0; x <= 1600; x += 8) g.lineTo(x, base - Math.sin(x * freq + base) * amp);
      g.lineTo(1600, 1000);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "#ffffff";
    g.fillRect(110, 140, 520, 130);
    return surface.convertToBlob({ type: "image/png" }).then((blob) => new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    }));
  });
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

export async function uploadRisoSample(page: Page, name = "riso-sample.png") {
  await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: "image/png", buffer: await risoSampleImage(page) });
  await expect(page.locator(risoSelector)).toHaveAttribute("data-riso-source", "ready", { timeout: 20_000 });
}

export async function pausePlayback(page: Page) {
  const pause = page.getByRole("button", { name: "Pause playback", exact: true });
  if (await pause.isVisible()) await pause.click();
}

/** Opens the app with the sample printed, playback paused and the whole frame in view. */
export async function openRiso(page: Page) {
  await page.goto("/");
  await page.locator(risoSelector).waitFor({ state: "attached" });
  await uploadRisoSample(page);
  await pausePlayback(page);
  await page.getByRole("slider", { name: "Playback position" }).press("Home").catch(() => undefined);
  for (let i = 0; i < 3; i += 1) await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("button", { name: "Center canvas", exact: true }).click();
}

export async function expandSection(page: Page, title: string) {
  const toggle = page.getByRole("button", { name: `Toggle ${title} section` });
  if ((await toggle.count()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

export async function setNumber(page: Page, target: string, value: number) {
  const control = field(page, target);
  await control.scrollIntoViewIfNeeded();
  const edit = control.getByRole("button", { name: /^Edit .* value$/ });
  const hasEditor = await edit.count();
  if (hasEditor) await edit.click();
  const input = hasEditor ? page.getByRole("textbox", { name: / value$/ }).filter({ visible: true }).first() : control.locator("input").filter({ visible: true }).first();
  await input.fill(String(value));
  await input.press("Enter");
}

export async function setChoice(page: Page, target: string, label: string) {
  await field(page, target).getByRole("combobox").click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

export async function chooseSegment(page: Page, target: string, label: string) {
  const control = field(page, target);
  await control.scrollIntoViewIfNeeded();
  await control.getByText(label, { exact: true }).click();
}

export async function dragNumber(page: Page, target: string, during?: () => Promise<void>) {
  const slider = field(page, target).getByRole("slider");
  await slider.scrollIntoViewIfNeeded();
  const rect = await slider.boundingBox();
  if (!rect) throw new Error(`Missing slider ${target}`);
  const before = await slider.getAttribute("aria-valuenow");
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  try {
    const min = Number(await slider.getAttribute("aria-valuemin"));
    const max = Number(await slider.getAttribute("aria-valuemax"));
    const direction = Number(before) > (min + max) / 2 ? -1 : 1;
    await page.mouse.move(rect.x + rect.width / 2 + direction * 70, rect.y + rect.height / 2, { steps: 7 });
    await expect(slider).not.toHaveAttribute("aria-valuenow", before!);
    await during?.();
  } finally {
    await page.mouse.up();
  }
}

export async function downloadImage(page: Page): Promise<Download> {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Export (PNG|JPG)$/ }).click();
  return pending;
}

export const inspectImage = (page: Page, download: Download, backgroundRgba: readonly [number, number, number, number] = [244, 240, 232, 255]) =>
  inspectToolcraftImageDownload({ page, download, backgroundRgba });

export async function panEmpty(page: Page) {
  const box = await page.getByRole("application", { name: "Canvas viewport" }).boundingBox();
  if (!box) throw new Error("Missing viewport");
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 85, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Space");
}
