#!/usr/bin/env python3
"""Build words.js for Scramble.

The dictionary has two tiers:

  WORDS  - target words. Common enough that a player should be expected to find
           them: these make up a puzzle's "possible" count and the list shown on
           give-up.
  BONUS  - every other real word. Typing one is accepted and credited as a bonus
           word, but it never counts toward (or against) finishing a puzzle.

Splitting the two means the target list can be strict without the game ever
rejecting a real word.

Inputs:
  data/enable1.txt - ENABLE word list, ~173k words (dolph/dictionary).
                     Scrabble-derived, so it carries no proper nouns, abbreviations
                     or apostrophe-stripped contractions. This is the gatekeeper:
                     every accepted word appears here (bar MODERN / EXTRA_LONG).
  data/popular.txt - ~25k common English words (dolph/dictionary), a subset of
                     ENABLE. Words in it get a lower frequency bar,
                     and at 3-4 letters only its words can be targets.
  wordfreq         - Python package (pip install wordfreq). Zipf frequency drawn
                     from Wikipedia, books, news, web text and subtitles; it
                     decides which words are common enough to be targets.

Output:
  words.js         - WORDS + BONUS + PUZZLES (starting words by length)
                     + PUZZLE_COUNTS (each starting word's target count)

Usage: pip install wordfreq && python3 build_dict.py
"""
import json
from collections import Counter

from wordfreq import zipf_frequency

DATA = "data/"
MIN_ANSWER = 2          # shortest word the dictionary carries
MAX_ANSWER = 20         # longest starting word, so nothing longer can be an answer
PUZZLE_MIN_LEN = 5
PUZZLE_MAX_LEN = 20
CANDIDATES_PER_LEN = 400  # most common words per length considered as puzzles
KEEP_PER_LEN = 250        # how many survive into the shipped puzzle pool
MIN_SUBWORDS = 10         # a starting word must yield at least this many targets
MIN_LEN_SETTINGS = [2, 3, 4]  # the game's "shortest word that counts" options

# Minimum Zipf frequency for a target word, by length, as a pair: the bar for a
# word in popular.txt (or an inflection of one), then the bar for any other word
# (None: never a target). Zipf 3 is about once per million words. popular.txt
# is the stronger signal - frequency data counts names and abbreviations as words
# ("jun", "tel", "raj") - so its words get a lower bar, and at 3-4 letters, where
# ENABLE is thick with lookalikes, nothing else counts.
# Short words get the highest bar: they turn up in nearly every puzzle, so an
# obscure one is felt every time, while a rare 9-letter word only surfaces in the
# odd give-up list.
TARGET_ZIPF = {3: (3.0, None), 4: (2.7, None), 5: (2.5, 3.0), 6: (2.4, 2.9), 7: (2.3, 2.8)}
TARGET_ZIPF_LONG = (2.2, 2.6)   # 8 letters and up

# Two-letter words are too few to need a rule and too junk-prone to trust one.
TWO_LETTER_TARGETS = """
ah am an as at aw be by do eh go ha he hi hm if in is it me mm my no of oh ok on
or ow ox so to uh um up us we ya ye yo
""".split()

# ENABLE predates the consumer internet, so a few words players will certainly
# try are missing from it. They bypass the ENABLE gate and are always targets.
MODERN = """
email internet online website blog app apps wifi smartphone podcast selfie
emoji username password login logout upload download webcam laptop router
ok okay hashtag streaming download meme avatar spam
""".split()

# The frequency data thins out badly past 17 letters, so the longest puzzles are
# topped up from a hand-checked list of words people actually recognise. Always
# targets.
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

# Real dictionary words, but not ones anyone wants to meet in a word game. Not
# accepted at all, not even as bonus words.
BLOCKED = """
nigger niggers nigga niggas faggot faggots fag fags spic spics spick spicks
chink chinks chinky kike kikes gook gooks wetback wetbacks tranny trannies coon
coons retard retards retarded negro negroes dago dagoes wop wops gyp gyps gypped
honky honkies jew jews jewed jewing kaffir kaffirs redskin redskins darky darkies
darkey squaw squaws coolie coolies mick micks
""".split()

# Everyday words the rules above miss, mostly short ones absent from popular.txt.
# Always targets.
ALSO_TARGET = """
apt gait gnat gnats lain pang roe tang tsar fig figs bio yak aft
""".split()

# Accepted as bonus words but never targets: names and places that happen to be
# in ENABLE and are common only as proper nouns, stray abbreviations and
# foreign fragments, and words too crude to require. Add to this as they turn up.
NOT_TARGET = """
ami ana ava bel bey bis cor cos cox dee dis dom dos dun eng ems eta goa hes hon
hun ids ins jin kat kay lac lam lex lin mae mag mas mel mil mis mod mos nam nan
nos obi ole ons pac pam pas rec res rex rom sal sen ser sha sic sim sis sol sos
sox tae taj tat til tis tor vis wha yeh yin cum tit ais ars att bas bos dex dey
ers eth fas fer ich lis mor mus pes rem rin tas tau tod aga coz dah deb hoy jus
mol pap pom tic ump zee

alec alma anna bach beth brad brit cain carl carr chad cobb cole cory dahl davy
dell earl eyre ford glen holt howe jake jane jess jill john josh kane kent kirk
kris lang lars lear lima lowe luna marc matt maya mike milo mina noel otto rand
rolf ruth saul scot shaw shay tate toby tony troy tung turk vera wynn conn bree
lulu sous amin gage kern bren brin hons lacs pacs sark sade tass poms roms nils
mano loca sacs lees gens mons montes hales
casas cates howes janes jakes nance neves earls conners dobbins palmers eugenia
cunt fuck piss slut tits turd twat homo dyke dykes shes

wales calif surrey tesla congo leone cisco toledo wigan levin pascal sharif
madras fulham ridley hooper cairns draper sabine seneca derry cicero conte brasil
liang macon moira bethel lister tonga currie mullen romano roper argus gambia
garvey spicer kamala culver maduro penang saxony chopin argyll melton nestor
adonis merlin dexter kyrie sheila regina dalton louie lacey

bangkok frankfurt valencia bolivia siemens tripoli inverness underwood greenwood
khalifa matilda dominique johannes andromeda chesterfield nickelodeon cummins
coulter prentice whitehead shetland piedmont corolla templar
""".split()


