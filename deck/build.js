const pptxgen = require("pptxgenjs");

// ---------------------------------------------------------------------------
// Palette — the product's own dark/teal identity, so the deck and the app read
// as one thing. Teal dominates; red and amber appear only where the product
// itself uses them (risk, halts).
// ---------------------------------------------------------------------------
const VOID_ = "080B11";
const PANEL = "121821";
const PANEL2 = "1A2230";
const LINE = "27313F";
const INK = "EAEEF5";
const DIM = "97A2B6";
const FAINT = "5F6B7E";
const AEGIS = "14C9B8";
const SIGNAL = "3DDC97";
const HALT = "F5525C";
const CAUTION = "F5A524";

const BODY = "Arial";
const HEAD = "Arial";

const W = 13.3;
const H = 7.5;
const M = 0.72; // outer margin

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "Sumedh Kolte";
pres.title = "Aegis — The Viral P2P Trust Engine";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const slide = (bg = VOID_) => {
  const s = pres.addSlide();
  s.background = { color: bg };
  return s;
};

/** Section kicker + title. Whitespace does the separating — no accent rules. */
const heading = (s, kicker, title, opts = {}) => {
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: M, y: 0.46, w: 10, h: 0.26,
      fontFace: BODY, fontSize: 11, bold: true, color: AEGIS,
      charSpacing: 2.2, margin: 0,
    });
  }
  s.addText(title, {
    x: M, y: kicker ? 0.76 : 0.55, w: opts.w || 11.4, h: opts.h || 0.85,
    fontFace: HEAD, fontSize: opts.size || 34, bold: true, color: INK,
    margin: 0, lineSpacing: opts.size ? opts.size * 1.12 : 38,
  });
};

/** Soft card. Tint + hairline only — never an edge stripe. */
const card = (s, x, y, w, h, fill = PANEL) =>
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.09,
    fill: { color: fill },
    line: { color: LINE, width: 1 },
  });

/** The repeating motif: a teal disc holding a numeral or glyph. */
const disc = (s, x, y, label, d = 0.44, color = AEGIS) => {
  s.addShape(pres.ShapeType.ellipse, {
    x, y, w: d, h: d,
    fill: { color: color === AEGIS ? "0E3F3C" : "2A1418" },
    line: { color, width: 1.4 },
  });
  s.addText(label, {
    x, y, w: d, h: d,
    fontFace: BODY, fontSize: 13, bold: true, color,
    align: "center", valign: "middle", margin: 0,
  });
};

const foot = (s, text) =>
  s.addText(text, {
    x: M, y: H - 0.78, w: 11.9, h: 0.3,
    fontFace: BODY, fontSize: 10.5, color: FAINT, margin: 0,
  });

// ===========================================================================
// 1 — Title
// ===========================================================================
{
  const s = slide();
  s.addImage({ path: "mark.png", x: M, y: 1.62, w: 1.5, h: 1.5 });

  s.addText("Aegis", {
    x: M, y: 3.1, w: 9, h: 1.24,
    fontFace: HEAD, fontSize: 68, bold: true, color: INK, margin: 0,
    charSpacing: -1.2,
  });
  s.addText("The escrow agent that listens to the deal being made.", {
    x: M, y: 4.34, w: 9.4, h: 0.5,
    fontFace: BODY, fontSize: 21, color: AEGIS, margin: 0,
  });
  s.addText(
    "An autonomous AI voice arbitrator for peer-to-peer gig work. Two people talk. " +
      "Aegis drafts the contract from what they actually said, holds the money, " +
      "catches the manipulation, and verifies the work before it pays.",
    { x: M, y: 4.98, w: 8.5, h: 1.0, fontFace: BODY, fontSize: 13.5, color: DIM, margin: 0, lineSpacing: 20 },
  );

  s.addText("Fintech  ·  Security  ·  Voice AI", {
    x: 9.5, y: 1.72, w: 3.1, h: 0.3,
    fontFace: BODY, fontSize: 11.5, bold: true, color: AEGIS, align: "right", margin: 0, charSpacing: 0.8,
  });
  s.addText(
    [
      { text: "LIVE DEMO", options: { fontSize: 9.5, color: FAINT, bold: true, charSpacing: 1.2, breakLine: true } },
      { text: "aiges-eight.vercel.app", options: { fontSize: 12.5, color: INK, breakLine: true } },
      { text: " ", options: { fontSize: 7, breakLine: true } },
      { text: "SOURCE", options: { fontSize: 9.5, color: FAINT, bold: true, charSpacing: 1.2, breakLine: true } },
      { text: "github.com/SumedhKolte/aegis", options: { fontSize: 12.5, color: INK } },
    ],
    { x: 8.6, y: 2.34, w: 4.0, h: 1.7, fontFace: BODY, align: "right", margin: 0, lineSpacing: 19 },
  );

  foot(s, "Sumedh Kolte  ·  AI for Impact — Independence Day Hackathon 2026");
  s.addNotes(
    "Aegis is an AI voice arbitrator for peer-to-peer gig work. Everything in this deck is " +
      "running in production — live demo link on screen. I'll show you the problem, three " +
      "pillars, and the engineering that makes the money side trustworthy.",
  );
}

