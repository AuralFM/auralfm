# Toolcraft App Agent Worklog

## Status

Mode: product

Active change: riso-slicer-first-delivery

## Decision Trail

### riso-slicer-first-delivery

- Change ID: riso-slicer-first-delivery
- Request: "i would like to make a toolcraft.sh tool as Image slicer tool + risograph shader an example would be this gif https://x.com/i/status/2104651460570952024"
- Task type: first product delivery (renderer, controls, timeline, media, export).
- User-visible result: Riso Slicer. Upload one image; it is cut into strips, a grid of tiles or radial rings that slide or turn on a seamless timeline loop, separated into one to three riso inks, screened as grain, halftone or tone, with ink misregistration and per-pass drift, and exported as PNG/JPG.
- Source/reference checked: The linked GIF on x.com could not be opened (the environment's egress proxy blocks x.com). The user was asked what the slicing does and answered "all these options would be great" to: strips that slide/offset, grid tiles that shuffle, slices plus ink misregistration, radial/ring slices. All four are implemented. The toolcraft.sh starter kit (github.com/dellreey/toolcraft) and its neon-iceberg example were read for the current composition/pipeline API.
- Reference inputs: None. The GIF was unreachable, so no frames were studied and `referenceInputs` is empty; the behaviour comes from the user's answer, not from reference parity.
- Docs/contracts read: workflow.md, core/media-upload.md, core/setup-export.md, core/runtime-boundary.md, core/timeline-animation.md, core/layout.md, core/performance.md, renderer-technique.md, schema-reference.md, acceptance-testing.md.
- Contract rules applied: editable-output canvas with runtime-owned background; uploaded source via `fileDrop` with no placeholder art; `renderDefaultCanvasMedia: false` with a custom renderer that consumes the runtime media transform; playback timeline with a product-derived loop; image export only (no SVG/video request); product styles only in a local CSS module; no DOM listeners, element factories or DOM-holding product objects.
- View interaction intent: `non-spatial` — the product is a flat printed image with no camera.
- Interaction ownership: slice Offset and Misregistration are global property edits owned by the panel; canvas drag was rejected because it would edit one slice/plate while the effect applies to all.
- Decision: One full-frame WebGL2 fragment pass per frame. Each ink plate maps its output position through the slice geometry (strip wrap, tile shift/shuffle, ring rotation with mirrored sampling) at its own lagged loop phase, samples the prepared source, separates coverage with a least-squares Beer–Lambert model against the chosen ink colours, applies ink texture and the chosen screen, and multiplies plates on white. The result is unmixed from white so it stays a transparent foreground over the runtime paper colour.
- Alternatives rejected: Three.js WebGLRenderer (it stores the DOM canvas in a structural object, which the product boundary rejects, and its type graph overflowed the boundary checker); Canvas 2D per-pixel CPU slicing (too slow for live drags at retina backing); SVG (the output is dithered raster by nature).
- State/output mapping: `source.image` → decoded once, cover-cropped with the runtime rotation/flip into the asset's scene frame, uploaded as a texture; `slices.*` → slice geometry uniforms; `motion.*` and timeline playback progress → slice phase and per-ink lag; `inks.*` → separation matrix, ink colours, density and contrast; `print.*` → screen, texture, misregistration and drift; export renders the same pass in 2048 px tiles at the selected resolution into the runtime export context.
- Verification: Interactive checks in headless Chromium against the dev server: upload renders; Strips/Grid/Radial and Grain/Halftone/Tone each print distinctly; the timeline animates the slices. Typecheck passed before the WebGL2 port. The protected delivery gate has not been run yet; see Verification below for the current state.
- Risks: see Risks.

## Decisions

### Renderer

- Decision: Native WebGL2 single-pass fragment renderer (`src/app/riso-engine.ts`, `src/app/riso-shaders.ts`); source preparation through `fetch` → `createImageBitmap` → `OffscreenCanvas`.
- Reason: The effect is a per-pixel function of the source and a handful of uniforms, so one stateless full-screen pass keeps live drags and playback cheap at the selected backing scale.
- Evidence: Output is bounded to the uploaded image's frame (`sceneBounds: intrinsic`): strips and tiles wrap inside it, rings mirror inside it, and plates that drift past the edge leave the page.

### View Interaction

- Decision: non-spatial.
- Reason: No three-dimensional scene exists.
- Evidence: The renderer draws a flat image frame; there is no orientation target.

### Interaction Ownership

- Decision: Every product control is a global panel property edit.
- Reason: Each setting applies to all slices or all plates at once.
- Evidence: `interactionOwnership` in `src/app/riso-inventory.ts`.

### Timeline

- Decision: Playback timeline, 4 s default loop.
- Reason: The reference is a looping GIF; every motion term is periodic in loop progress (whole cycles per loop, stepped patterns wrap), so the first and last frames match at any duration.
- Evidence: `getRisoProgress` reads runtime playback time over runtime duration; there is no local clock.

### Layers

- Decision: No layers.
- Reason: The user did not ask for a layer workflow; there is one source image.
- Evidence: `layersModule()` is not enabled.

### Controls

- Decision: Sections Source, Slices, Motion, Inks, Print, with Background relocated into Setup by the runtime.
- Reason: Each section is one reset scope for one part of the print. Mode-specific counts (Strips / Columns, Rows / Rings, Wedges) and pattern/screen/ink-count dependents are conditional, so only usable controls show.
- Evidence: `appControlSectionInventory` in `src/app/riso-inventory.ts`.

### Export

- Decision: Image export only (PNG/JPG, 2K/4K/8K).
- Reason: The request names no export format; video was not requested, and the GIF was an example of the look, not a request for GIF output.
- Evidence: `exportIntent` records image `toolcraft-default`, SVG and video `not-requested`.

### Performance

- Decision: One `preview-scale` dimension (render scale) and one `export-edge` dimension (export resolution); the source pass is bounded by a 4096 px long-edge cap.
- Reason: Cost is quadratic in output pixels and constant in every other control.
- Evidence: `src/app/riso-pipeline.ts`, `src/app/app-performance.ts`. No measured performance has been run.

## Evidence

- Source reviewed: toolcraft.sh starter (v0.0.26 generator), neon-iceberg example, local contract docs.
- Contract applied: see the first-delivery Decision Trail entry.

## Verification

Functional checks so far were manual headless-browser inspections during development. The protected `npm run verify:delivery` gate has not produced a receipt yet.

## Risks

- Risk: The reference GIF was never seen; slice styles follow the user's description, so the default look may differ from the example.
- Risk: The sandbox has no IPv6, so the generated port finder needed an environment-only shim to start the dev server here; this does not affect normal machines.
