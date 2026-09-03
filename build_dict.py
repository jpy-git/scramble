#!/usr/bin/env python3
"""Build words.js for Scramble.

Inputs (data/):
  enable1.txt  - ENABLE word list, ~173k words (dolph/dictionary).
                 Scrabble-derived, so it carries no proper nouns, abbreviations
                 or apostrophe-stripped contractions. This is the gatekeeper:
                 nothing becomes a valid answer unless it appears here.
  popular.txt  - ~25k common English words (dolph/dictionary), a subset of ENABLE.
  en_50k.txt   - OpenSubtitles frequency list (hermitdave/FrequencyWords), used
                 only to rank and to promote extra ENABLE words into play.

Output:
  words.js     - WORDS (every valid answer) + PUZZLES (starting words by length)

Usage: python3 build_dict.py
"""
import json
from collections import Counter

DATA = "data/"
MIN_ANSWER = 2          # shortest word the dictionary carries
FREQ_CUTOFF = 25000     # how deep into the frequency list to promote ENABLE words
PUZZLE_MIN_LEN = 5
PUZZLE_MAX_LEN = 20
CANDIDATES_PER_LEN = 400  # most common words per length considered as puzzles
KEEP_PER_LEN = 250        # how many survive into the shipped puzzle pool
MIN_SUBWORDS = 10         # a starting word must yield at least this many answers

# ENABLE predates the consumer internet, so a few words players will certainly
# try are missing from it. They bypass the ENABLE gate.
MODERN = """
email internet online website blog app apps wifi smartphone podcast selfie
emoji username password login logout upload download webcam laptop router
ok okay hashtag streaming download meme avatar spam
""".split()

# The frequency list thins out badly past 17 letters, so the longest puzzles are
# topped up from a hand-checked list of words people actually recognise.
EXTRA_LONG = """
telecommunications characteristically unconstitutionally overrepresentation
disproportionately interdisciplinary counterproductively counterintelligence
incomprehensibility misinterpretations disproportionality overgeneralization
institutionalization electroencephalogram uncharacteristically internationalization
industrialization misrepresentation acknowledgements straightforwardness
inconsequentially interchangeability incompatibilities undistinguishable
environmentalists conversationalists indistinguishably extraterrestrials
autobiographical anthropomorphism disestablishment inconsiderateness
overcompensation professionalization impressionistic sensationalistic
constitutionality experimentalists neurotransmitters instrumentalists
administrations transformational representational unpredictability
incomprehension
""".split()


# Real dictionary words, but not ones anyone wants to meet in a word game.
BLOCKED = """
nigger niggers nigga niggas faggot faggots fag fags spic spics chink chinks
kike kikes gook gooks wetback wetbacks tranny trannies coon coons
retard retards retarded negro negroes
""".split()


def read_words(name):
    return {w.strip() for w in open(DATA + name) if w.strip().isalpha() and w.strip().isascii()}


def main():
    enable = read_words("enable1.txt")
    popular = read_words("popular.txt")
    freq = []
    for line in open(DATA + "en_50k.txt"):
        parts = line.split()
        if len(parts) == 2 and parts[0].isalpha() and parts[0].isascii():
            freq.append(parts[0].lower())
    freq_rank = {w: i for i, w in enumerate(freq)}

    answers = set(popular)
    answers |= {w for w in freq[:FREQ_CUTOFF] if w in enable}
    answers |= set(EXTRA_LONG)   # hand-checked, so they bypass the ENABLE gate
    answers |= set(MODERN)
    answers -= set(BLOCKED)
    answers = sorted(w for w in answers if len(w) >= MIN_ANSWER)
    print(f"answers: {len(answers)}")

    # Index answers by their letter-set bitmask so we can find every word makeable
    # from a candidate by walking that candidate's submasks instead of the dictionary.
    scoring = [w for w in answers if len(w) >= 3]
    by_mask = {}
    for w in scoring:
        mask = 0
        for ch in w:
            mask |= 1 << (ord(ch) - 97)
        by_mask.setdefault(mask, []).append(Counter(w))

    puzzles = {}
    for length in range(PUZZLE_MIN_LEN, PUZZLE_MAX_LEN + 1):
        pool = sorted((w for w in answers if len(w) == length),
                      key=lambda w: freq_rank.get(w, 10 ** 9))[:CANDIDATES_PER_LEN]
        # Curated long words carry no frequency rank, so append them explicitly.
        pool += [w for w in EXTRA_LONG if len(w) == length and w not in pool]

        kept = []
        for word in pool:
            have = Counter(word)
            mask = 0
            for ch in word:
                mask |= 1 << (ord(ch) - 97)
            total = 0
            sub = mask
            while True:  # every submask of the word's letter set
                for need in by_mask.get(sub, ()):
                    if all(have[ch] >= n for ch, n in need.items()):
                        total += 1
                if sub == 0:
                    break
                sub = (sub - 1) & mask
            if total - 1 >= MIN_SUBWORDS:  # -1: the word itself is not a sub-word
                kept.append(word)
            if len(kept) >= KEEP_PER_LEN:
                break
        puzzles[length] = kept
        print(f"  len {length:2d}: {len(kept):3d} puzzle words")

    # A starting word must always be a real word from our own dictionary.
    known = set(answers)
    for length, words in puzzles.items():
        stray = [w for w in words if w not in known]
        assert not stray, f"puzzle words missing from the dictionary: {stray}"

    with open("words.js", "w") as fh:
        fh.write("// Generated by build_dict.py -- do not edit by hand.\n")
        fh.write("const WORDS = %s.split(' ');\n" % json.dumps(" ".join(answers)))
        fh.write("const PUZZLES = %s;\n" % json.dumps(
            {str(k): v for k, v in puzzles.items() if v}, separators=(",", ":")))


if __name__ == "__main__":
    main()
