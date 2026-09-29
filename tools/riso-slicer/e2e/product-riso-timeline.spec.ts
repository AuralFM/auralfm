import type { ToolcraftBrowserProofSession } from "./browser-proof-session";
import {
  expectToolcraftTimelineDuration,
  expectToolcraftTimelineLoop,
  expectToolcraftTimelinePauseResume,
  expectToolcraftTimelineRenderedFrame,
  expectToolcraftTimelineScrub,
  type ToolcraftTimelineLoopCycleProof,
  type ToolcraftTimelineLoopProof,
} from "./browser-timeline-evidence-helpers";
import { openRiso, risoSelector } from "./riso-test-helpers";
import { expect, test, type Page } from "./toolcraft-product-test";

const requirementId = "renderer.timeline";

async function frameSignature(page: Page): Promise<string> {
  return page.locator(risoSelector).evaluate((canvas: HTMLCanvasElement) => {
    const scratch = new OffscreenCanvas(128, 128);
    const context = scratch.getContext("2d", { willReadFrequently: true })!;
    context.imageSmoothingEnabled = false;
    context.drawImage(canvas, 0, 0, 128, 128);
    let hash = 2166136261;
    for (const value of context.getImageData(0, 0, 128, 128).data) hash = Math.imul(hash ^ value, 16777619);
    return (hash >>> 0).toString(16);
  });
}

function observeFrame(session: ToolcraftBrowserProofSession) {
  return session.observe((root) => {
    const canvas = root.querySelector<HTMLCanvasElement>("[data-riso-canvas]")!;
    const scratch = new OffscreenCanvas(128, 128);
    const context = scratch.getContext("2d", { willReadFrequently: true })!;
    context.imageSmoothingEnabled = false;
    context.drawImage(canvas, 0, 0, 128, 128);
    let hash = 2166136261;
    for (const value of context.getImageData(0, 0, 128, 128).data) hash = Math.imul(hash ^ value, 16777619);
    const scrubber = root.querySelector<HTMLElement>('[role="slider"][aria-label="Playback position"]')!;
    return { currentTimeSeconds: Number(scrubber.getAttribute("aria-valuenow")), outputSignature: (hash >>> 0).toString(16) };
  });
}

function observePlayback(session: ToolcraftBrowserProofSession) {
  return session.observe((root) => {
    const canvas = root.querySelector<HTMLCanvasElement>("[data-riso-canvas]")!;
    const scratch = new OffscreenCanvas(128, 128);
    const context = scratch.getContext("2d", { willReadFrequently: true })!;
    context.imageSmoothingEnabled = false;
    context.drawImage(canvas, 0, 0, 128, 128);
    let hash = 2166136261;
    for (const value of context.getImageData(0, 0, 128, 128).data) hash = Math.imul(hash ^ value, 16777619);
    const scrubber = root.querySelector<HTMLElement>('[role="slider"][aria-label="Playback position"]')!;
    return {
      currentTimeSeconds: Number(scrubber.getAttribute("aria-valuenow")),
      outputSignature: (hash >>> 0).toString(16),
      playing: Boolean(root.querySelector('[aria-label="Pause playback"]')),
    };
  });
}

async function setLoop(page: Page, enabled: boolean) {
  const toggle = page.getByRole("button", { name: enabled ? "Enable loop" : "Disable loop" });
  if (await toggle.isVisible()) await toggle.click();
}

async function setRatio(page: Page, ratio: number) {
  const box = await page.getByRole("slider", { name: "Playback position" }).boundingBox();
  if (!box) throw new Error("Timeline scrubber is unavailable.");
  await page.mouse.click(box.x + box.width * ratio, box.y + box.height / 2);
}

async function editDuration(page: Page, seconds: number) {
  await page.getByRole("button", { name: "Edit timeline duration" }).click();
  const editor = page.getByRole("textbox", { name: "timeline duration" });
  await editor.fill(String(seconds));
  await editor.press("Enter");
}

