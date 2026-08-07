# Contributing

Thank you for looking. Read this before opening anything, because the rules
below are unusual and they are meant seriously.

## The honest position

This is one person's project. Melton Bell III maintains it, alongside everything
else in his life, for free.

That means:

- **Issues and pull requests may go unanswered.** Not out of rudeness. There is
  one maintainer and no support obligation.
- **An issue or a pull request may be closed without extensive feedback**, and
  sometimes without any. A closed issue is not a judgement of you.
- **Discussions and contributions will be locked** if the repository takes a
  volume of low-quality or hostile activity that makes it unusable. This is a
  bandwidth decision, not a moderation one.
- **No support is given for local build problems.** If `npm start` does not work
  on your machine, that is yours to solve. This is not unkindness; it is the
  difference between maintaining a project and running a free help desk.
- **The [Code of Conduct](CODE_OF_CONDUCT.md) applies to everyone, always**,
  including people whose contribution is technically excellent.

If those terms do not work for you, fork it. The licence permits that and
nobody will be offended.

## Before you open an issue

**Search first.** Closed issues too. A duplicate costs the maintainer the same
attention as a new report and returns nothing.

**Bug reports need four things**, and the first two answer most of them:

1. Your macOS version, and Intel or Apple Silicon — Apple menu → About This Mac
2. The app version — AuralFM → About AuralFM
3. What you did, in the order you did it
4. What happened instead, and a screenshot if there is anything to see

"It doesn't work" cannot be acted on.

**Some things look like bugs and are not:**

- A shortwave receiver that will not connect is usually **full**. Eight listener
  slots, shared with the whole internet. Try another.
- Silence on a scheduled frequency often means the **band is closed**. The line
  above the list says whether the higher bands are carrying.
- **Captions are off and staying off.** They work and they are too slow to be
  usable on current hardware. That was measured, not assumed.
- The app needs a connection for **audio**. Everything else — search, the globe,
  12,296 places — works offline by design.

## Before you open a pull request

**Open an issue first and wait for a reply.** Not a formality. A pull request
that arrives without discussion is usually one of two things: work that
duplicates something already in progress, or work that will be declined for a
reason that could have been given in one sentence beforehand. Either way
somebody's evening is gone.

**Pull requests that will be closed:**

- **Large refactors.** However much better the result, a diff nobody can review
  is a diff nobody can maintain. If a refactor is genuinely needed, open an issue
  and make the argument first.
- **New features that were not discussed.** This project refuses more features
  than it accepts, and the reasons are written down in `docs/DIRECTION.md`. A
  feature can be well built and still be wrong for this.
- **Tooling or framework changes.** The renderer is plain HTML, CSS and
  JavaScript with no build step. That is deliberate. It is not an oversight
  waiting for React, a bundler, or TypeScript.
- **New dependencies**, unless there is no reasonable way to do the thing
  without one. Every dependency is a licence to track, a notice to ship, and a
  thing that can break.

**Match the code that is already there.** Comment density, naming, and idiom.
This codebase explains *why* rather than *what*, and a change that only explains
what it does will read as foreign.

## The one thing this project is strict about

**The shortwave receivers belong to volunteers.** One person's hardware, on one
person's bandwidth, given away free. Around 800 of them.

Any change that touches them must honour the nine commitments in
[`docs/DECENTRALIZATION.md`](docs/DECENTRALIZATION.md). Seven are enforced in the
app's code and two in the crawler, and `npm run audit` checks what it can.

This project has already taken three receivers offline by over-probing them
during development. A pull request that adds automated, scheduled, or repeated
connections to those machines will be closed regardless of how well it is
written.

If you operate a receiver and would rather not be included, one email and you
are out of the next build. See [`docs/RECEIVERS.md`](docs/RECEIVERS.md).

## Verifying your change

There is no test suite. There is `npm run audit`, which checks data integrity,
third-party notices, polling cooldowns, and design tokens. It must pass.

Beyond that, the standard is evidence rather than intent. The pull request
template asks how you verified, and "should work" is not an answer. Run the app.
Look at the thing you changed. Check it in both appearances.

## Writing

Two rules govern anything user-facing, including commit messages and docs:

- **No em dashes.** Commas, colons, or a full stop.
- **Never describe a place as a sound.** "Hear what Lagos is listening to",
  never "hear what Lagos sounds like". The first points at people who are
  already listening. The second turns a city into texture for somebody else.
  The reasoning is in `docs/LISTENING.md`.

## Licence

By contributing you agree your work is licensed under the
[MIT Licence](LICENSE), the same terms as the rest of the project.