// ===========================================================================
// 2 — Problem
// ===========================================================================
{
  const s = slide();
  heading(s, "The problem", "Peer-to-peer work runs on trust\nthat nobody verifies.", { h: 1.5 });

  s.addText(
    "A freelancer agrees a price in a Fiverr DM or a Discord call, does the work, and hopes.\n" +
      "Fraud is conversational — it happens inside the negotiation, where no software is watching.",
    { x: M, y: 2.42, w: 8.6, h: 0.92, fontFace: BODY, fontSize: 13.5, color: DIM, margin: 0, lineSpacing: 21 },
  );

  const pains = [
    ["Escrow is priced for deals 100x larger", "Traditional escrow is too slow and too expensive to sit under a $250 job. So nobody uses it."],
    ["Chat platforms offer zero protection", "The place the deal is actually agreed has no concept of money, contracts, or recourse."],
    ["The scam happens before payment", "Off-platform payment pushes, late price changes, manufactured urgency. All spoken, all unrecorded."],
  ];
  pains.forEach(([t, b], i) => {
    const y = 3.5 + i * 1.16;
    disc(s, M, y + 0.06, String(i + 1));
    s.addText(t, {
      x: M + 0.66, y, w: 7.6, h: 0.32,
      fontFace: BODY, fontSize: 15, bold: true, color: INK, margin: 0,
    });
    s.addText(b, {
      x: M + 0.66, y: y + 0.33, w: 7.9, h: 0.62,
      fontFace: BODY, fontSize: 12.5, color: DIM, margin: 0, lineSpacing: 17,
    });
  });

  card(s, 9.35, 3.44, 3.23, 3.5, PANEL);
  s.addText("$556B", {
    x: 9.35, y: 3.86, w: 3.23, h: 0.85,
    fontFace: HEAD, fontSize: 44, bold: true, color: AEGIS, align: "center", margin: 0,
  });
  s.addText("global freelance economy", {
    x: 9.35, y: 4.66, w: 3.23, h: 0.3,
    fontFace: BODY, fontSize: 11.5, color: DIM, align: "center", margin: 0,
  });
  s.addText("Almost none of it is escrowed. The smaller the deal, the less protected it is —\nand small deals are most of the market.", {
    x: 9.62, y: 5.16, w: 2.7, h: 1.4,
    fontFace: BODY, fontSize: 11.5, color: FAINT, align: "center", margin: 0, lineSpacing: 16,
  });
  s.addNotes("The key insight: fraud in gig work is conversational. It happens in the negotiation itself, which is exactly where no software has ever been present.");
}

// ===========================================================================
// 3 — How it works
// ===========================================================================
{
  const s = slide();
  heading(s, "The solution", "Aegis sits inside the negotiation.");
  s.addText(
    "Not a form. Not a payment link. A neutral third party in the room, listening to the deal as it is made.",
    { x: M, y: 1.74, w: 11.4, h: 0.4, fontFace: BODY, fontSize: 14.5, color: DIM, margin: 0 },
  );

  const steps = [
    ["Talk", "Both parties join a voice room and negotiate out loud. Aegis listens as a neutral party."],
    ["Extract", "It pulls the item, the price and the release condition from speech, publishing each to both screens as it hears it."],
    ["Lock", "On two separate spoken agreements — and a passed liveness check — it calls a tool that locks the funds in escrow."],
    ["Settle", "Vision verifies the delivered work. If challenged, a three-agent jury splits the escrow to the cent."],
  ];
  steps.forEach(([t, b], i) => {
    const x = M + i * 3.03;
    card(s, x, 2.42, 2.82, 3.42);
    disc(s, x + 0.3, 2.76, String(i + 1), 0.46);
    s.addText(t, {
      x: x + 0.3, y: 3.42, w: 2.3, h: 0.36,
      fontFace: BODY, fontSize: 18, bold: true, color: INK, margin: 0,
    });
    s.addText(b, {
      x: x + 0.3, y: 3.84, w: 2.26, h: 1.8,
      fontFace: BODY, fontSize: 12, color: DIM, margin: 0, lineSpacing: 17,
    });
  });

  s.addText(
    "Every party unmutes to take the floor, conference-call style — so Aegis always knows exactly who is speaking.",
    { x: M, y: 6.15, w: 11.6, h: 0.4, fontFace: BODY, fontSize: 12.5, color: AEGIS, margin: 0 },
  );
  s.addNotes("Four beats: talk, extract, lock, settle. The whole product is making each of those trustworthy enough that two strangers don't need to trust each other.");
}

