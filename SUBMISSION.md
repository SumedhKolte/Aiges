# Aegis — hackathon submission (copy/paste answers)

---

## Project name

```
Aegis
```

## Tagline

```
The escrow agent that listens to the deal being made.
```

## Industry

```
Fintech
```

> If it accepts more than one, use: `Fintech, Security, Future of Work`

---

## Description

```
Peer-to-peer gig work runs on trust that nobody verifies. A freelancer agrees a
price in a Fiverr DM or a Discord call, does the work, and hopes. Traditional
escrow is too slow and expensive for a $250 job, and chat platforms offer zero
financial protection.

Aegis is an autonomous AI voice arbitrator that sits inside the negotiation as a
neutral third party. Two people talk; Aegis listens, drafts the escrow contract
from what they actually said, holds the money, catches the manipulation, checks
the delivered work, and settles disputes — without a human ever reading the case.

THREE PILLARS

1. Voice Escrow. Both parties join a room and negotiate out loud over the OpenAI
Realtime API. Aegis extracts the item, the price, and the release condition,
publishing each term to both screens the moment it hears it, so a misheard price
surfaces before money is committed. When both parties agree it calls a tool that
locks the funds.

2. Deception Forensics. Six fraud patterns are scored live as they are spoken:
off-platform payment requests, late price changes, manufactured urgency, scope
creep, identity spoofing, threat language. Past a threshold Aegis interrupts with
a Security Halt and refuses to lock anything. The Vocal Entropy Trap defeats
cloned voices: before funds lock, Aegis issues a randomised phrase from a ~2.3
million phrase space and measures pure reaction time — a human repeats it in well
under a second, while a synthesis pipeline must transcribe, generate and re-render
on unseen text, and the delay gives it away. Response is scored on phonetic
similarity, so an honest mishearing does not fail a real person.

3. The Trust Reel. On settlement Aegis generates a real 1080x1920 vertical video
with AI narration and burned-in subtitles, rendered entirely in the browser. Every
figure comes from the ledger, so a reel cannot advertise a payout that did not
happen — a jury-settled deal honestly shows what was actually received.

AI JURY. Disputes are resolved by three agents: a Buyer's Advocate, a Seller's
Advocate, and a Magistrate who issues a settlement in integer basis points.

GUARDIAN. Most deals are agreed elsewhere first, so Aegis also accepts a pasted
Fiverr/Upwork/Discord conversation, runs the same six-pattern analysis over it,
extracts the deal, and turns it into funded escrow via a share link. Measured on a
realistic scam thread vs a clean negotiation: 95/DO_NOT_PROCEED vs 5/SAFE with
zero false positives on the clean one.

ENGINEERING THAT HOLDS UP

Money never touches a float. price_cents is authoritative and price_usd is a
generated Postgres column derived from it, so the displayed amount and the settled
amount cannot drift apart. Every movement runs through SECURITY DEFINER functions
that row-lock, validate and append to an immutable ledger in one transaction;
triggers reject any UPDATE or DELETE on ledger entries. Dispute splits are integer
basis points with the buyer absorbing the rounding remainder, so a $33.33 contract
split 70/30 pays $23.33 and $10.00 and the ledger nets to exactly zero. Those
functions are revoked from anon and authenticated — only the backend can call
them, and it re-validates every argument the model produces before a cent moves.

Three gates guard every fund lock: cumulative risk score below threshold, a passed
live-speaker challenge, and actual buyer solvency.

STACK: Next.js 15 + React 19 on Vercel, FastAPI on Render, Supabase (Postgres, RLS,
Realtime, Storage, pg_cron). OpenAI gpt-realtime-2.1 for voice, GPT-4o for vision
and the jury, gpt-4o-mini-tts for narration. The OpenAI key never reaches the
browser: WebRTC SDP is proxied through FastAPI. Two-party remote negotiation works
via peer-to-peer audio bridged through the host, signalled over Supabase Realtime
— no SFU.

TRYING IT: sign up with any email and you receive a $2,500 demonstration balance
immediately, so judges can run a full deal without setup. Google sign-in also
works. For the full two-party flow, open the room link in a second browser signed
in as a different account.
```

**Character count: well over the 60 minimum.** If there is a maximum and it
rejects this, use the short version below.

### Short version (if the field has a low limit)

```
Aegis is an autonomous AI voice arbitrator for peer-to-peer gig work. Two people
negotiate out loud; Aegis drafts the escrow contract from what they actually said,
holds the funds, scores six fraud patterns live, and defeats cloned voices with a
randomised phonetic challenge timed on pure reaction latency. It verifies delivered
work with GPT-4o Vision, resolves disputes with a three-agent AI jury that settles
in integer basis points, and generates a narrated vertical video receipt whose
figures are read from the ledger so it cannot overstate a payout. Money is integer
cents end to end through an immutable, append-only Postgres ledger. Sign up with
any email for a $2,500 demo balance.
```

---

## Repository URL

```
https://github.com/SumedhKolte/aegis
```

Verified public (GitHub API reports `private: false`).

## Live demo URL

```
https://aiges-eight.vercel.app
```

Backend health endpoint, if they want proof the API is live:
`https://aiges-g41k.onrender.com/health`

---

## One page summary

Use `ONE_PAGE_SUMMARY.html` in the repo root — open it in a browser and
**Print → Save as PDF** (it is sized to one A4 page).

---

## Before you submit — checklist

- [ ] **Verify a fresh signup works.** Supabase → Authentication → Providers →
      Email → turn **OFF** "Confirm email". If it is on, a judge signs up, never
      receives a confirmation email, and cannot get in. This is the single
      highest-risk item on the whole submission.
- [ ] Open the live demo in a private window and sign up as a brand new user,
      end to end, exactly as a judge would.
- [ ] Render is on a free instance and sleeps after ~15 minutes idle. A pg_cron
      job pings it every 10 minutes to prevent this — confirm it is still
      running the morning of judging.
- [ ] Add a demo video URL if the form has that field.
