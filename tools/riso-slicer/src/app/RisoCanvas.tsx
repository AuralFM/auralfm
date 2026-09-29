import { useEffect, useMemo, useRef, useState } from "react";
import {
  useToolcraftMediaPresentationUrls,
  useToolcraftPipeline,
  useToolcraftProductSceneFrame,
  useToolcraftSelector,
  useToolcraftViewportInteractionActive,
} from "@/toolcraft/runtime/react";

import { getRisoProgress, type RisoTimeline } from "./riso-animation";
import { readRisoSettings } from "./riso-params";
import { risoPipeline, risoRenderTargets } from "./riso-pipeline";
import { getRisoSourceAsset, getRisoSourceKey, loadRisoSource } from "./riso-source";
import { useRisoEngine } from "./useRisoEngine";
import styles from "./RisoCanvas.module.css";

const previewTargets = [...risoRenderTargets, "canvas.renderScale"];

export function RisoCanvas() {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const frame = useToolcraftProductSceneFrame();
  const pipeline = useToolcraftPipeline();
  const engine = useRisoEngine(canvas);
  const values = useToolcraftSelector(
    (state) => state.values,
    (a, b) => previewTargets.every((target) => a[target] === b[target]),
  );
  const timeline = useToolcraftSelector<RisoTimeline>(
    (state) => ({
      currentTimeSeconds: state.timeline.currentTimeSeconds,
      durationSeconds: state.timeline.durationSeconds,
      isLooping: state.timeline.isLooping,
    }),
    (a, b) => a.currentTimeSeconds === b.currentTimeSeconds && a.durationSeconds === b.durationSeconds && a.isLooping === b.isLooping,
  );
  const zoom = useToolcraftSelector((state) => state.canvas.zoom);
  const asset = useToolcraftSelector((state) => getRisoSourceAsset(state));
  const assets = useMemo(() => (asset ? [asset] : []), [asset]);
  const sourceUrl = useToolcraftMediaPresentationUrls(assets).get(asset?.id ?? "");
  const sourceKey = asset ? getRisoSourceKey(asset) : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  // Hold the animation still while the viewport is being dragged or zoomed.
  const viewportActive = useToolcraftViewportInteractionActive();
  const heldTimeline = useRef(timeline);
  if (!viewportActive) heldTimeline.current = timeline;
  const renderedTimeline = viewportActive ? heldTimeline.current : timeline;

  const dpr = window.devicePixelRatio || 1;

  useEffect(() => {
    if (!engine || !pipeline) return;
    if (!asset || !sourceKey || !sourceUrl) {
      engine.setSource(null);
      setLoadedKey(null);
      return;
    }
    const controller = new AbortController();
    void pipeline
      .runPass(risoPipeline.getPass("source"), { "source.image": sourceKey }, () => loadRisoSource(sourceUrl, asset, controller.signal))
      .then((prepared) => {
        if (controller.signal.aborted) return;
        engine.setSource({ key: sourceKey, pixels: prepared });
        setLoadedKey(sourceKey);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error("Riso Slicer could not read the source image.", error);
      });
    return () => controller.abort();
  }, [engine, pipeline, asset, sourceKey, sourceUrl]);

  const settings = useMemo(() => readRisoSettings(values), [values]);
  const frameWidth = frame.kind === "ready" ? frame.rect.width : 0;
  const frameHeight = frame.kind === "ready" ? frame.rect.height : 0;
  useEffect(() => {
    if (!engine || !pipeline || frame.kind !== "ready") return;
    const scale = Number(values["canvas.renderScale"] ?? 2) * (zoom / 100) * dpr;
    const width = Math.max(1, Math.round(frameWidth * scale));
    const height = Math.max(1, Math.round(frameHeight * scale));
    const progress = getRisoProgress(renderedTimeline);
    void pipeline.runPass(risoPipeline.getPass("preview"), undefined, () => {
      engine.draw({ settings, progress, frameWidth, frameHeight }, width, height);
    });
  }, [engine, pipeline, settings, values, renderedTimeline, zoom, dpr, frame.kind, frameWidth, frameHeight, loadedKey]);

  return (
    <canvas
      ref={setCanvas}
      className={styles.canvas}
      data-riso-canvas=""
      data-riso-source={loadedKey ? "ready" : "empty"}
      data-toolcraft-product-output=""
      aria-label="Riso print of the source image"
    />
  );
}