// ===========================================================================
// 4 — Pillar 1
// ===========================================================================
{
  const s = slide();
  heading(s, "Pillar 1 — Fintech + Voice AI", "Voice Escrow");
  s.addText(
    "Users do not fill out forms. They simply talk to each other, and the contract assembles itself on screen.",
    { x: M, y: 1.72, w: 7.4, h: 0.6, fontFace: BODY, fontSize: 14.5, color: DIM, margin: 0, lineSpacing: 21 },
  );

  const pts = [
    "Terms extracted live from speech over the OpenAI Realtime API",
    "Each term published to both parties the moment it is heard, so a misheard price surfaces before money is committed",
    "Funds lock only on two separate spoken agreements, collected one party at a time by name",
    "The arbitrator chairs the room: it relays each offer to the other side and asks them directly to accept or reject",
  ];
  s.addText(
    pts.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i !== pts.length - 1 } })),
    { x: M, y: 2.5, w: 7.2, h: 2.6, fontFace: BODY, fontSize: 13.5, color: INK, margin: 0, paraSpaceAfter: 12, lineSpacing: 19 },
  );

  // Terms-heard panel, mirroring the product UI
  card(s, 8.5, 2.42, 4.08, 3.9, PANEL);
  s.addText("TERMS HEARD", {
    x: 8.86, y: 2.72, w: 2.4, h: 0.26,
    fontFace: BODY, fontSize: 10, bold: true, color: FAINT, charSpacing: 1.6, margin: 0,
  });
  s.addText("3 of 3", {
    x: 10.6, y: 2.72, w: 1.6, h: 0.26,
    fontFace: BODY, fontSize: 10.5, color: AEGIS, align: "right", margin: 0,
  });

  const terms = [
    ["ITEM", "Landing page redesign"],
    ["PRICE", "$250.00"],
    ["RELEASES WHEN", "Figma file delivered"],
  ];
  terms.forEach(([k, v], i) => {
    const y = 3.22 + i * 1.0;
    s.addShape(pres.ShapeType.ellipse, {
      x: 8.86, y: y + 0.12, w: 0.16, h: 0.16,
      fill: { color: AEGIS }, line: { color: AEGIS, width: 1 },
    });
    s.addText(k, {
      x: 9.16, y, w: 3.1, h: 0.24,
      fontFace: BODY, fontSize: 9.5, bold: true, color: FAINT, charSpacing: 1.3, margin: 0,
    });
    s.addText(v, {
      x: 9.16, y: y + 0.26, w: 3.2, h: 0.4,
      fontFace: BODY, fontSize: i === 1 ? 22 : 14.5, bold: i === 1,
      color: i === 1 ? INK : INK, margin: 0,
    });
  });
  s.addText("Funds locked in escrow", {
    x: 8.86, y: 5.86, w: 3.4, h: 0.3,
    fontFace: BODY, fontSize: 12, bold: true, color: SIGNAL, margin: 0,
  });
  s.addNotes("The differentiator here is that the contract is visible while you are still talking. You catch a misheard price before any money moves, not after.");
}