async function collectLoopCycle(page: Page): Promise<ToolcraftTimelineLoopCycleProof> {
  const scrubber = page.getByRole("slider", { name: "Playback position" });
  const durationSeconds = Number(await scrubber.getAttribute("aria-valuemax"));
  await setLoop(page, true);
  await scrubber.press("Home");
  const seamStartSignature = await frameSignature(page);
  await setLoop(page, false);
  await scrubber.press("End");
  const seamEndSignature = await frameSignature(page);
  await setLoop(page, true);
  // Start late in the cycle: the proof needs forward samples across one wrap, not a whole lap.
  await setRatio(page, 0.85);
  await page.getByRole("button", { name: "Play playback" }).click();
  // Sample in the page on every frame; a round trip per sample misses most frames.
  const normalizedPhases = await page.evaluate(
    (duration) => new Promise<number[]>((resolve) => {
      const scrubber = document.querySelector<HTMLElement>('[role="slider"][aria-label="Playback position"]')!;
      const phases: number[] = [];
      let wrapped = false;
      const deadline = performance.now() + 10_000;
      const sample = () => {
        // The loop end reads as the full duration; it is the same phase as the start.
        const phase = (Number(scrubber.getAttribute("aria-valuenow")) / duration) % 1;
        const previous = phases.at(-1);
        if (previous === undefined || Math.abs(phase - previous) > 0.001) {
          if (previous !== undefined && phase < previous) wrapped = true;
          phases.push(phase);
          if (wrapped && phases.length >= 5 && previous !== undefined && phase > previous) return resolve(phases);
        }
        if (performance.now() > deadline) return resolve(phases);
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }),
    durationSeconds,
  );
  await page.getByRole("button", { name: "Pause playback" }).click();
  expect(normalizedPhases.some((phase, index) => index > 0 && phase < normalizedPhases[index - 1]!)).toBe(true);
  return { durationSeconds, normalizedPhases, seamEndSignature, seamStartSignature };
}

test("browser: riso timeline loops the slices seamlessly", async ({ page }) => {
  const session = await openRiso(page);
  const scrubber = page.getByRole("slider", { name: "Playback position" });
  await expect(scrubber).toHaveAttribute("aria-valuemax", "4");

  await scrubber.press("Home");
  const start = await frameSignature(page);
  await setRatio(page, 0.25);
  const quarter = await frameSignature(page);
  expect(quarter).not.toBe(start);
  const quarterTime = Number(await scrubber.getAttribute("aria-valuenow"));
  await scrubber.press("Home");

  const frames = observeFrame(session);
  await expectToolcraftTimelineScrub(
    frames,
    session.targetAction("timeline.playback", (currentPage) => setRatio(currentPage, 0.25)),
    { currentTimeSeconds: quarterTime, outputSignature: quarter },
    { requirementId },
  );
  await expectToolcraftTimelineRenderedFrame(
    frames,
    session.targetAction("timeline.playback", async (currentPage) => {
      await currentPage.getByRole("slider", { name: "Playback position" }).press("Home");
    }),
    { currentTimeSeconds: 0, outputSignature: start },
    { requirementId },
  );

  const initial = await collectLoopCycle(page);
  await setLoop(page, false);
  await setRatio(page, 0.5);
  const midpoint = await frameSignature(page);
  await expectToolcraftTimelineDuration(
    session.observe((root) => {
      const duration = Number(root.querySelector<HTMLElement>('[role="slider"][aria-label="Playback position"]')!.getAttribute("aria-valuemax"));
      return { renderedCycleDurationSeconds: duration, timelineDurationSeconds: duration };
    }),
    session.targetAction("timeline.playback", (currentPage) => editDuration(currentPage, 2)),
    2,
    { requirementId },
  );
  // The same phase of the loop draws the same frame at the new duration.
  await setRatio(page, 0.5);
  await expect.poll(() => frameSignature(page)).toBe(midpoint);
  const resized = await collectLoopCycle(page);
  const proof: ToolcraftTimelineLoopProof = { initial, resized };
  await page.evaluate((value) => {
    (window as typeof window & { __risoLoopProof?: ToolcraftTimelineLoopProof }).__risoLoopProof = value;
  }, proof);
  await expectToolcraftTimelineLoop(
    session.observe(() => (window as typeof window & { __risoLoopProof: ToolcraftTimelineLoopProof }).__risoLoopProof),
    { requirementId },
  );

  await scrubber.press("Home");
  await page.getByRole("button", { name: "Play playback" }).click();
  await expect.poll(() => scrubber.getAttribute("aria-valuenow")).not.toBe("0");
  await expectToolcraftTimelinePauseResume(
    observePlayback(session),
    session.targetAction("timeline.playback", async (currentPage) => {
      await currentPage.getByRole("button", { name: "Pause playback" }).click();
    }),
    session.targetAction("timeline.playback", async (currentPage) => {
      await currentPage.getByRole("button", { name: "Play playback" }).click();
    }),
    { requirementId },
  );
});
