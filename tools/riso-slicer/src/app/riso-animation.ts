import { getToolcraftTimelinePlaybackTime, type ToolcraftTimelineState } from "@/toolcraft/runtime";

/** A product-derived loop: long enough to read each slice travel, short enough to feel like a GIF. */
export const RISO_LOOP_SECONDS = 4;

export type RisoTimeline = Pick<ToolcraftTimelineState, "currentTimeSeconds" | "durationSeconds" | "isLooping">;

/** Loop progress in [0, 1]; the renderer's motion is periodic in it, so 0 and 1 draw the same frame. */
export function getRisoProgress(timeline: RisoTimeline): number {
  if (!Number.isFinite(timeline.durationSeconds) || timeline.durationSeconds <= 0) return 0;
  return getToolcraftTimelinePlaybackTime(timeline) / timeline.durationSeconds;
}
