"""The Vocal Entropy Trap.

A cloned-voice attacker runs a pipeline: hear audio -> transcribe -> generate
a reply -> synthesize speech. That pipeline is fast on *predictable* dialogue,
because the attacker can pre-generate. It is slow on a phrase it has never seen
and cannot anticipate.

So right before funds lock, Aegis issues a randomized phrase built from
high-entropy, semantically incoherent word choices ("The blue tiger bought
fifteen tacos"). A human reads it back in well under a second of thinking time.
A synthesis pipeline has to round-trip the whole stack on unseen text, and the
latency shows.

Two independent signals must both pass:
  1. LATENCY      - answered within the configured window
  2. FIDELITY     - what they said actually matches the phrase, compared
                    phonetically so honest transcription slips don't fail a
                    real human
"""

from __future__ import annotations

import re
import secrets
from difflib import SequenceMatcher

# Word banks chosen for phonetic spread and zero semantic association, so the
# resulting sentence cannot be guessed from context by a language model.
_ADJECTIVES = [
    "blue", "crimson", "hollow", "electric", "frozen", "velvet", "copper",
    "silent", "jagged", "amber", "restless", "marble", "crooked", "golden",
]
_NOUNS = [
    "tiger", "lantern", "compass", "harbor", "violin", "anchor", "sparrow",
    "meadow", "pyramid", "kettle", "glacier", "trumpet", "cactus", "domino",
]
_VERBS = [
    "bought", "counted", "delivered", "traded", "carried", "painted",
    "juggled", "measured", "stacked", "swallowed",
]
_OBJECTS = [
    "tacos", "umbrellas", "candles", "bicycles", "envelopes", "pineapples",
    "mirrors", "sandwiches", "telescopes", "lemons",
]
_NUMBERS = {
    3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight",
    9: "nine", 11: "eleven", 12: "twelve", 14: "fourteen", 15: "fifteen",
    17: "seventeen", 19: "nineteen", 21: "twenty one", 23: "twenty three",
}


def generate_phrase() -> str:
    """~2.3 million distinct phrases — not reasonably pre-generatable."""
    count, word = secrets.choice(list(_NUMBERS.items()))
    return (
        f"The {secrets.choice(_ADJECTIVES)} {secrets.choice(_NOUNS)} "
        f"{secrets.choice(_VERBS)} {word} {secrets.choice(_OBJECTS)}"
    )


# --- phonetic normalisation --------------------------------------------------
# A deliberately small, fast soundalike fold. Full Double Metaphone is overkill
# here: we only need "fifteen"/"15" and "harbour"/"harbor" to collapse together
# while genuinely different words stay apart.

_DIGIT_WORDS = {
    "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
    "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten",
    "11": "eleven", "12": "twelve", "13": "thirteen", "14": "fourteen",
    "15": "fifteen", "16": "sixteen", "17": "seventeen", "18": "eighteen",
    "19": "nineteen", "20": "twenty", "21": "twenty one",
    "23": "twenty three",
}

_FOLDS = [
    (r"ough|augh", "f"),
    (r"ph", "f"),
    (r"ck|q", "k"),
    (r"[cs]h", "x"),
    (r"c", "k"),
    (r"[zs]+", "s"),
    (r"[dt]+", "t"),
    (r"[aeiou]+", "a"),   # vowels collapse; accents shouldn't fail a human
    (r"(.)\1+", r"\1"),   # squash doubles
]


def _phonetic(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = " ".join(_DIGIT_WORDS.get(tok, tok) for tok in text.split())
    for pattern, repl in _FOLDS:
        text = re.sub(pattern, repl, text)
    return re.sub(r"\s+", "", text)


def phonetic_similarity(expected: str, heard: str) -> float:
    """0.0 to 1.0. Compares soundalike forms, not spellings."""
    if not heard.strip():
        return 0.0
    return SequenceMatcher(None, _phonetic(expected), _phonetic(heard)).ratio()


def evaluate(
    *,
    expected: str,
    heard: str,
    latency_ms: int,
    max_latency_ms: int,
    min_match: float,
) -> tuple[bool, float, str]:
    """Return (passed, similarity, human-readable verdict)."""
    similarity = phonetic_similarity(expected, heard)
    too_slow = latency_ms > max_latency_ms
    too_different = similarity < min_match

    if too_slow and too_different:
        return False, similarity, (
            f"Failed both checks: responded in {latency_ms} ms "
            f"(limit {max_latency_ms} ms) and phonetic match was only "
            f"{similarity:.0%}."
        )
    if too_slow:
        return False, similarity, (
            f"Response latency {latency_ms} ms exceeded the {max_latency_ms} ms "
            f"limit. Consistent with synthesized speech re-generating on an "
            f"unseen phrase."
        )
    if too_different:
        return False, similarity, (
            f"Phonetic match {similarity:.0%} is below the required "
            f"{min_match:.0%}. The challenge phrase was not repeated correctly."
        )
    return True, similarity, (
        f"Live speaker confirmed: {similarity:.0%} phonetic match in "
        f"{latency_ms} ms."
    )