// ===========================================================================
// 5 — Pillar 2
// ===========================================================================
{
  const s = slide();
  heading(s, "Pillar 2 — Security", "Deception Forensics");
  s.addText(
    "Six fraud patterns, scored as they are spoken. Past a threshold Aegis interrupts with a Security Halt and refuses to lock anything.",
    { x: M, y: 1.72, w: 11.4, h: 0.55, fontFace: BODY, fontSize: 13.5, color: DIM, margin: 0 },
  );

  const pats = [
    ["Off-platform payment", "“Just send it to my PayPal” — the single most reliable fraud signal in gig work."],
    ["Price manipulation", "A stated price changing late, after the other side has already signalled agreement."],
    ["Manufactured urgency", "“I'm boarding a flight in 20 minutes, confirm now.”"],
    ["Scope creep", "Deliverables quietly expanding after the price is set."],
    ["Identity spoofing", "“Skip the voice check, I'm the account owner.”"],
    ["Threat language", "Intimidation, blackmail, threats of retaliatory reviews."],
  ];
  pats.forEach(([t, b], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + col * 4.03;
    const y = 2.36 + row * 1.86;
    card(s, x, y, 3.82, 1.62);
    s.addText(t, {
      x: x + 0.28, y: y + 0.22, w: 3.3, h: 0.3,
      fontFace: BODY, fontSize: 14, bold: true, color: INK, margin: 0,
    });
    s.addText(b, {
      x: x + 0.28, y: y + 0.58, w: 3.3, h: 0.86,
      fontFace: BODY, fontSize: 11.5, color: DIM, margin: 0, lineSpacing: 16,
    });
  });

  card(s, M, 6.16, 11.86, 0.72, "2A1418");
  s.addText(
    [
      { text: "Security Halt.  ", options: { bold: true, color: HALT, fontSize: 14 } },
      { text: "Aegis physically interrupts the conversation to warn the party being targeted — and the escrow tool refuses to execute while the risk stands.", options: { color: DIM, fontSize: 12.5 } },
    ],
    { x: M + 0.3, y: 6.16, w: 11.3, h: 0.72, fontFace: BODY, valign: "middle", margin: 0 },
  );
  s.addNotes("This is not post-hoc analysis. It runs during the call, and it can stop the transaction. The halt is a hard gate on the money path, not a warning banner.");
}

// ===========================================================================
// 6 — Entropy trap (hero innovation)
// ===========================================================================
{
  const s = slide();
  heading(s, "Security — the novel part", "A cloned voice cannot pass\nthe entropy trap.", { h: 1.5 });

  s.addText(
    "Before funds lock, Aegis issues a randomised phrase from a ~2.3 million phrase space and measures pure reaction time — " +
      "from the moment it stops speaking to the moment you start.",
    { x: M, y: 2.5, w: 6.5, h: 1.0, fontFace: BODY, fontSize: 14, color: DIM, margin: 0, lineSpacing: 21 },
  );
  s.addText(
    "A human repeats it without thinking. A synthesis pipeline has to transcribe, generate and re-render on text it has never seen — and the delay gives it away.",
    { x: M, y: 3.56, w: 6.5, h: 1.0, fontFace: BODY, fontSize: 14, color: DIM, margin: 0, lineSpacing: 21 },
  );
  s.addText(
    "Responses are scored on phonetic similarity, not spelling — so an honest mishearing never fails a real person.",
    { x: M, y: 4.62, w: 6.5, h: 0.8, fontFace: BODY, fontSize: 14, color: AEGIS, margin: 0, lineSpacing: 21 },
  );

  card(s, 7.55, 2.42, 5.03, 4.0, PANEL);
  s.addText("CHALLENGE ISSUED", {
    x: 7.9, y: 2.74, w: 4.3, h: 0.26,
    fontFace: BODY, fontSize: 10, bold: true, color: AEGIS, charSpacing: 1.6, margin: 0,
  });
  s.addText("“The copper kettle counted\nnineteen umbrellas”", {
    x: 7.9, y: 3.08, w: 4.3, h: 0.8,
    fontFace: BODY, fontSize: 17, color: INK, margin: 0, lineSpacing: 25,
  });

  const rows = [
    ["Human speaker", "610 ms", SIGNAL],
    ["Threshold", "4,000 ms", FAINT],
    ["Synthesis pipeline", "Fails", HALT],
  ];
  rows.forEach(([k, v, c], i) => {
    const y = 4.12 + i * 0.62;
    s.addText(k, {
      x: 7.9, y, w: 2.8, h: 0.34,
      fontFace: BODY, fontSize: 13, color: DIM, margin: 0, valign: "middle",
    });
    s.addText(v, {
      x: 10.3, y, w: 1.92, h: 0.34,
      fontFace: BODY, fontSize: 15, bold: true, color: c, align: "right", margin: 0, valign: "middle",
    });
  });

  s.addText("Phonetic match", {
    x: 7.9, y: 5.96, w: 2.8, h: 0.34,
    fontFace: BODY, fontSize: 13, color: DIM, margin: 0, valign: "middle",
  });
  s.addText("97%", {
    x: 10.3, y: 5.96, w: 1.92, h: 0.34,
    fontFace: BODY, fontSize: 15, bold: true, color: SIGNAL, align: "right", margin: 0, valign: "middle",
  });
  s.addNotes("This is the piece I'd point a judge at. It defeats deepfake authorisation using latency rather than voice biometrics, so it costs nothing and needs no enrolment.");
}

