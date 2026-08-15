# Aegis

**The Viral P2P Trust Engine and AI Arbitrator.**

Two people negotiate a gig out loud. Aegis sits in the call as a neutral third
party: it drafts the escrow contract from what was actually said, scores the
conversation for manipulation as it happens, proves the speakers are live
humans, holds the money, checks the delivered work with a vision model, and
settles disputes with a three-agent jury.

---

## Which model APIs does Aegis need?

**One vendor: OpenAI.** One API key covers everything. All four models are
configurable in `.env`.

| Purpose                             | Env var                  | Default         | Why this one |
| ----------------------------------- | ------------------------ | --------------- | ------------ |
| Live voice negotiation (WebRTC)     | `OPENAI_REALTIME_MODEL`  | `gpt-realtime`  | The only model that does speech-to-speech with function calling at conversational latency. This is the product. |
| Work-proof image verification       | `OPENAI_VISION_MODEL`    | `gpt-4o`        | Vision + strict JSON schema output. Any vision-capable model works. |
| The three jury agents               | `OPENAI_JURY_MODEL`      | `gpt-4o`        | Needs to hold a contract, a complaint, and two arguments in one judgement. |
| Trust Reel copywriting              | `OPENAI_REEL_MODEL`      | `gpt-4o-mini`   | Short structured copy — small and fast is right here. |

Transcription of the parties' speech uses `gpt-4o-transcribe-diarize` inside
the Realtime session. The client binds each completed segment to the explicit
Buyer/Seller floor state before it asks the arbitrator to respond, so a mixed
audio stream is never treated as proof of a speaker's role.

**Get your key:** <https://platform.openai.com/api-keys> — it must have
Realtime API access enabled.

> The browser never receives this key. It reaches OpenAI through the FastAPI
> SDP proxy, so the credential stays server-side for the whole session.

---

## What you need to fill in

Everything lives in [`.env.example`](.env.example). Copy it into both apps:

```bash
cp .env.example backend/.env && cp .env.example web/.env.local
```

Supabase URL and publishable key are **already filled in** — the project is
provisioned and migrated. You need to supply three values:

| Value                       | Where to get it |
| --------------------------- | --------------- |
| `OPENAI_API_KEY`            | <https://platform.openai.com/api-keys> |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API Keys → `service_role` |
| `SUPABASE_JWT_SECRET`       | Supabase Dashboard → Project Settings → API Keys → JWT Settings |

Delete `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` from
`web/.env.local` — the browser must never see them.

---

## Enabling Google sign-in

Email/password works immediately. Google needs five minutes of setup:

1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth
   client ID → Web application.
2. Authorised redirect URI:
   `https://amypafeuuqahdzsnbnte.supabase.co/auth/v1/callback`
3. Copy the client ID and secret into **Supabase Dashboard → Authentication →
   Providers → Google**, and enable it.
4. **Supabase Dashboard → Authentication → URL Configuration** → add
   `http://localhost:3000/**` to Redirect URLs.

While demoing, also turn **off** Authentication → Providers → Email → "Confirm
email", so a new account can sign in without leaving the app.

---

## Running it

Two processes.

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/uvicorn app.main:app --reload --port 8000
```

```bash
cd web && npm install && npm run dev
```

Open <http://localhost:3000>. Check <http://localhost:8000/health> to confirm
which models the backend resolved.

---

## Architecture

```
Browser (Next.js 15)                FastAPI                    Supabase
  │                                    │                          │
  ├── SDP offer ─────────────────────► │ ── signed w/ API key ──► OpenAI Realtime
  │ ◄──────────────────── SDP answer ──┤
  │                                    │
  ├══ audio ═══════════════════════════════════════════════════► OpenAI (direct)
  │                                    │
  ├── tool call + user JWT ──────────► │ ── validate, then ────► lock_escrow()
  │                                    │                          │
  │ ◄══════════ realtime push ═════════════════════════════════════╯
