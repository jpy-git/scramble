#!/usr/bin/env python3
"""Build defs.js for Scramble: short dictionary definitions for tapping a word.

Input:
  words.js  - built by build_dict.py; every word it carries gets a definition
              if WordNet has one. Target words get up to three senses, bonus
              words one: they are four times as many and mostly obscure, so
              one sense answers "is that really a word?" at a fraction of
              the size.
  WordNet   - Princeton WordNet 3.0, through NLTK. Free to use and redistribute
              as long as its licence travels with it: data/wordnet-LICENSE.txt,
              which the build copies into the top of defs.js.

WordNet only lists base forms ("abandon", "goose"), so an inflected word points
at its base instead: "abandons" -> "form of abandon", "geese" -> "plural of
goose". A word that is both ("found": set up, and the past of "find") gets its
own senses and the pointer, most common reading first.

Output:
  defs.js   - DEFS, loaded after the game starts so it never delays the first
              puzzle. DEFS[word] = [senses, forms, formsFirst]:
                senses:     [[part of speech, gloss], ...]
                forms:      [[label, base word, its part of speech], ...]
                            (omitted when empty)
                formsFirst: 1 when the base reading is the more common one
                            ("rose" is mostly the past of "rise"), else omitted
              Every base word a form points at is a game word with its own
              entry.

Usage:
  pip install nltk
  python3 -c "import nltk; nltk.download('wordnet')"
  python3 build_defs.py
"""
import json
import re

from nltk.corpus import wordnet as wn

MAX_SENSES = 3         # senses shown per target word
MAX_SENSES_BONUS = 1   # and per bonus word
MAX_PER_POS = 2        # so one part of speech can't crowd out the others
POS_NAMES = {"n": "noun", "v": "verb", "a": "adj", "s": "adj", "r": "adv"}


def read_words():
    lists = {}
    for line in open("words.js"):
        m = re.match(r"const (WORDS|BONUS) = (\".*\")\.split", line)
        if m:
            lists[m.group(1)] = json.loads(m.group(2)).split(" ")
    assert len(lists) == 2, "word lists not found in words.js - run build_dict.py first"
    return lists["WORDS"], lists["BONUS"]


def tidy(gloss):
    # WordNet quotes TeX-style: "(comparative of `good')".
    return re.sub(r"`([^`']*)'", "‘\\1’", gloss)


def own_senses(word, limit=MAX_SENSES, need=()):
    """WordNet senses listed under exactly this spelling, most common first.

    Returns (weight, senses). wn.synsets() on its own also folds in the
    senses of the base form, which the forms pointer covers instead. `need`
    names parts of speech that must get a sense past the limit: "sores" shows
    the noun "sore", even though the adjective fills sore's own entry.
    """
    by_pos = {}
    for syn in wn.synsets(word):
        # Exact case, which also skips proper nouns ("OK" the state, "Turkey").
        lemma = next((l for l in syn.lemmas() if l.name() == word), None)
        if lemma is None:
            continue
        pos = POS_NAMES[syn.pos()]
        # Sense counts come from a tagged corpus; +1 keeps untagged senses in
        # WordNet's own order rather than tied at zero.
        by_pos.setdefault(pos, []).append((lemma.count() + 1, tidy(syn.definition())))

    groups = sorted(by_pos.items(), key=lambda kv: -sum(c for c, _ in kv[1]))
    senses = []
    for pos, entries in groups:
        for i, (_, gloss) in enumerate(entries[:MAX_PER_POS]):
            if len(senses) < limit or (i == 0 and pos in need):
                senses.append([pos, gloss])
    weight = sum(c for entries in by_pos.values() for c, _ in entries)
    return weight, senses


def form_label(word, pos):
    if pos == "n":
        return "plural of"
    if pos == "v":
        if word.endswith("ing"):
            return "-ing form of"
        if word.endswith("s"):
            return "form of"
        return "past of"
    if word.endswith("est"):
        return "superlative of"
    if word.endswith("er"):
        return "comparative of"
    return "form of"


def forms_of(word, accepted):
    """[(weight, label, base, part of speech)] for each base form this word
    inflects, most common first.

    Only bases the game itself accepts: that keeps out the slurs build_dict.py
    blocks, and morphy's stretches ("as" -> plural of "a").
    """
    found = {}
    for pos in "nvar":
        for base in wn._morphy(word, pos):
            if base == word or base not in accepted:
                continue
            weight = sum(l.count() + 1 for s in wn.synsets(base, pos)
                         for l in s.lemmas() if l.name() == base)
            # "abandons" is a form of both the noun and the verb; label it by
            # the more common one.
            if weight > found.get(base, (0,))[0]:
                found[base] = (weight, form_label(word, pos), base, POS_NAMES[pos])
    return sorted(found.values(), reverse=True)


def main():
    targets, bonus = read_words()
    is_target = set(targets)
    words = targets + bonus
    accepted = set(words)
    forms = {w: forms_of(w, accepted) for w in words}

    # Which parts of speech each base word is pointed at as.
    need = {}
    for fs in forms.values():
        for _, _, base, pos in fs:
            need.setdefault(base, set()).add(pos)

    defs = {}
    for word in words:
        limit = MAX_SENSES if word in is_target else MAX_SENSES_BONUS
        weight, senses = own_senses(word, limit, need.get(word, ()))
        fs = forms[word]
        if not senses and not fs:
            continue
        entry = [senses]
        if fs:
            entry.append([[label, base, pos] for _, label, base, pos in fs])
            if senses and fs[0][0] > weight:
                entry.append(1)
        defs[word] = entry

    print(f"defined {len(defs)} of {len(words)} words")
    with open("defs.js", "w", encoding="utf-8") as fh:
        fh.write("// Generated by build_defs.py -- do not edit by hand.\n")
        fh.write("/* Definitions from Princeton WordNet 3.0, under this licence:\n\n")
        fh.write(open("data/wordnet-LICENSE.txt").read().strip() + "\n*/\n")
        fh.write("const DEFS = ")
        json.dump(defs, fh, separators=(",", ":"), sort_keys=True, ensure_ascii=False)
        fh.write(";\n")


if __name__ == "__main__":
    main()