def read_words(name):
    return {w.strip() for w in open(DATA + name) if w.strip().isalpha() and w.strip().isascii()}


def inflects(word, base_words):
    """True if `word` looks like a plural or verb form of something in `base_words`."""
    for suffix, stem_end in (("ies", "y"), ("es", ""), ("s", ""), ("ed", ""), ("ed", "e"),
                             ("ing", ""), ("ing", "e")):
        if word.endswith(suffix) and word[: -len(suffix)] + stem_end in base_words:
            return True
    return False


def is_target(word, zipf, popular):
    if len(word) == 2:
        return word in TWO_LETTER_TARGETS
    common, other = TARGET_ZIPF.get(len(word), TARGET_ZIPF_LONG)
    if word in popular or inflects(word, popular):
        return zipf >= common
    return other is not None and zipf >= other


def main():
    enable = read_words("enable1.txt")
    popular = read_words("popular.txt")
    blocked = set(BLOCKED)

    accepted = {w for w in enable | set(MODERN) | set(EXTRA_LONG)
                if MIN_ANSWER <= len(w) <= MAX_ANSWER} - blocked
    zipf = {w: zipf_frequency(w, "en") for w in accepted}

    targets = {w for w in accepted if is_target(w, zipf[w], popular)}
    targets |= set(MODERN) | set(EXTRA_LONG) | set(ALSO_TARGET)
    targets -= set(NOT_TARGET)
    targets -= blocked

    missing = [w for w in TWO_LETTER_TARGETS + ALSO_TARGET + NOT_TARGET if w not in accepted]
    assert not missing, f"listed words missing from the dictionary: {missing}"

    answers = sorted(targets)
    bonus = sorted(accepted - targets)
    print(f"targets: {len(answers)}   bonus: {len(bonus)}")

    # Index targets by their letter-set bitmask so we can find every word makeable
    # from a candidate by walking that candidate's submasks instead of the dictionary.
    by_mask = {}
    for w in answers:
        mask = 0
        for ch in w:
            mask |= 1 << (ord(ch) - 97)
        by_mask.setdefault(mask, []).append((len(w), Counter(w)))

    puzzles = {}
    # For each puzzle word, how many targets it hides at each "shortest word"
    # setting the game offers - feeds the chart on the setup screen.
    counts = {}
    for length in range(PUZZLE_MIN_LEN, PUZZLE_MAX_LEN + 1):
        pool = sorted((w for w in answers if len(w) == length),
                      key=lambda w: -zipf.get(w, 0))[:CANDIDATES_PER_LEN]
        # Curated long words may rank too low to make the cut, so append them explicitly.
        pool += [w for w in EXTRA_LONG if len(w) == length and w not in pool]

        kept, kept_counts = [], []
        for word in pool:
            have = Counter(word)
            mask = 0
            for ch in word:
                mask |= 1 << (ord(ch) - 97)
            by_min = [0] * len(MIN_LEN_SETTINGS)
            sub = mask
            while True:  # every submask of the word's letter set
                for size, need in by_mask.get(sub, ()):
                    if all(have[ch] >= n for ch, n in need.items()):
                        for i, least in enumerate(MIN_LEN_SETTINGS):
                            by_min[i] += size >= least
                if sub == 0:
                    break
                sub = (sub - 1) & mask
            by_min = [n - 1 for n in by_min]  # the word itself is not a sub-word
            if by_min[MIN_LEN_SETTINGS.index(3)] >= MIN_SUBWORDS:
                kept.append(word)
                kept_counts.append(by_min)
            if len(kept) >= KEEP_PER_LEN:
                break
        puzzles[length] = kept
        counts[length] = kept_counts
        print(f"  len {length:2d}: {len(kept):3d} puzzle words")

    # A starting word must always be one of our own target words.
    for length, words in puzzles.items():
        stray = [w for w in words if w not in targets]
        assert not stray, f"puzzle words missing from the targets: {stray}"

    with open("words.js", "w") as fh:
        fh.write("// Generated by build_dict.py -- do not edit by hand.\n")
        fh.write("const WORDS = %s.split(' ');\n" % json.dumps(" ".join(answers)))
        fh.write("const BONUS = %s.split(' ');\n" % json.dumps(" ".join(bonus)))
        fh.write("const PUZZLES = %s;\n" % json.dumps(
            {str(k): v for k, v in puzzles.items() if v}, separators=(",", ":")))
        # PUZZLE_COUNTS[length][i] lines up with PUZZLES[length][i]: that word's
        # target count at each MIN_LENS setting.
        fh.write("const MIN_LENS = %s;\n" % json.dumps(MIN_LEN_SETTINGS))
        fh.write("const PUZZLE_COUNTS = %s;\n" % json.dumps(
            {str(k): v for k, v in counts.items() if v}, separators=(",", ":")))


if __name__ == "__main__":
    main()
