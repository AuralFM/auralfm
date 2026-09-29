# Riso Slicer

A [toolcraft.sh](https://toolcraft.sh) tool: upload an image, cut it into animated strips, a grid of tiles or radial rings, and print it as one to three layered risograph inks (grain, halftone or tone screen) with misregistration between the colour passes.

## Status of this folder

This commit holds the product-owned source only (`src/app/riso-*`, `RisoCanvas*`, `useRisoEngine.ts`, `app-*.ts` product files, `e2e/product-riso-*.spec.ts`, `e2e/riso-test-helpers.ts`, `docs/toolcraft/agent-worklog.md`). The Toolcraft framework files around it come from the generator:

```bash
cd tools
npx --yes @pixel-point/toolcraft create riso-slicer --yes   # generator v0.0.26
```

and are committed together with the product source once verified.

## Run

```bash
npm install
npm run dev      # http://localhost:3002
```

Drop an image on the canvas or into Source, then use Slices, Motion, Inks and Print. Play the timeline to animate; export from the footer.