```

The browser holds the WebRTC session, but **every tool call is re-validated in
Python before it touches money**. Nothing the model says is trusted on its own.

### Three gates before funds ever lock

`POST /tools/create_escrow_contract` refuses unless all three pass:

1. **Deception forensics** — cumulative risk score below the halt threshold.
2. **Vocal entropy trap** — a passed live-speaker challenge within 10 minutes.
3. **Solvency** — the buyer's available balance actually covers the price.

A refusal comes back as `200` with a `spoken_summary`, so the arbitrator can
read the reason aloud instead of failing silently.

### The money layer

Money never touches a float. `price_cents` is the only authoritative amount;
`price_usd` is a **generated column** derived from it, so the displayed value
and the settled value cannot drift apart. Every movement goes through a
`SECURITY DEFINER` Postgres function (`lock_escrow`, `release_escrow`,
`refund_escrow`, `settle_dispute`) that row-locks, validates, mutates the
wallet, and appends to an **append-only ledger** in one transaction. Triggers
reject any `UPDATE` or `DELETE` on `ledger_entries`.

Dispute splits are integer basis points, with the buyer absorbing the rounding
remainder — so `seller_cents + buyer_cents == price_cents` exactly, always. A
$33.33 contract split 70/30 pays $23.33 and $10.00, and the ledger nets to zero.

These functions are revoked from `anon` and `authenticated`. Only the service
role — i.e. the backend — can call them.

### Guardian — deals that started somewhere else

Almost every real gig deal is agreed on Fiverr, Upwork, Discord or WhatsApp
long before anyone thinks about escrow. Guardian meets that reality: paste the
conversation at `/guardian` and Aegis runs the **same six-pattern forensics**
the voice arbitrator uses, extracts the deal, and converts it into a funded
escrow contract — no voice room, and the counterparty does not need an account
yet.

Two details that make it trustworthy rather than a toy:

- **Quotes are verified against the source.** The model must quote verbatim to
  raise a finding, and the backend drops any quote it cannot locate in the
  pasted text. A fabricated quote would discredit the entire report.
- **Missing terms stay null.** If a price was never actually stated, Guardian
  leaves it blank rather than guessing — an invented number would be locked
  into a real escrow contract.

`accept_guardian_invite` creates the contract and locks the escrow in one
transaction, so a failed funding attempt cannot leave an orphaned contract
behind. Invites are single-use and expire in seven days.

Measured on a realistic Fiverr scam (off-platform payment push, manufactured
urgency, scope creep) versus a clean negotiation: **95 / DO_NOT_PROCEED** vs
**5 / SAFE**, with zero findings on the clean thread. The false-positive
behaviour matters as much as the detection — a false alarm on an honest client
costs the user real work.

### Live term extraction

Aegis calls `update_deal_terms` the moment it learns or revises any of the three
terms, long before agreement. Both parties watch Item / Price / Release
condition fill in on screen as they talk, streamed over Supabase realtime — so a
misheard price surfaces *before* money is committed rather than after. This is
what makes the Voice Escrow pillar visible during the negotiation instead of
only at the lock.

### The Trust Reel is a real narrated video

`renderReelVideo` animates an offscreen 1080x1920 canvas and records the canvas
stream with `MediaRecorder`, producing an actual subtitled video file — vertical
format, captions burned in so it reads with the sound off. Generated entirely in
the browser: no render service, no upload, no third-party video API. Fonts are
awaited before the first frame so the typeface never changes mid-video.

`GET /reels/<slug>/voiceover` writes a 32-40 word narration from settled ledger
figures and synthesises it with `gpt-4o-mini-tts`. The audio track is mixed into
the same `MediaStream` the canvas feeds, so the recorder writes one file with
picture and sound. The video is stretched to cover the full read — a reel that
cuts off mid-sentence looks broken, so picture waits for voice.

### The Threat Simulator

Deception Forensics is the hardest pillar to show on demand, because it needs a
real bad actor in the room. The simulator fires scripted fraud patterns
(off-platform payment, late price change, manufactured urgency, scope creep,
identity pressure) into the negotiation down the **identical code path** a
spoken sentence takes — `conversation.item.create` with `input_text`. Aegis
interrupts, scores the risk, and refuses to lock funds, on cue.

### The Trust Passport

`/u/<id>` is a public, unauthenticated profile aggregating a freelancer's
settled deals, trust score, and escrowed volume — every figure derived from
ledger state, never self-reported. It exposes no counterparty names, contract
ids, or wallet data. This is the growth loop: each completed deal compounds into
a page worth sending a prospective client.

### The Vocal Entropy Trap

Before locking, Aegis issues a randomised phrase from a ~2.3-million-phrase
space (`The copper kettle counted nineteen umbrellas`). Two independent signals
must both pass:

- **Reaction latency**, measured *in the browser* from the moment Aegis stops
  speaking to the moment the party starts. Timing it server-side would fold in
  Aegis's own speech, which is noise. A synthesis pipeline has to transcribe,
  generate, and re-render on unseen text; the delay is the signal.
- **Phonetic fidelity**, compared on soundalike forms rather than spellings, so
  an honest mishearing ("tyger"/"tiger", "15"/"fifteen") does not fail a real
  human.

A failure writes a `CRITICAL` risk event, which independently blocks the lock.

---

## Demo script

1. Sign in as the buyer. Open a room, copy the six-character code.
2. Second browser (or incognito), sign in as the seller, join with the code.
3. Press **Start negotiation**. Both parties speak into the active device.
4. Negotiate: *"I need a landing page redesign." — "Two hundred and fifty
   dollars, delivered as a Figma file."*
5. **Show the security pillar:** say *"Actually, can you just send it to my
   PayPal instead?"* Aegis interrupts with a Security Halt and the risk panel
   fills in live.
6. In a clean room, complete the deal. Aegis reads the terms back, both parties
   agree, it issues the challenge phrase, and locks the funds. The escrow
   balance updates with no refresh.
7. As the seller, open the contract and upload an image of the work. Vision
   checks it against the release condition and releases the money.
8. Generate the **Trust Reel** and export it.

To demo the jury instead, have the buyer open a dispute — three agents argue
and the magistrate splits the escrow to the cent.

---

## Layout

```
backend/app/
  main.py             FastAPI entry, CORS, health
  config.py           typed settings
  deps.py             JWT verification (HS256 / JWKS / auth-server fallback)
  prompts.py          arbitrator prompt, tool schemas, jury + vision + reel prompts
  routers/
    realtime.py       session config + SDP proxy
    tools.py          the three gates; tool-call execution
    vision.py         GPT-4o work verification, then payout
    jury.py           advocate / advocate / magistrate, then settlement
    reels.py          Trust Reel generation and public share endpoint
    rooms.py          rooms, joining, wallet
  services/
    openai_client.py  chat, structured output, SDP handshake
    entropy.py        challenge generation and phonetic scoring

