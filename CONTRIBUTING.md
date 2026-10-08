# Contributing

Thanks for helping. This page is how to build, test and send a change.

## Set up

You need macOS and [Node.js](https://nodejs.org) 18 or later.

```bash
git clone https://github.com/AuralFM/auralfm.git
cd auralfm
npm install
node scripts/base.mjs && node scripts/profiles.mjs   # build the catalogue, under a minute
npm start
```

## Test

```bash
npm run audit
```

This is the test suite. Every check in it was written after a real bug. If you
fix a bug, add a check that fails when the bug is put back, and watch it fail
once before you trust it.

## Send a change

1. Open an issue first for anything larger than a small fix.
2. Make a branch, keep the change small, and match the code around it.
3. Run `npm run audit`.
4. Open a pull request and say what changed and how you tested it.

## Rules that matter here

- **Accessibility.** Follow [docs/a11y/A11Y.md](docs/a11y/A11Y.md): WCAG 2.2 AA.
- **Phones first.** Most listeners use the web player on an iPhone. Do not
  ship something that only half works there.
- **Plain words.** Text in the app is short and clear. Detail goes in the docs.
- **Privacy.** Nothing that tracks listeners. See [Privacy](docs/PRIVACY.md).

## Report a problem

- A bug: [open an issue](https://github.com/AuralFM/auralfm/issues/new/choose).
- A station that is wrong or should be removed: see [For stations](docs/STATIONS.md).
- A security problem: write to hello@auralfm.xyz. Do not open a public issue.
