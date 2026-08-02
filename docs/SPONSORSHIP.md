# Getting GlobeFM sponsored

A sequence, not a wish. Everything here was checked against GitHub's own docs on
2026-08-02.

**Do steps 1–4 before the repo goes public.** A public repo with no funding
button and a thin README gets one look and no second one; the first week of
visibility is the only cheap week you get.

---

## What sponsorship actually is here

Be clear-eyed about the size of this. GitHub Sponsors for a solo desktop app is
**not income**. It is, in rough order of what it is actually worth:

1. **Evidence that people want it.** Ten sponsors at $3 is a stronger signal than
   a thousand stars.
2. **A way to cover costs.** The Apple Developer Program is $99/year, and that is
   the only hard cost GlobeFM has. Sponsorship covering that alone is a win.
3. **A reason to keep the promises.** An app with sponsors has a reason to stay
   ad-free that is more durable than a preference.

Money at a meaningful scale comes from #15, not from here. This is about
sustainability and signal.

---

## 1. Preconditions — do these first

- [ ] **Two-factor authentication on the GitHub account.** Required before
      approval, and it will block you at the end if left to the end.
- [ ] **A payout region GitHub supports.** The US is supported.
- [ ] **A bank account whose region matches your residence.** GitHub pays through
      **Stripe Connect**, and a mismatch will fail verification.
- [ ] **Decide: personal account or fiscal host.** For GlobeFM, personal. The
      fiscal-host option can *only* be chosen at signup — switching later means
      contacting GitHub Support — so it is worth knowing you are choosing.

## 2. Apply

1. Go to <https://github.com/sponsors> → **Get sponsored**.
2. Select the **meltonbell3** personal account.
3. Contact information → payout method (**bank account**) → accept terms →
   submit.
4. Complete the **Stripe Connect** application. Get this right first time;
   corrections are slow.
5. Submit the tax form — **W-9** as a US person.
6. Request approval from the dashboard. GitHub says **a few days**.

Eligibility is broad: contributions counted include "bug reports, issue triage,
code, documentation, leadership, business development, project management,
mentorship, and design." GlobeFM alone clears this.

## 3. Set up the profile and tiers

**Tiers are price-locked once published.** You can unpublish and make a new one,
but you cannot edit the price of a published tier. Decide before you click.

Suggested for GlobeFM — four tiers, monthly, deliberately small:

| Tier | Price | What it says |
|---|---|---|
| **Listener** | $3 / mo | Keeps the app ad-free and the promises intact. |
| **Supporter** | $8 / mo | Name in the About panel, if you want it there. |
| **Operator** | $25 / mo | For people who run a shortwave receiver or a station. |
| **One-time** | $99 | Covers a year of the Apple Developer Program outright. |

Two things worth saying plainly in the tier descriptions:

- **Nothing in the app is behind these tiers.** The Supporter palettes in #23 are
  labelled but not locked, and until #15 is decided they stay unlocked. Do not
  promise a reward you have not built.
- **Say what the money is for.** "$99/year Apple Developer Program, and nothing
  else — there is no server to pay for" is unusually concrete and it is true.

Then: short bio, feature up to six repositories (GlobeFM first), opt into the
featured listing.

## 4. Wire it into the repo

- [x] `.github/FUNDING.yml` already exists with `github: [meltonbell3]`. It
      activates the **Sponsor** button the moment the account is approved and the
      repo is public.
- [ ] Add a short **Supporting this** section to the README once the button is
      live — three sentences, no pleading.

## 5. Then make it public

In this order, because the order matters:

1. Sponsors approved and tiers published.
2. README final, with screenshots. **Screenshots are the single highest-leverage
   thing** — this is a visual app and nobody sponsors a wall of text.
3. Repo → Settings → **Change visibility → Public**.
4. Only then post it anywhere.

## 6. Where to actually post it

Ranked by fit, not by size. Each of these is a place where GlobeFM's specifics
land, rather than a general firehose:

| Where | Why it fits |
|---|---|
| **r/shortwave, r/amateurradio, r/RTLSDR** | The KiwiSDR feature is genuinely novel to them — most SDR software is not beautiful, and none of it is a globe. |
| **The KiwiSDR forum** | Courtesy as much as promotion: 837 operators' receivers are in this. Tell them how the etiquette rules work. They will care. |
| **Hacker News (Show HN)** | "Offline-first, no backend, collects nothing" plus a real globe is exactly this audience. Post the *why*, not the feature list. |
| **r/macapps** | Native, free, no account. |
| **Nostr** | Given where the project is pointed, being visible there is consistent rather than promotional. |
| **Lobsters** | Smaller, more technical, reads commit messages. |

**Do not** post to all of them the same day. One at a time, respond to everything,
and let each thread finish.

## 7. Alternatives, and why not to bother yet

| | Fee | Verdict |
|---|---|---|
| **GitHub Sponsors** | **0%** from personal accounts, up to 6% from orgs | Start here. Zero fee, and it sits where the code is. |
| **Ko-fi** | 5%, or $12/mo for 0% | Worth adding only if people ask for a non-GitHub option. |
| **Open Collective** | ~5–10% via a fiscal host | Built for projects with many contributors and transparent budgets. GlobeFM is one person. Not yet. |
| **Liberapay** | 0% platform fee | Ideologically aligned, very small audience. Fine as a second link. |

**The Matching Fund is gone.** GitHub matched up to $5,000 in a sponsored
developer's first year, but applications closed on 1 January 2020. Do not plan
around it.

## 8. What would actually move the needle

Honestly: not the funding page.

- **Screenshots and a 30-second recording.** The globe with live weather, the
  terminator where it truly is, and a shortwave receiver in Iceland playing. That
  video is the entire pitch.
- **Signing and notarisation (#4).** Right now Gatekeeper tells every new user the
  app is untrusted. No funding page survives that first impression.
- **The name and the icon (#21).** Both still open, and both are the first thing
  anyone sees.

Sponsorship follows those three. It does not substitute for them.