web/src/
  app/                landing, login, dashboard, room, contract, reel
  components/         brand (one logo), ui primitives, room, contract, reel
  lib/
    useAegisVoice.ts  WebRTC session, data channel, tool relay, latency timing
    format.ts         the single place cents become dollars
    supabase/         browser + server clients
  middleware.ts       session refresh and route guards
```

---

## Verified

- Settlement math is covered by a self-verifying SQL suite (rolls back clean):
  demo float provisioning, hold/release balances, generated `price_usd`, and a
  70/30 split of an amount that does not divide evenly, asserting the ledger
  nets to zero.
- The entropy scorer passes exact repeats, digit/word substitution, casing and
  punctuation noise, and minor mishearings, while rejecting wrong phrases,
  partial repeats, empty input, and slow-but-perfect responses.
- `npm run build` is clean: zero type errors across all seven routes.
- Supabase security advisors are clear apart from two intentional findings,
  documented in `aegis_harden_function_surface`: the RLS membership helpers must
  keep `EXECUTE` for `authenticated` because policy expressions run as the
  querying role, and each only reports whether the caller themselves is a party.

## Known limits

- **One voice seat per room, enforced by a database lock.** Both parties speak
  into whichever device claimed the seat; the other follows live over Supabase
  realtime. Without this lock each browser spawns its own agent and the two talk
  over each other. The lease is heartbeated every 30s and reclaimable after 90s
  of silence, so a closed tab never wedges the room. True multi-party audio needs
  an SFU, which is out of scope here.
- **The wallet is a simulated ledger**, not a payment processor. It is a real
  double-entry Postgres ledger with holds and atomic settlement — it simply has
  no external rails behind it. `/wallet/topup` is where a processor would sit.
