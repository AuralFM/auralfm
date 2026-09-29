import { appAcceptance, appControlSectionInventory, getToolcraftApplicabilityRequirementId, getToolcraftControlApplicabilityCases, type ToolcraftControlApplicabilityCase } from "../src/app/app-acceptance";
import { appSchema } from "../src/app/app-schema";
import { risoInkTargets, risoSelectorTargets, risoSliders, risoTarget, type RisoSliderParameter } from "../src/app/riso-params";
import { expectToolcraftControlApplicabilityState } from "./browser-control-applicability-evidence";
import type { ToolcraftBrowserProofSession } from "./browser-proof-session";
import { deriveToolcraftBrowserRuntimeRequirements } from "./browser-runtime-evidence-requirements";
import { expectToolcraftDiscreteSliderMarkers, expectToolcraftSegmentedControlCellsPreservePadding } from "./performance-control-layout-helpers";
import { expectToolcraftProductObservableToChange, getToolcraftProductObservableSnapshot } from "./product-observable-helpers";
import { chooseSegment, dragNumber, field, openRiso, risoSelector } from "./riso-test-helpers";
import { expect, test, type Page } from "./toolcraft-product-test";

type RisoSection = RisoSliderParameter["section"];

const sectionTitle = { slices: "Slices", motion: "Motion", inks: "Inks", print: "Print" } as const;
const modeLabel = { strips: "Strips", grid: "Grid", radial: "Radial" } as const;

const selectorOptions: Record<keyof typeof risoSelectorTargets, readonly string[]> = {
  mode: ["Grid", "Radial", "Strips"],
  direction: ["Columns", "Rows"],
  pattern: ["Random", "Steps", "Wave"],
  inkCount: ["1", "2", "3"],
  screen: ["Halftone", "Tone", "Grain"],
};
const selectorLabel: Record<keyof typeof risoSelectorTargets, string> = {
  mode: "Style", direction: "Direction", pattern: "Pattern", inkCount: "Drums", screen: "Screen",
};

const inkHex = ["#00A95C", "#FF6C2F", "#765BA7"] as const;
const inkName = ["First ink", "Second ink", "Third ink"] as const;
/** Distinct colours for the per-case reprints, so every fill is a real change. */
const casePalette = ["#E4572E", "#17BEBB", "#76B041", "#FFC914", "#2E282A", "#8E6C8A"] as const;

const runtimeRequirements = deriveToolcraftBrowserRuntimeRequirements(appAcceptance, appSchema, appControlSectionInventory);

/** Evidence types the delivery gate expects from one test, keyed by requirement id. */
function requirementsFor(testName: string) {
  const byId = new Map<string, Set<string>>();
  for (const requirement of runtimeRequirements.filter((entry) => entry.testName === testName)) {
    const types = byId.get(requirement.requirementId) ?? new Set<string>();
    types.add(requirement.evidenceType);
    byId.set(requirement.requirementId, types);
  }
  return byId;
}

async function scrubTo(page: Page, ratio: number) {
  const scrubber = page.getByRole("slider", { name: "Playback position" });
  const box = await scrubber.boundingBox();
  if (!box) throw new Error("Timeline scrubber is unavailable.");
  await page.mouse.click(box.x + box.width * ratio, box.y + box.height / 2);
}

/**
 * Opens only the sections a test uses and collapses the rest: control lookups
 * walk every rendered control, so a short panel keeps each step cheap.
 */
async function focusSections(page: Page, targets: readonly string[]) {
  const wanted = new Set(targets.map((target) => sectionTitle[target.split(".")[0] as RisoSection]).filter(Boolean));
  const toggles = page.getByRole("button", { name: /^Toggle .+ section$/ });
  for (const toggle of await toggles.all()) {
    const title = (await toggle.getAttribute("aria-label"))!.replace(/^Toggle (.+) section$/, "$1");
    const expanded = (await toggle.getAttribute("aria-expanded")) === "true";
    if (expanded !== wanted.has(title as (typeof sectionTitle)[RisoSection])) await toggle.click();
  }
}

function casesFor(target: string) {
  return getToolcraftControlApplicabilityCases({ schema: appSchema, sectionInventory: appControlSectionInventory, target });
}

/** Steps a slider by its large step, away from whichever end is nearer. */
async function nudgeNumber(page: Page, target: string) {
  const slider = field(page, target).getByRole("slider");
  await slider.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  const value = Number(await slider.getAttribute("aria-valuenow"));
  const min = Number(await slider.getAttribute("min"));
  const max = Number(await slider.getAttribute("max"));
  await slider.focus();
  await slider.press(value > (min + max) / 2 ? "PageDown" : "PageUp");
  await expect(slider).not.toHaveAttribute("aria-valuenow", String(value));
}

/**
 * Walks every applicability case the acceptance model derives for `target`:
 * selects the case's option, proves the control is shown or hidden, and when
 * shown proves `change` still reprints the image. Each selector is first set
 * to a value that shows the control, so cases of one selector are not masked
 * by another selector's last case, and is put back after its own cases.
 */
