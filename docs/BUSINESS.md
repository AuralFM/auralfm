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

### What Obsidian actually charges for

Verified on [obsidian.md/pricing](https://obsidian.md/pricing), not from a stats
blog:

| | | Needs a server? |
|---|---|---|
| **Sync** | $4/mo annual, $5 monthly | **Yes** |
| **Publish** | $8/mo per site annual, $10 monthly | **Yes** |
| **Catalyst** | $25 one-time — beta access, badge, private channels | No |
| **Commercial licence** | $50/user/year | No |

And the detail that matters most, in their own words:

> "You are **not *required*** to pay for a commercial license, however if you are
> using Obsidian for work in an organization we encourage you to purchase a
> commercial license to keep Obsidian independent and 100% user-supported."

**The commercial licence is optional.** They turned an enforcement problem into a
patronage appeal, which is both more honest and probably more effective. That
corrects an earlier draft of this document, which had a commercial licence down
as something to enforce later; Obsidian tried that and backed away from it.

### The half we can copy, and the half we cannot

Sort those four by what they need and the model splits cleanly in two:

- **Two are optional paid services** — Sync and Publish. Both are servers. Both
  are recurring. Between them they are almost certainly where the money is,
  because they are the only two that bill every month.
- **Two are patronage** — Catalyst and the commercial licence. Neither needs
  infrastructure. Both are people choosing to pay for something they already have.

**AuralFM can adopt the philosophy and only half the revenue model.** The
subscription half requires exactly the thing the product refuses to build. That
is not a reason to abandon the model — it is the reason to be clear-eyed about
what it earns.

So, ranked honestly:

| | Fit | Realistic ceiling |
|---|---|---|
| **Supporter tier** (Catalyst-shaped) | Best. No account, no server, breaks nothing. | Low. See the arithmetic below. |
| **Premium palettes** | Already built and split in `src/palettes.js`. Cheapest possible test. | Low, but free to run. |
| **Optional "for work" licence** | Honest, patronage-framed, zero enforcement. | Low until anyone uses it at work. |
| **A hosted anything** | Worst. The moment a paid feature needs our server, the position argues with the pricing page. | The only one that scales — which is the whole problem. |

### The arithmetic nobody enjoys

Voluntary payment in free software converts at roughly 1–5% of active users. At a
$20 average and 2% conversion: 10,000 users is about $4,000 — a year. 100,000
users is about $40,000. Not a salary.

That is not an argument against doing it. It is an argument against expecting
Obsidian's outcome from Obsidian's philosophy minus Obsidian's subscriptions.

**Which surfaces the real fork, and it is a decision rather than an analysis:**

1. **Public good with a supporter tier.** The app stays exactly what it claims,
   money is a trickle, and the deck should say so plainly instead of gesturing at
   a business model. This is the version that is fully consistent with everything
   already written.
2. **Find one optional service worth paying for** that does not weaken the app if
   you decline it. Every candidate — sound-map hosting, a community relay, sync
   of favourites — is a backend, so this route means amending the claim to "the
   app has no backend" rather than dropping it, and being scrupulous about the
   difference.

Both are defensible. Only one of them is currently written down as the position,
and it is the first. Choosing the second is fine and should be done deliberately,
in daylight, not by drift.

The discipline Obsidian keeps and we would have to keep either way: **the free app
never gets worse to make the paid thing attractive.** That is the entire reason
people trust them, and it is the same reason people would trust us.

### On the numbers in the stats article

Worth reading, and worth discounting. It is candid about its own limits, which is
more than most: Obsidian **does not publicly disclose revenue**, there is **no
known valuation**, and the user count is flagged "not official confirmation."

The revenue figures it carries are a ~$2M ARR estimate from GetLatka and an
unsourced $5M–$25M range. **A twelve-fold spread means nobody knows.** Do not
carry either number into a deck.

What is solid and useful: bootstrapped, no VC, founded 2020, a team under about
twenty, and the pricing above. That combination is the actual lesson — a small
independent team, no outside money, and a model that does not require growth to
survive.

Roadmap §4 already said monetisation was undecided and that the app has no server
costs forcing a model. This is the shape that decision should take.

---

## The decision, 4 August 2026

**No backend. No server. No ads — not in the app, not on the site. Ever.** Not a
default to be revisited; a constraint the product is built out of.

**Support is donations only, and the app never knows.** No unlock, no badge, no
tier, no state. Nothing is gathered from anyone, by anyone, at any point.

That answers #15 and it has already cost something: the dormant palette paywall
is deleted (see `src/palettes.js`). Three palettes carried `free: false` against
a gate that was never switched on. It cannot be switched on now, because to gate
anything you must know whether *this* person paid — and every way of knowing that
means an account, a licence key tied to a purchase, or a server to ask.

**A paywall is the one feature that cannot be built without collecting something.**
That is the whole reason this is a clean decision rather than a sacrifice.

---

## Taking money without a backend, and without learning anything

### x402 cannot do this

Worth stating plainly, because it was the hoped-for answer. x402 is **server
middleware**: a server receives a request, answers `402`, the client pays, the
client retries. It is an excellent protocol and it is the wrong shape here —
there is no server to answer, and nothing sold over HTTP to answer *for*.
Adopting it means building the backend the whole product refuses.

The instinct behind it is right though: *"no accounts or personal information
needed"* is the only payment posture that does not contradict the privacy claim.
That posture is achievable — just not through x402.

### What actually works with zero infrastructure

**A published address.** That is the entire mechanism. It goes in the About panel
and on the site; people send to it or they do not. No server, no accounts, no
database, nothing to breach, nothing to log. It is already compatible with every
line of `docs/PRIVACY.md`.

The choice of *which* address is where the real thinking is, and the ranking is
not the obvious one:

| | Infrastructure | Donor privacy |
|---|---|---|
| **Monero (XMR)** | None | **Private by protocol.** Sender, receiver and amount hidden on-chain. |
| **Bitcoin on-chain** | None | **Poor — see below.** |
| **Lightning (BOLT12 static offer)** | Needs a node | Good. No public ledger entry. |
| **Nostr Zaps (NIP-57)** | Needs an LNURL endpoint | Good, and culturally exact. |

**The counter-intuitive part, and it matters given the brief: a plain Bitcoin
address is one of the *worst* options for donor anonymity.** The ledger is public
and permanent. Publish one address and every donation to it is visible forever,
along with the address it came from, and the running total is public. We would
collect nothing — and we would have arranged for every supporter to be published.
That is a strange outcome for a project whose whole claim is privacy, and it is
worth refusing on those grounds rather than shipping it because it is the default.

**Monero is the only option that is private by protocol *and* needs no
infrastructure.** It is the honest answer to the brief as written. The costs are
real: a smaller audience, delisting from some exchanges, and it reads as a
political statement — which, for this project, may be a feature rather than a
bug.

**Zaps are the most interesting long-term.** The app already speaks Nostr, the
community lives on a Nostr relay, and zaps are the native way that ecosystem
sends value. Same rails end to end. The catch is NIP-57 needs an LNURL endpoint,
so it needs a Lightning node — either self-run, which is real work, or custodial,
which puts a third party in the middle who sees the payments and knows who we
are. Permissible under our own rule (**the app must never depend on it** — node
down means donations fail and the app does not notice), but it is infrastructure,
and the brief says be militant.

**Recommendation:** start with a Monero address and, if the Lightning work ever
gets done, add zaps. Both live in About and on the site. Neither is ever
mentioned in a way that implies you get something.

### Distribution: not the App Store, and that settles most of this

**AuralFM does not need the Mac App Store and should not use it.** Direct
download from a website is the normal way serious Mac software ships — Buzz,
Obsidian, Figma, every developer tool worth having.

That retires a risk flagged earlier in this document. App Store rules about
donations and in-app crypto are *App Store* rules. They have no bearing on a
notarised app downloaded from a website, and Apple has no view whatsoever on
what a developer's own site does.

**What direct distribution still needs, and it is not the store:** the $99 Apple
Developer Program, for a Developer ID certificate so the app can be **signed and
notarised**. Notarisation is an automated malware scan, not a review — nobody at
Apple looks at the business model, the content, or the donation page. That is
#4, and it costs the same $99 whether or not the App Store is ever involved.

Without it the app is not unusable, it is *distrusted*: macOS says it cannot
verify the app is free of malware, and the user has to go into System Settings and
approve it by hand. That friction has grown with every macOS release. For a
product whose entire pitch is "there is nothing to steal here," instructing people
to click past a security warning is the worst possible first impression.

### Where the App Store constraint actually lands: iOS

Desktop is free of all of this. **iOS is not**, and it is worth knowing now rather
than discovering it later:

- There is no direct distribution on iOS in the US. An iOS version means the App
  Store, and therefore Apple's rules on donations and crypto **do** apply.
- Apple reviews content. This app streams unfiltered live radio from anywhere on
  Earth and carries an unmoderated public chat — precisely the combination that
  gets flagged.
- Electron does not go to iOS. An iOS version is a **rebuild**, not a port.

Windows and Linux are the opposite: electron-builder already has the structure,
so they are largely configuration plus testing. Linux is essentially free;
Windows signing certificates are the only real friction.

**Sequencing consequence:** desktop keeps every commitment in this document
intact. Mobile is where they would first have to be argued for. That is a reason
to make the desktop version excellent before touching iOS, not a reason to avoid
iOS forever.

### The website is not a violation — one thing on it could be

A public website with a named owner does not contradict "collects nothing."
That claim is about **the app not collecting anything from its users**, not about
the project being anonymous. Signal has signal.org; nobody thinks that undermines
Signal.

**Being identifiable is an asset, not a leak.** Anonymity is the promise made to
the *listener*. A developer nobody can name is a reason not to trust software,
not a reason to trust it. Obsidian's founders are public, and it is part of why
the model works.

**Framer is fine, with one rule.** Its built-in analytics use no cookies and no
persistent identifiers: IP and user-agent are hashed with a secret that rotates
and is destroyed daily, purely to count unique visitors
([Framer Help](https://www.framer.com/help/articles/how-framer-s-built-in-analytics-work/)).
That is consistent with everything here.

**The rule: built-in analytics only, and no third-party scripts. Ever.** Adding
Google Analytics, a Meta pixel, an embedded video, or a chat widget puts trackers
on the front door of a privacy application — and it happens by accident, because
each one is a single toggle. This is the one place the website could genuinely
betray the app, and it will not be dramatic when it does.

### Two risks that come with a donation address

- ~~**Distribution rules.**~~ Resolved above: direct distribution, not the App
  Store, so the store's rules on donations and crypto do not apply. The
  constraint returns only on iOS.
- **An address in a shipped binary is a tamper target.** Someone who modifies the
  app swaps the address and takes the money in our name. That raises the stakes
  on code signing (#4) from "users cannot verify what they run" to "users cannot
  verify where their money goes," and it is an argument for the canonical address
  living in the signed repository and on the site, with the app pointing at it
  rather than being the only place it appears.

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
