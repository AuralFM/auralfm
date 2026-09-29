import { composeToolcraftApp } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { getRisoProgress } from "./riso-animation";
import { readRisoSettings } from "./riso-params";
import { risoPipeline } from "./riso-pipeline";
import { getRisoSceneRect, getRisoSourceAsset, getRisoSourceKey } from "./riso-source";
import { RisoCanvas } from "./RisoCanvas";

export const appComposition = composeToolcraftApp(appSchema, {
  renderer: { pipelineRegistration: risoPipeline },
  scene: {
    canvasContent: <RisoCanvas />,
    renderDefaultCanvasMedia: false,
    sceneBoundsProvider: ({ state }) => {
      const rect = getRisoSceneRect(state);
      return rect ? [rect] : [];
    },
    rasterFrameRenderer: {
      baseFileName: "riso-slicer",
      renderFrame: async (request) => {
        const asset = getRisoSourceAsset(request.state);
        if (!asset) return;
        if (!request.rendererPipeline) throw new Error("The riso renderer is unavailable.");
        // The live preview owns the WebGL context and the prepared source; export renders into its own target.
        const engine = await request.rendererPipeline.runPass(risoPipeline.getPass("resources"), { surface: "riso" }, (context) =>
          context.getOrCreateResource(["riso"], () => {
            throw new Error("Wait for the riso preview to finish loading.");
          }, (value) => value.dispose()),
        );
        if (engine.sourceKey() !== getRisoSourceKey(asset)) throw new Error("Wait for the source image to finish loading.");
        await request.rendererPipeline.runPass(risoPipeline.getPass("export"), undefined, () =>
          engine.exportFrame(
            {
              settings: readRisoSettings(request.state.values),
              progress: getRisoProgress(request.state.timeline),
              frameWidth: request.frame.width,
              frameHeight: request.frame.height,
            },
            request,
          ),
        );
      },
    },
  },
});
