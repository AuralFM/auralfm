# AuralFM as a company

Written 4 August 2026, prompted by a research list: x402, Buzz relays, Railway,
a stock ticker, and domains. Kept together because they turn out to be one
question, not five.

---

## The line that decides all of it

Four of the five things on that list are **backend infrastructure**, and the
product's whole claim is *"no backend of our own."*

That is not a reason to refuse them. It is a reason to say precisely what the
claim covers, once, so it survives contact with a company:

> **The app has no backend. The company may have whatever it needs. The app must
> never depend on it.**

Concretely: if AuralFM stops working — or works worse — when a server of ours is
down, the claim is broken. If a server of ours goes down and the app does not
notice, we are fine. A community relay, a website, a payment endpoint, a mailing
list: all fine, none of them in the app's critical path.

Write it down now. This is the kind of boundary that erodes one convenient
exception at a time.

---

## 1. Obsidian is the model — and it is the best idea on the list

Buried in the middle of a list about payment protocols is the strategic answer.

Obsidian's shape: **the app is free, the files are local, no account is required
to use it.** Everything paid is an *optional service you can decline without
losing the product* — Sync, Publish, a commercial licence for work use, and a
voluntary supporter tier for people who just want to fund it.

That maps onto AuralFM almost without translation, because the constraint that
makes Obsidian's model work is the same one we already have: the app is genuinely
useful with nothing switched on and nobody logged in.

What it would look like here, in rough order of how well each fits:

| | Fit |
|---|---|
| **Voluntary supporter tier** | Best. Costs nothing to run, requires no account, breaks nothing. The Catalyst equivalent. |
| **Premium palettes** | Already split free/paid in `src/palettes.js`. Cheapest possible test and it is already built. |
| **Commercial licence** | Plausible later — bars, cafés, installations running it on a screen. Honest, and it is real usage. |
| **A hosted anything** | Worst fit. The moment a paid feature needs our server, the position starts arguing with the pricing page. |

The discipline Obsidian keeps and we would have to keep: **the free app never
gets worse to make the paid thing attractive.** That is the entire reason people
trust them, and it is the same reason people would trust us.

Roadmap §4 already said monetisation was undecided and that the app has no server
costs forcing a model. This is the shape that decision should take.

---

## 2. x402 — right philosophy, wrong layer, today

[x402](https://x402.org/) revives HTTP 402: a server answers an unpaid request
with `402`, the client pays in stablecoin, retries, and gets the resource. Zero
protocol fees, settlement in seconds, and — the part that matters here — **"no
accounts or personal information needed."**

That last line is why it deserved a look. It is the only payment rail I know of
that does not contradict "collects nothing." Stripe needs an account and a
record; x402 does not.

**But it needs a server and something to sell over HTTP, and we have neither.**
Everything AuralFM does happens on the listener's machine. There is no request
to answer with a 402. Bolting one on would mean building the backend the product
exists to avoid.

Two places it could genuinely fit later, both worth remembering:

- **Paying the volunteers.** 837 KiwiSDR operators and a set of Nostr relay
  operators carry this app's load for free, and this project has already knocked
  three receivers offline by over-probing. Accountless, zero-fee micropayments to
  the people hosting the infrastructure is the most on-message use of x402 I can
  construct, and nobody is doing it. It needs *them* to run the middleware, so it
  is not near-term — but it is the right idea to keep.
- **A paid service that is genuinely optional**, if the Obsidian model ever grows
  one. Then x402 is the rail that fits the privacy claim.

**Recommendation:** do not implement. Record the reasoning so it is not
re-litigated, and revisit if either of the above becomes real.

---

## 3. Buzz, relays, and Railway

The community is live at `wss://auralfm.communities.buzz.xyz` — Block's hosted
relay, which is the right call for now.

[Running your own](https://engineering.block.xyz/blog/run-your-own-buzz-relay) is
a Rust binary plus **PostgreSQL 17, Redis 7 and S3-compatible storage**, via
Docker Compose, with a one-click Railway template. That is why Railway is on the
list; the two go together.

The genuinely good part of the story: **Buzz runs on Nostr**, the same protocol
AuralFM already uses for presence and chat. The community and the product sit on
the same rails, and that is not a coincidence worth wasting.

**Recommendation: stay on the hosted relay.** Self-hosting buys sovereignty over
a community that does not exist yet, and costs a database, a cache, an object
store, backups, and a key you must never lose. Revisit when there are enough
people that losing them would hurt.

One thing to know before it bites: **communities are keyed by the relay's host**,
so changing `RELAY_URL` starts a fresh community and leaves the old data behind.
Migrating later is not free. That is an argument for getting the domain decision
right *before* the community grows, not after.

**On Railway generally:** fine, and irrelevant to the app. If a marketing site or
a relay ever needs hosting, it is a reasonable place to put it. It should never
appear in `src/`.

---

## 4. The ticker: stocks instead of crypto

**Robinhood cannot supply this.** Their only public developer offering is a
[Crypto Trading API](https://robinhood.com/us/en/newsroom/robinhood-crypto-trading-api/),
scoped to an authenticated account holder. There is **no public equities
market-data API**; the third-party "Robinhood data" services are reverse-engineered
and would be both a terms problem and a dependency that breaks without notice.

The feature itself is reasonable and mostly built. `src/markets.js` already has
an equities path behind `AURALFM_STOCK_KEY` (Alpha Vantage), and the ticker
already tells the truth on hover when no key is set. The comment there records
why it is keyed at all: Yahoo's public endpoint 429s and Stooq's CSV is gone, so
every remaining provider wants a key.

**The right shape, and it is on-message:** make it a setting — *Crypto / Stocks /
Off* — where choosing Stocks asks for **the user's own API key**. Alpha Vantage
has a free tier. Nobody's key ships in the binary, nothing is proxied, and the
app stays accountless. "Bring your own key" is the same posture as the rest of
the product.

Two honest caveats: it needs a settings field and five translations, so it is a
real afternoon rather than a quick change; and *Off* should exist, because a
crypto ticker in a radio app is a taste, not a requirement.

---

## 5. Domains

| | Price | |
|---|---|---|
| **aural.fm** | $85 | The brand *is* the domain. `.fm` is the audio TLD and the name reads as the URL. |
| **auralfm.com** | $10.46 | What people type by default, and what someone else takes if we do not. |

**Buy both, aural.fm as primary.** $95 total, and it is the cheapest strategic
decision on this page.

The thing to go in with eyes open: **`.fm` renews expensive, forever** — that
is registry pricing, not an introductory offer. Call it ~$85 a year indefinitely
against ~$10 for the `.com`. Over ten years that is roughly $850 versus $100.
For a product whose entire identity is the word *aural* and the letters *FM*, I
think that is worth paying; it is also a real recurring cost on a project with no
revenue, and it should be a decision rather than a reflex.

Do it before the Buzz community grows, given communities are keyed by host.

---

## What becoming a company actually changes

The word "company" in the original note is doing more work than the rest of the
list. Three things in `docs/LEGAL-AND-SECURITY.md` are dormant while this is a
free personal project and wake up the moment it is not:

1. **The Noun Project resale cap.** §3.A limits resale to 1,000 units per licence,
   and two licences to two *different* icons do not make it 2,000. First real
   question for a lawyer.
2. **The privacy policy becomes a representation**, not documentation. Enforceable.
3. **Licence re-checks** — TeleGeography unanswered, and any CC-BY-NC source that
   has crept in.

None of them block anything today. All of them block a paid product, and all of
them are cheaper to settle before there is revenue than after.
