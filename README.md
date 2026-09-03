# Scramble

You get one word. Find every smaller word hiding inside it.

Each letter of the starting word can be used **once per word** — `animal` has two
`a`s, so `banana` is out but `mania` is fine. The game tells you how many words
are possible up front; find them all to win, or give up to see the full list.

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
| Word length | 5–20 letters. A 6-letter word hides ~30 words; a 20-letter one hides over 1,000. |
| Shortest word that counts | 2, 3 (default) or 4. Raising it cuts out the obscure two- and three-letter filler. |
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
| `words.js` | Generated dictionary: `WORDS` (valid answers) + `PUZZLES` (starting words by length) |
| `build_dict.py` | Regenerates `words.js` from `data/` |
| `data/` | Raw source word lists |

## The dictionary

Word choice is most of what makes this game feel fair or infuriating, so the
dictionary is built rather than downloaded whole:

- **`enable1.txt`** (~173k words) is the gatekeeper. It's Scrabble-derived, which
  means no proper nouns, no abbreviations, and no apostrophe-stripped contractions
  — the junk (`milan`, `isnt`, `aclu`) that a raw word list would let through.
- **`popular.txt`** (~25k common words) and the top 25k of the **OpenSubtitles
  frequency list** decide what's common enough to actually count.
- A short hand-checked list adds modern words ENABLE predates (`email`, `wifi`) and
  long words the frequency list runs out of past 17 letters.
- Slurs are removed.

That lands at ~27k answers. Starting words are drawn from a pool of ~2,470 (up to
250 per length), each verified to be a real word in that same dictionary and to
hide at least 10 findable words.

To rebuild after editing the lists or tuning the constants at the top of the script:

```sh
python3 build_dict.py
```

## Next

Built as a webpage to settle the mechanics before any iPhone work. The logic in
`game.js` is plain, dependency-free JavaScript, so it ports to a WKWebView wrapper
as-is or translates to Swift with the same `words.js` data.