// ===========================================================================
// 7 — Pillar 3
// ===========================================================================
{
  const s = slide();
  heading(s, "Pillar 3 — Virality", "The Trust Reel");
  s.addText(
    "Aegis turns security into the growth loop: every settled deal produces a shareable, verifiable receipt.",
    { x: M, y: 1.72, w: 11.4, h: 0.4, fontFace: BODY, fontSize: 14.5, color: DIM, margin: 0 },
  );

  const items = [
    ["Vision verification", "The seller uploads proof of the finished work. GPT-4o Vision checks it against the exact wording of the release condition before a cent moves."],
    ["A real narrated video", "A 1080×1920 vertical video with AI narration and burned-in subtitles, rendered entirely in the browser. No render farm, no upload."],
    ["It cannot overstate a payout", "Every figure is read from the ledger. A jury-settled deal honestly shows what was actually received — even when that is zero."],
    ["The Trust Passport", "A public profile aggregating settled deals, trust score and escrowed volume. Each completed job compounds into proof worth sending a client."],
  ];
  items.forEach(([t, b], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * 6.03;
    const y = 2.4 + row * 2.14;
    card(s, x, y, 5.82, 1.9);
    disc(s, x + 0.3, y + 0.28, "✓", 0.42, AEGIS);
    s.addText(t, {
      x: x + 0.86, y: y + 0.3, w: 4.6, h: 0.32,
      fontFace: BODY, fontSize: 15, bold: true, color: INK, margin: 0,
    });
    s.addText(b, {
      x: x + 0.3, y: y + 0.78, w: 5.2, h: 0.98,
      fontFace: BODY, fontSize: 12, color: DIM, margin: 0, lineSpacing: 17,
    });
  });
  s.addNotes("The reel is the acquisition loop. A freelancer shares it because it makes them money, and every share advertises Aegis.");
}

// ===========================================================================
// 8 — AI Jury
// ===========================================================================
{
  const s = slide();
  heading(s, "Advanced adjudication", "The AI Jury");
  s.addText(
    "When the buyer claims the work is defective, three agents resolve it with no human intervention.",
    { x: M, y: 1.72, w: 11.4, h: 0.4, fontFace: BODY, fontSize: 14.5, color: DIM, margin: 0 },
  );

  const agents = [
    ["Buyer's Advocate", "Builds the strongest good-faith case that the deliverable fell short, citing the contract's exact words."],
    ["Seller's Advocate", "Argues what the release condition actually required — versus what the buyer now wishes it had said."],
    ["The Magistrate", "Weighs both and issues a binding settlement in integer basis points. Ambiguity resolves against whoever could have made it precise."],
  ];
  agents.forEach(([t, b], i) => {
    const x = M + i * 4.03;
    card(s, x, 2.4, 3.82, 2.3);
    disc(s, x + 0.3, 2.68, String(i + 1), 0.44);
    s.addText(t, {
      x: x + 0.3, y: 3.24, w: 3.3, h: 0.32,
      fontFace: BODY, fontSize: 15, bold: true, color: INK, margin: 0,
    });
    s.addText(b, {
      x: x + 0.3, y: 3.62, w: 3.3, h: 0.94,
      fontFace: BODY, fontSize: 11.5, color: DIM, margin: 0, lineSpacing: 16,
    });
  });

  card(s, M, 5.02, 11.86, 1.62, PANEL2);
  s.addText("Mathematically exact settlement", {
    x: M + 0.36, y: 5.24, w: 5.4, h: 0.34,
    fontFace: BODY, fontSize: 15, bold: true, color: INK, margin: 0,
  });
  s.addText(
    "A $33.33 contract split 70 / 30 pays $23.33 and $10.00. The buyer absorbs the rounding\nremainder, so the ledger nets to exactly zero. No cent is created or destroyed.",
    { x: M + 0.36, y: 5.62, w: 6.6, h: 0.8, fontFace: BODY, fontSize: 12.5, color: DIM, margin: 0, lineSpacing: 18 },
  );
  ["$23.33 seller", "$10.00 buyer", "$0.00 drift"].forEach((t, i) => {
    s.addText(t, {
      x: 7.6 + i * 1.62, y: 5.5, w: 1.55, h: 0.66,
      fontFace: BODY, fontSize: 14, bold: true,
      color: i === 2 ? SIGNAL : INK, align: "center", valign: "middle", margin: 0,
    });
  });
  s.addNotes("Basis points, not percentages, and integer arithmetic throughout. This is the part that makes autonomous settlement defensible rather than scary.");
}

