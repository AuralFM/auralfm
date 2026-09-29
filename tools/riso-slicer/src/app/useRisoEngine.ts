import { useEffect, useState } from "react";
import { useToolcraftPipeline } from "@/toolcraft/runtime/react";

import { createRisoEngine, type RisoEngine } from "./riso-engine";
import { risoPipeline } from "./riso-pipeline";

export function useRisoEngine(canvas: HTMLCanvasElement | null): RisoEngine | null {
  const pipeline = useToolcraftPipeline();
  const [engine, setEngine] = useState<RisoEngine | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    if (!canvas || !pipeline) return;
    let active = true;
    const pass = risoPipeline.getPass("resources");
    const acquire = () =>
      pipeline.runPass(pass, { surface: "riso" }, (context) =>
        context.getOrCreateResource(["riso"], () => createRisoEngine(canvas), (value) => value.dispose()),
      );
    void (async () => {
      let result = await acquire();
      if (!result.isBoundTo(canvas)) {
        await pipeline.invalidatePass(pass).cleanup;
        result = await acquire();
      }
      if (active) setEngine(result);
    })().catch((cause: unknown) => {
      if (active) setError(new Error("Riso Slicer needs WebGL to print the image.", { cause }));
    });
    return () => {
      active = false;
    };
  }, [canvas, pipeline]);
  if (error) throw error;
  return canvas && engine?.isBoundTo(canvas) ? engine : null;
}