async function proveApplicabilityCases(
  page: Page,
  session: ToolcraftBrowserProofSession,
  target: string,
  requirements: Map<string, Set<string>>,
  change: (caseIndex: number) => Promise<void>,
  afterVisible?: (requirementId: string) => Promise<void>,
) {
  const cases = casesFor(target);
  const groups = new Map<string, ToolcraftControlApplicabilityCase[]>();
  for (const entry of cases) groups.set(entry.selectorTarget, [...(groups.get(entry.selectorTarget) ?? []), entry]);
  const showing = (group: readonly ToolcraftControlApplicabilityCase[]) => group.find((entry) => entry.expectation === "visible");
  const select = (entry: ToolcraftControlApplicabilityCase) => chooseSegment(page, entry.selectorTarget, entry.selectorOptionLabel ?? String(entry.selectorValue));

  for (const group of groups.values()) {
    const visible = showing(group);
    if (visible) await select(visible);
  }
  let caseIndex = 0;
  for (const group of groups.values()) {
    for (const entry of group) {
      await expectToolcraftControlApplicabilityState(
        session,
        session.controlAction(entry.selectorTarget, async () => select(entry)),
        entry,
        { baseRequirementId: target },
      );
      if (entry.expectation !== "visible") continue;
      const requirementId = getToolcraftApplicabilityRequirementId(target, entry);
      if (requirements.get(requirementId)?.has("product-observable-change")) {
        const index = caseIndex;
        await expectToolcraftProductObservableToChange(
          session,
          session.controlAction(target, async () => change(index)),
          { requirementId, selector: risoSelector },
        );
      }
      caseIndex += 1;
      await afterVisible?.(requirementId);
    }
    const visible = showing(group);
    if (visible) await select(visible);
  }
}

/**
 * Registers the live-print proofs for one control section. The delivery catalog
 * allows one acceptance domain per browser file, so each section has its own spec.
 */
export function registerRisoControlTests(section: RisoSection) {
  for (const parameter of (risoSliders as readonly RisoSliderParameter[]).filter((entry) => entry.section === section)) {
    const testName = `browser: riso ${parameter.key} changes the print live`;
    test(testName, async ({ page }) => {
      const requirements = requirementsFor(testName);
      const target = risoTarget(parameter.key);
      const session = await openRiso(page);
      await focusSections(page, [target, risoSelectorTargets.mode, ...casesFor(target).map((entry) => entry.selectorTarget)]);
      if (parameter.modes && parameter.modes.length === 1) await chooseSegment(page, risoSelectorTargets.mode, modeLabel[parameter.modes[0]!]);
      // Cycles only changes a frame away from the loop's start and end.
      if (parameter.key === "cycles") await scrubTo(page, 0.3);
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
      if (requirements.get(target)?.has("discrete-slider-layout")) await expectToolcraftDiscreteSliderMarkers(page, target);
      await proveApplicabilityCases(page, session, target, requirements, () => nudgeNumber(page, target), async (requirementId) => {
        if (requirements.get(requirementId)?.has("discrete-slider-layout")) await expectToolcraftDiscreteSliderMarkers(page, target, requirementId);
      });
    });
  }

  for (const [key, target] of (Object.entries(risoSelectorTargets) as [keyof typeof risoSelectorTargets, string][]).filter(([, value]) => value.startsWith(`${section}.`))) {
    const testName = `browser: riso ${key} options change the print`;
    test(testName, async ({ page }) => {
      const requirements = requirementsFor(testName);
      const session = await openRiso(page);
      await focusSections(page, [target, ...casesFor(target).map((entry) => entry.selectorTarget), ...(key === "inkCount" ? [risoTarget("misregistration")] : [])]);
      for (const label of selectorOptions[key]) {
        await expectToolcraftProductObservableToChange(
          session,
          session.controlAction(target, async () => chooseSegment(page, target, label)),
          { requirementId: target, selector: risoSelector },
        );
      }
      const layout = async (requirementId: string) => {
        if (requirements.get(requirementId)?.has("segmented-control-layout")) {
          await expectToolcraftSegmentedControlCellsPreservePadding(page, selectorLabel[key], { requirementId, target });
        }
      };
      await layout(target);
      // Each shown case picks the next option, so every pick is a change.
      const options = selectorOptions[key];
      await proveApplicabilityCases(page, session, target, requirements, (index) => chooseSegment(page, target, options[index % options.length]!), layout);
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

  if (section === "inks") risoInkTargets.forEach((target, index) => {
    const testName = `browser: riso ink ${index + 1} colour reprints the image`;
    test(testName, async ({ page }) => {
      const requirements = requirementsFor(testName);
      const session = await openRiso(page);
      await focusSections(page, [target, ...casesFor(target).map((entry) => entry.selectorTarget)]);
      // Paired colours render as one row, so the input is found by its accessible name.
      const fill = async (hex: string) => {
        const input = page.getByRole("textbox", { name: `${inkName[index]} hex`, exact: true });
        await input.fill(hex);
        await input.press("Enter");
      };
      await expectToolcraftProductObservableToChange(
        session,
        session.controlAction(target, async () => fill(inkHex[index]!)),
        { requirementId: target, selector: risoSelector },
      );
      await proveApplicabilityCases(page, session, target, requirements, (caseIndex) => fill(casePalette[caseIndex % casePalette.length]!));
    });
  });
}