// ===========================================================================
// 9 — Guardian
// ===========================================================================
{
  const s = slide();
  heading(s, "Distribution", "Guardian: a market on day one");
  s.addText(
    "Most gig deals are agreed on Fiverr, Upwork or Discord long before anyone thinks about escrow. " +
      "Guardian meets that reality — paste the conversation, get the same forensics, convert it to real escrow.",
    { x: M, y: 1.72, w: 7.3, h: 0.9, fontFace: BODY, fontSize: 14, color: DIM, margin: 0, lineSpacing: 21 },
  );

  const g = [
    "The same six-pattern analysis, run over pasted text",
    "Findings must quote the source verbatim — the backend discards any quote it cannot locate in the conversation",
    "Terms never actually stated stay blank rather than being guessed, because an invented price would enter a real contract",
    "The counterparty needs no account until they accept the escrow invite",
  ];
  s.addText(
    g.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i !== g.length - 1 } })),
    { x: M, y: 2.78, w: 7.1, h: 2.5, fontFace: BODY, fontSize: 13, color: INK, margin: 0, paraSpaceAfter: 11, lineSpacing: 19 },
  );

  s.addText("No voice room needed. Aegis becomes useful to someone who never opens one.", {
    x: M, y: 5.5, w: 7.1, h: 0.5, fontFace: BODY, fontSize: 13, color: AEGIS, margin: 0, lineSpacing: 19,
  });

  card(s, 8.35, 2.4, 4.23, 3.9, PANEL);
  s.addText("MEASURED ON REAL THREADS", {
    x: 8.68, y: 2.7, w: 3.6, h: 0.26,
    fontFace: BODY, fontSize: 9.5, bold: true, color: FAINT, charSpacing: 1.4, margin: 0,
  });
  const scores = [
    ["Fiverr scam thread", "95", "DO NOT PROCEED", HALT],
    ["Clean negotiation", "5", "SAFE · 0 findings", SIGNAL],
  ];
  scores.forEach(([k, v, sub, c], i) => {
    const y = 3.16 + i * 1.6;
    s.addText(k, {
      x: 8.68, y, w: 2.5, h: 0.3,
      fontFace: BODY, fontSize: 12.5, color: DIM, margin: 0,
    });
    s.addText(v, {
      x: 8.68, y: y + 0.3, w: 2.0, h: 0.72,
      fontFace: HEAD, fontSize: 40, bold: true, color: c, margin: 0,
    });
    s.addText(sub, {
      x: 8.68, y: y + 1.02, w: 3.6, h: 0.3,
      fontFace: BODY, fontSize: 11, bold: true, color: c, margin: 0,
    });
  });
  s.addText("Zero false positives on the clean thread — a false alarm on an honest client costs a freelancer real work.", {
    x: 8.68, y: 5.62, w: 3.62, h: 0.6, fontFace: BODY, fontSize: 10, color: FAINT, margin: 0, lineSpacing: 14,
  });
  s.addNotes("This answers the hardest question a judge asks: who uses this on day one, before anyone changes their habits? Answer: anyone with a chat log.");
}

