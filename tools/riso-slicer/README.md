# Riso Slicer

A [toolcraft.sh](https://toolcraft.sh) tool: upload an image, cut it into animated strips, a grid of tiles or radial rings, and print it as one to three layered risograph inks (grain, halftone or tone screen) with misregistration between the colour passes.

## Layout

The app was generated with `npx @pixel-point/toolcraft create riso-slicer` (generator v0.0.26). Product code lives in `src/app/riso-*`, `src/app/RisoCanvas*`, `src/app/useRisoEngine.ts` and the `src/app/app-*` product files; browser proofs are `e2e/product-riso-*.spec.ts`. Everything else is Toolcraft framework code and is covered by its integrity check. Decisions and verification are logged in `docs/toolcraft/agent-worklog.md`.

## Run

```bash
npm install
npm run dev      # http://localhost:3002
npm test         # integrity, unit and script tests
npm run test:browser # browser proofs
```

Drop an image on the canvas or into Source, then use Slices, Motion, Inks and Print. Play the timeline to animate; export from the footer.
