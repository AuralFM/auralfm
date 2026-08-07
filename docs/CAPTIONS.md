# Live captions, and why they were removed

**Status: removed from the app on 7 August 2026.** The code worked. It is gone
because of what it cost, not because of what it did.

This document exists so the work does not have to be repeated. Everything below
was established by measurement on real hardware, and the numbers are the reason
for the decision rather than an illustration of it.

## What it did

Transcribed the audio of whatever was playing, live, on the listener's own
machine. Nothing was sent anywhere: the model ran locally, so a broadcast in
Farsi became readable text without a sentence of it reaching a server.

That is a genuinely good idea and it is the single feature most aligned with
what this project argues. `docs/LISTENING.md` sets out the case: an industry
that withholds translation keeps the listener in a fantasy about the place they
are hearing, and captions invert that. The moment a Tehran broadcast becomes a
sentence you can read, it stops being texture and becomes somebody complaining
about traffic.

## How it worked

**Model.** OpenAI Whisper, in ONNX form, from `onnx-community/whisper-base`,
with `whisper-tiny` and `whisper-small` selectable. Run through
`@huggingface/transformers` on `onnxruntime-web`, single-threaded WASM.

**Delivery.** Nothing shipped in the app. `src/captions-runtime.js` downloaded
the runtime on first use into the user's application support directory, with
**every file verified against a pinned SHA-256** before it was allowed to
execute. That check was the point: a feature that fetches executable code at
runtime and trusts whatever arrives is a supply-chain hole, and the hashes were
what made it defensible.

**Audio path.** A `MediaElementSource` tapped the existing player, chunked into
passes, downsampled to the 16 kHz Whisper is trained on, and handed to the
pipeline off the audio thread.

**Version pin, which matters if anyone tries again.** Pinned to
`@huggingface/transformers` **3.8.1**, which pins `onnxruntime-web` 1.22.
Version 4.2 pins 1.26, and **1.26 cannot open the Whisper graphs on the Hub at
all** -- every model and every dtype failed identically with
`TransposeDQWeightsForMatMulNBits Missing required scale`, including fp32, which
is the tell that it is a runtime mismatch rather than a setting.

## Why it was removed

**It is too slow to be live.** Measured on an Intel i5-8257U with Iris Plus 645,
six seconds of audio, three runs each, single-threaded WASM:

| Model | Mean | Real-time factor |
|---|---|---|
| `whisper-base` | 39.6 s | 6.61 |
| `whisper-tiny` | 15.5 s | 2.59 |

Anything above 1.0 cannot keep up with live audio. Even `tiny`, which would be
too inaccurate for radio anyway, is two and a half times too slow.

**The obvious lever is closed.** WASM threads need `SharedArrayBuffer`, which
needs cross-origin isolation, which a `file://` page cannot have. Measured:
`crossOriginIsolated` false, `SharedArrayBuffer` undefined, on four cores.

**And then the cost that actually forced the decision.** Enabling it once
downloaded roughly **1.3 GB** of model weights into the user's profile, and
nothing ever removed them. 648 MB in a CacheStorage bucket named
`transformers-cache`, 633 MB more in the HTTP cache holding
`decoder_model_merged_quantized.onnx`. Turn captions off again and the gigabyte
stays, reclaimable only by Erase Everything, which also takes your favourites.

This app is meant to run on hardware people already own, including old and cheap
hardware, because that is where its audience is. A gigabyte of a switched-off
feature is not a rounding error on a 128 GB machine. That is the whole argument.

## What would have to be true to bring it back

Three routes, none of them a setting:

1. **Serve the renderer from a custom protocol with COOP/COEP headers**, which
   unlocks WASM threads. Worth perhaps 2-3x, so `tiny` might just reach live and
   `base` still would not.
2. **Apple Silicon.** The same WASM is several times faster per core, and this
   may simply work on an M-series machine. It does not help the hardware this
   project targets.
3. **Native `whisper.cpp`**, which is the thing the WASM approach was chosen to
   avoid. It would mean shipping a native binary per architecture.

Whatever ships, two rules survive from the first attempt:

- **Measure the machine before offering the feature.** Nobody should be able to
  switch on captions and watch them arrive a minute late. The benchmark is four
  lines and takes fifteen seconds.
- **Delete the models when the feature is turned off.** The first version had no
  path to reclaim what it downloaded, and that is what removed it.

## What went with it

- `src/captions-runtime.js` and `src/renderer/captions.js`
- The `@huggingface/transformers` devDependency
- The `captions` and `captionModel` preferences
- The `cap.*` interface strings in five languages
- The `onnxruntime-web` and `@huggingface/transformers` entries in
  `THIRD-PARTY-NOTICES.md`, which were the only "downloaded on demand" entries
  in it

The git history has all of it. Start from the commit that removed it rather than
from scratch.