// ===========================================================================
// 10 — Money integrity
// ===========================================================================
{
  const s = slide();
  heading(s, "Engineering", "The money side has to be boring.");
  s.addText(
    "An escrow that cannot show its work is just a promise. Every design choice below exists to make the ledger auditable.",
    { x: M, y: 1.72, w: 11.4, h: 0.4, fontFace: BODY, fontSize: 14.5, color: DIM, margin: 0 },
  );

  const eng = [
    ["Money never touches a float", "price_cents is authoritative. price_usd is a generated Postgres column derived from it, so the amount displayed and the amount settled cannot drift apart."],
    ["An append-only ledger", "Every movement runs through SECURITY DEFINER functions that row-lock, validate and append in one transaction. Triggers reject any UPDATE or DELETE on ledger entries."],
    ["Least privilege on the money path", "Settlement functions are revoked from anon and authenticated. Only the backend calls them — and it re-validates every argument the model produced before a cent moves."],
    ["Three gates before any lock", "Cumulative risk below threshold, a passed live-speaker challenge, and real buyer solvency. A refusal is spoken aloud, not swallowed."],
  ];
  eng.forEach(([t, b], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * 6.03;
    const y = 2.4 + row * 2.18;
    card(s, x, y, 5.82, 1.94);
    s.addText(t, {
      x: x + 0.32, y: y + 0.26, w: 5.2, h: 0.32,
      fontFace: BODY, fontSize: 14.5, bold: true, color: AEGIS, margin: 0,
    });
    s.addText(b, {
      x: x + 0.32, y: y + 0.68, w: 5.2, h: 1.1,
      fontFace: BODY, fontSize: 12, color: DIM, margin: 0, lineSpacing: 17,
    });
  });

  s.addText("Nothing the model says is trusted on its own. The AI decides; Postgres enforces.", {
    x: M, y: 6.6, w: 11.6, h: 0.4, fontFace: BODY, fontSize: 13, bold: true, color: INK, margin: 0,
  });
  s.addNotes("If a judge is going to poke a hole, it will be here — an LLM moving money. The answer is that the LLM never moves money; it requests, and the database decides.");
}

// ===========================================================================
// 11 — Measured (native chart)
// ===========================================================================
{
  const s = slide();
  heading(s, "Evidence", "Measured, not asserted.");
  s.addText(
    "Guardian's fraud detection, scored on a realistic scam thread against a clean negotiation.",
    { x: M, y: 1.72, w: 11.4, h: 0.4, fontFace: BODY, fontSize: 13.5, color: DIM, margin: 0 },
  );

  s.addChart(
    pres.ChartType.bar,
    [{ name: "Risk score", labels: ["Fiverr scam thread", "Clean negotiation"], values: [95, 5] }],
    {
      x: M, y: 2.3, w: 6.9, h: 3.5,
      barDir: "col",
      chartColors: [HALT, SIGNAL],
      varyColors: true,
      showTitle: false,
      showLegend: false,
      showValue: true,
      dataLabelPosition: "outEnd",
      dataLabelColor: INK,
      dataLabelFontSize: 16,
      dataLabelFontBold: true,
      dataLabelFontFace: BODY,
      valAxisMaxVal: 100,
      valAxisMinVal: 0,
      catAxisLabelColor: DIM,
      catAxisLabelFontSize: 12,
      catAxisLabelFontFace: BODY,
      valAxisLabelColor: FAINT,
      valAxisLabelFontSize: 10,
      valAxisLabelFontFace: BODY,
      valGridLine: { color: LINE, size: 1 },
      catGridLine: { style: "none" },
      barGapWidthPct: 120,
      plotArea: { fill: { color: VOID_ } },
      chartArea: { fill: { color: VOID_ } },
    },
  );

  const stats = [
    ["$0.00", "ledger drift through hold,\nrelease and fractional dispute", SIGNAL],
    ["0", "false positives on the\nclean conversation", SIGNAL],
    ["610 ms", "human reaction time against a\n4,000 ms synthesis threshold", AEGIS],
  ];
  stats.forEach(([v, l, c], i) => {
    const y = 2.3 + i * 1.2;
    card(s, 8.1, y, 4.48, 1.04, PANEL);
    s.addText(v, {
      x: 8.42, y: y + 0.16, w: 1.55, h: 0.7,
      fontFace: HEAD, fontSize: 24, bold: true, color: c, margin: 0, valign: "middle",
    });
    s.addText(l, {
      x: 10.0, y: y + 0.16, w: 2.42, h: 0.7,
      fontFace: BODY, fontSize: 10.5, color: DIM, margin: 0, valign: "middle", lineSpacing: 14,
    });
  });

  s.addText(
    "Settlement maths is covered by a self-verifying SQL suite that asserts the ledger nets to exactly zero, then rolls itself back.",
    { x: 8.1, y: 5.92, w: 4.48, h: 0.6, fontFace: BODY, fontSize: 10.5, color: FAINT, margin: 0, lineSpacing: 15 },
  );
  s.addNotes("Every number here came from an actual run against the deployed system, not an estimate.");
}

