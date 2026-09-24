# Scramble

You get one word. Find every smaller word hiding inside it.

Each letter of the starting word can be used **once per word** — `animal` has two
`a`s, so `banana` is out but `mania` is fine. The game tells you how many words
are possible up front; find them all to win, or give up to see the full list.

Only reasonably common words count toward that total. Any other real word is still
accepted as a **bonus word**: it's listed separately but doesn't count for or
against you, so an obscure word never blocks a win and a real one is never
rejected.

## Play

```sh
cd scramble
python3 -m http.server 8777
```

Then open <http://localhost:8777>. No build step, no dependencies — it's three
static files plus a dictionary. (After editing a file, hard-refresh with
<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>; `http.server` sends no cache headers,
so a plain reload can serve you a stale script.)

## Options

| Option | What it does |
| --- | --- |
| Starting word length | 5–20 letters, default 7. With the default minimum, a typical 7-letter word hides ~18 words, a 12-letter one ~200, and 18+ letters over 900. Words of the same length vary a lot, since some letters combine far better than others: an 8-letter word can hide 13 or 78. |
| Shortest word that counts | 2, 3 or 4 (default). Raising it cuts out the obscure two- and three-letter filler. |
| Use my own word | Any real word from the game's dictionary, 5–20 letters. Applies to that one round, then clears. |

While playing: the starting word is shown as itself, in order. Tiles light up as
you type to show which letters you're spending, and typing anywhere on the page
jumps to the input box.

No timer, no clock. Take as long as you like.

## Files

| File | |
| --- | --- |
| `index.html` | Markup |
| `style.css` | Styling — mobile-first, so it already behaves on a phone |
| `game.js` | All game logic |
| `words.js` | Generated dictionary: `WORDS` (target words) + `BONUS` (other accepted words) + `PUZZLES` (starting words by length) + `PUZZLE_COUNTS` (how many targets each starting word hides) |
| `build_dict.py` | Regenerates `words.js` from `data/` |
| `data/` | Raw source word lists |

## The dictionary

Word choice is most of what makes this game feel fair or infuriating, so the
dictionary is built rather than downloaded whole:

It has two tiers. **Accepted** words are every word the game recognises (~176k).
**Target** words (~35k) are the common subset a player should be expected to find:
they make up the "possible" count and the give-up list. Everything accepted but
not a target is a bonus word.

- **`enable1.txt`** (~173k words) is a Scrabble-derived list with no proper nouns,
  no abbreviations and no apostrophe-stripped contractions — the junk (`milan`,
  `isnt`, `aclu`) that a raw word list would let through. Every word in it is
  accepted.
- **`3of6game.txt`** (~65k words) decides which words *can* be targets. It's the
  12dicts word-game list: words found in at least 3 of 6 advanced learner's
  dictionaries. That keeps out the names and obscure Scrabble words ENABLE
  carries (`alan`, `ama`, `ani`), while keeping inflections, British spellings
  and some newer words. Its words are all accepted too.
- **[wordfreq](https://github.com/rspeer/wordfreq)** frequency scores then decide
  which of those are common enough. The bar rises as words get shorter: short
  words show up in nearly every puzzle, so an obscure one is noticed every time.
- Two-letter targets are a fixed hand-picked list.
- `NOT_TARGET` in `build_dict.py` is a short list of words the rules let through
  but shouldn't count, mostly names in practice (`john`, `mike`) or crude. They're
  still accepted as bonus words. The build warns if an entry stops being needed.
- Another short hand-checked list adds modern words the lists predate (`wifi`)
  and long words the frequency data runs out of past 17 letters.
- Slurs are `BLOCKED` entirely, not even accepted as bonus words.

Starting words are drawn from a pool of ~2,680 (up to 250 per length), the most
common target words at each length that hide at least 10 target words.

To rebuild after editing the lists or tuning the constants at the top of the script:

```sh
pip install wordfreq
python3 build_dict.py
```

`words.js` is ~1.8 MB (~510 KB gzipped), mostly the bonus list.

### Credits

`data/3of6game.txt` is from [12dicts](https://wordlist.aspell.net/12dicts/) by
Alan Beale, released into the public domain.

## Next

Built as a webpage to settle the mechanics before any iPhone work. The logic in
`game.js` is plain, dependency-free JavaScript, so it ports to a WKWebView wrapper
as-is or translates to Swift with the same `words.js` data.