// ===========================================================================
// 12 — Architecture
// ===========================================================================
{
  const s = slide();
  heading(s, "How it is built", "Architecture");

  const cols = [
    ["Frontend", "Next.js 15 · React 19\nDeployed on Vercel", "WebRTC session, camera upload for work proof, in-browser video rendering"],
    ["Backend", "Python · FastAPI\nDeployed on Render", "SDP proxy, tool-call validation, vision, jury, narration"],
    ["State", "Supabase Postgres\nRLS · Realtime · Storage", "Escrow vault, immutable ledger, live push to both parties"],
    ["Intelligence", "OpenAI\ngpt-realtime-2.1 · GPT-4o", "Voice arbitration, vision verification, jury, TTS narration"],
  ];
  cols.forEach(([t, sub, b], i) => {
    const x = M + i * 3.03;
    card(s, x, 2.06, 2.82, 2.68);
    s.addText(t, {
      x: x + 0.28, y: 2.3, w: 2.3, h: 0.32,
      fontFace: BODY, fontSize: 15, bold: true, color: AEGIS, margin: 0,
    });
    s.addText(sub, {
      x: x + 0.28, y: 2.68, w: 2.3, h: 0.7,
      fontFace: BODY, fontSize: 12, color: INK, margin: 0, lineSpacing: 17,
    });
    s.addText(b, {
      x: x + 0.28, y: 3.44, w: 2.3, h: 1.1,
      fontFace: BODY, fontSize: 11, color: DIM, margin: 0, lineSpacing: 15,
    });
  });

  card(s, M, 5.02, 11.86, 1.66, PANEL2);
  s.addText("Two decisions worth defending", {
    x: M + 0.34, y: 5.2, w: 5, h: 0.32,
    fontFace: BODY, fontSize: 14, bold: true, color: INK, margin: 0,
  });
  s.addText(
    "The OpenAI key never reaches the browser — the WebRTC handshake is proxied through FastAPI, so the credential stays server-side for the whole session.",
    { x: M + 0.34, y: 5.56, w: 5.5, h: 0.86, fontFace: BODY, fontSize: 11.5, color: DIM, margin: 0, lineSpacing: 16 },
  );
  s.addText(
    "Two-party remote voice runs peer-to-peer, bridged through the host and signalled over Supabase Realtime — no SFU, no third-party media service, no per-minute cost.",
    { x: 6.9, y: 5.56, w: 5.6, h: 0.86, fontFace: BODY, fontSize: 11.5, color: DIM, margin: 0, lineSpacing: 16 },
  );
  s.addNotes("Scalability question answered: media is peer-to-peer, state is Postgres, and the only per-transaction cost is model tokens.");
}

// ===========================================================================
// 13 — Close
// ===========================================================================
{
  const s = slide();
  s.addImage({ path: "mark.png", x: M, y: 1.5, w: 1.15, h: 1.15 });
  s.addText("Aegis holds the funds so neither\nparty has to trust the other.", {
    x: M, y: 2.94, w: 9.4, h: 1.5,
    fontFace: HEAD, fontSize: 38, bold: true, color: INK, margin: 0, lineSpacing: 46,
  });
  s.addText(
    "Live in production. Sign up with any email for a $2,500 demonstration balance and run a full deal — negotiation, escrow lock, verification, settlement, and a shareable receipt.",
    { x: M, y: 4.6, w: 8.2, h: 0.9, fontFace: BODY, fontSize: 14, color: DIM, margin: 0, lineSpacing: 21 },
  );

  const links = [
    ["Live demo", "aiges-eight.vercel.app"],
    ["Source", "github.com/SumedhKolte/aegis"],
    ["API health", "aiges-g41k.onrender.com/health"],
  ];
  links.forEach(([k, v], i) => {
    const x = M + i * 4.03;
    card(s, x, 5.66, 3.82, 0.92, PANEL);
    s.addText(k, {
      x: x + 0.3, y: 5.78, w: 3.2, h: 0.24,
      fontFace: BODY, fontSize: 9.5, bold: true, color: FAINT, charSpacing: 1.3, margin: 0,
    });
    s.addText(v, {
      x: x + 0.3, y: 6.04, w: 3.3, h: 0.34,
      fontFace: BODY, fontSize: 12.5, color: AEGIS, margin: 0,
    });
  });

  foot(s, "Sumedh Kolte  ·  AI for Impact — Independence Day Hackathon 2026");
  s.addNotes("Close on the one sentence that explains the whole product: Aegis holds the funds so neither party has to trust the other.");
}

pres
  .writeFile({ fileName: "Aegis-Pitch-Deck.pptx" })
  .then(() => console.log("Aegis-Pitch-Deck.pptx written"));
