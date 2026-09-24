/* Scramble - game logic.
   Depends on WORDS (target words), BONUS (every other accepted word) and
   PUZZLES (starting words by length) from words.js. */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const el = {
    setup: $("setup"), game: $("game"), banner: $("banner"),
    length: $("length"), lengthOut: $("lengthOut"), minLen: $("minLen"),
    customWord: $("customWord"), customHint: $("customHint"),
    customPanel: $("customPanel"), start: $("start"),
    tiles: $("tiles"),
    foundCount: $("foundCount"), totalCount: $("totalCount"),
    progressBar: $("progressBar"),
    guessForm: $("guessForm"), guess: $("guess"), message: $("message"),
    results: $("results"), giveUp: $("giveUp"), newGame: $("newGame"),
    bannerTitle: $("bannerTitle"), bannerText: $("bannerText"), bannerNew: $("bannerNew"),
  };

  // A guess is accepted if it is in either list, but only WORDS count toward
  // the puzzle - see build_dict.py for how the two are split.
  const TARGETS = new Set(WORDS);
  const EXTRAS = new Set(BONUS);
  const isWord = (w) => TARGETS.has(w) || EXTRAS.has(w);
  const CUSTOM_HINT = "A real word, 5\u201320 letters.";

  let state = null;
  let minLen = 3;

  /* ---------- letters ---------- */

  // "animal" -> {a:2, n:1, i:1, m:1, l:1}
  function tally(word) {
    const counts = {};
    for (const ch of word) counts[ch] = (counts[ch] || 0) + 1;
    return counts;
  }

  function canBuild(word, pool) {
    const need = tally(word);
    for (const ch in need) if ((pool[ch] || 0) < need[ch]) return false;
    return true;
  }

  /* ---------- puzzle setup ---------- */

  function answersFor(word, min) {
    const pool = tally(word);
    const found = [];
    for (const w of WORDS) {
      if (w.length < min || w.length > word.length || w === word) continue;
      if (canBuild(w, pool)) found.push(w);
    }
    // Longest first, then alphabetical - the order the results list uses.
    return found.sort((a, b) => b.length - a.length || a.localeCompare(b));
  }

  function pickWord(length) {
    const pool = PUZZLES[String(length)];
    if (!pool || !pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function startGame(word) {
    state = {
      word,
      pool: tally(word),
      answers: answersFor(word, minLen),
      found: new Set(),
      bonus: new Set(),
      over: false,
    };

    clearCustom();
    el.setup.hidden = true;
    el.game.hidden = false;
    el.banner.hidden = true;
    el.giveUp.disabled = false;
    el.guess.disabled = false;
    el.guess.value = "";

    el.totalCount.textContent = state.answers.length;
    renderTiles();
    renderResults();
    update();
    say("Every letter can be used once per word.", "");
    el.guess.focus();
  }

  /* ---------- rendering ---------- */

  function renderTiles() {
    el.tiles.classList.toggle("dense", state.word.length > 12);
    el.tiles.innerHTML = "";
    for (const ch of state.word) {
      const div = document.createElement("div");
      div.className = "tile";
      div.textContent = ch;
      el.tiles.appendChild(div);
    }
    highlight(el.guess.value);
  }

  // Light up the tiles the typed letters would consume, so the player can see
  // what is left and whether they have overspent a letter.
  function highlight(text) {
    const left = Object.assign({}, state.pool);
    const nodes = el.tiles.children;
    const claimed = new Set();
    let overspent = false;

    for (const ch of text.toLowerCase()) {
      if (!(ch in left) || left[ch] === 0) { overspent = true; continue; }
      left[ch]--;
      for (let i = 0; i < nodes.length; i++) {
        if (!claimed.has(i) && state.word[i] === ch) { claimed.add(i); break; }
      }
    }

    for (let i = 0; i < nodes.length; i++) nodes[i].classList.toggle("used", claimed.has(i));
    el.guess.classList.toggle("reject", overspent && text.length > 0);
  }

  function update() {
    el.foundCount.textContent = state.found.size;
    const pct = state.answers.length ? (state.found.size / state.answers.length) * 100 : 0;
    el.progressBar.style.width = pct + "%";
  }

  function renderResults(freshWord) {
    const show = state.over
      ? state.answers
      : state.answers.filter((w) => state.found.has(w));

    el.results.innerHTML = "";

    const byLength = new Map();
    for (const w of show) {
      if (!byLength.has(w.length)) byLength.set(w.length, []);
      byLength.get(w.length).push(w);
    }

    for (const [len, words] of [...byLength].sort((a, b) => b[0] - a[0])) {
      const group = document.createElement("div");
      group.className = "group";

      const heading = document.createElement("h3");
      const mine = words.filter((w) => state.found.has(w)).length;
      heading.textContent = state.over
        ? `${len} letters - ${mine}/${words.length}`
        : `${len} letters`;
      group.appendChild(heading);

      const chips = document.createElement("div");
      chips.className = "chips";
      for (const w of words) {
        const chip = document.createElement("span");
        const got = state.found.has(w);
        chip.className = "chip " + (got ? "mine" : "missed") + (w === freshWord ? " fresh" : "");
        chip.textContent = w;
        chips.appendChild(chip);
      }
      group.appendChild(chips);
      el.results.appendChild(group);
    }

    renderBonus(freshWord);
  }

  // Bonus words are real but uncommon, so they sit apart from the words the
  // puzzle counts.
  function renderBonus(freshWord) {
    if (!state.bonus.size) return;

    const group = document.createElement("div");
    group.className = "group";

    const heading = document.createElement("h3");
    heading.textContent = `Bonus words - ${state.bonus.size}`;
    group.appendChild(heading);

    const chips = document.createElement("div");
    chips.className = "chips";
    const words = [...state.bonus].sort((a, b) => b.length - a.length || a.localeCompare(b));
    for (const w of words) {
      const chip = document.createElement("span");
      chip.className = "chip bonus" + (w === freshWord ? " fresh" : "");
      chip.textContent = w;
      chips.appendChild(chip);
    }
    group.appendChild(chips);
    el.results.appendChild(group);
  }

  function say(text, tone) {
    el.message.textContent = text || " ";
    el.message.className = "message " + (tone || "");
  }

  /* ---------- guessing ---------- */

  function submitGuess(raw) {
    if (state.over) return;
    const word = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
    if (!word) return;

    if (word.length < minLen) {
      say(`Words need at least ${minLen} letters.`, "bad");
    } else if (word === state.word) {
      say("That's the whole word - find the ones hiding inside it.", "bad");
    } else if (!canBuild(word, state.pool)) {
      say(`"${word}" needs letters that aren't there.`, "bad");
    } else if (state.found.has(word) || state.bonus.has(word)) {
      say(`Already found "${word}".`, "");
    } else if (!isWord(word)) {
      say(`"${word}" isn't in the dictionary.`, "bad");
    } else if (!TARGETS.has(word)) {
      state.bonus.add(word);
      renderResults(word);
      say(`"${word}" - bonus word! It doesn't count toward the total.`, "bonus");
    } else {
      state.found.add(word);
      update();
      renderResults(word);
      const left = state.answers.length - state.found.size;
      say(left === 0 ? "" : `"${word}" - ${left} to go.`, "good");
      if (left === 0) finish(true);
    }

    el.guess.value = "";
    highlight("");
    // stay in the box so the next guess can be typed straight away
    if (!state.over) el.guess.focus();
  }

  function finish(won) {
    state.over = true;
    el.guess.disabled = true;
    el.giveUp.disabled = true;
    renderResults();

    const missed = state.answers.length - state.found.size;
    const extra = state.bonus.size;
    el.bannerTitle.textContent = won ? "Perfect round!" : "Here's the full list";
    el.bannerText.textContent = (won
      ? `You found every one of the ${state.answers.length} words.`
      : `You found ${state.found.size} of ${state.answers.length}. ` +
        `${missed} word${missed === 1 ? "" : "s"} got away.`) +
      (extra ? ` Plus ${extra} bonus word${extra === 1 ? "" : "s"}.` : "");
    el.banner.hidden = false;
    el.banner.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearCustom() {
    el.customWord.value = "";
    el.customPanel.open = false;
    el.customHint.textContent = CUSTOM_HINT;
    el.customHint.style.color = "";
  }

  function backToSetup() {
    state = null;
    clearCustom();
    el.game.hidden = true;
    el.banner.hidden = true;
    el.setup.hidden = false;
  }

  /* ---------- wiring ---------- */

  el.length.addEventListener("input", () => { el.lengthOut.textContent = el.length.value; });

  el.minLen.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-min]");
    if (!btn) return;
    minLen = Number(btn.dataset.min);
    for (const b of el.minLen.children) b.classList.toggle("on", b === btn);
  });

  el.start.addEventListener("click", () => {
    const custom = el.customWord.value.trim().toLowerCase();
    let word;

    if (custom) {
      const problem = !/^[a-z]{5,20}$/.test(custom)
        ? "Letters only, 5 to 20 of them."
        : !isWord(custom)
          ? `"${custom}" isn't in the game's dictionary - try another word.`
          : null;
      if (problem) {
        el.customHint.textContent = problem;
        el.customHint.style.color = "var(--bad)";
        return;
      }
      word = custom;
    } else {
      word = pickWord(Number(el.length.value));
      if (!word) { say("No puzzle words at that length.", "bad"); return; }
    }

    startGame(word);
  });

  el.guessForm.addEventListener("submit", (e) => {
    e.preventDefault();
    submitGuess(el.guess.value);
  });

  // The tap that submits must not move focus - that would close the keyboard
  // between guesses. mousedown is where the focus change would happen, on a
  // phone as much as on a desktop.
  el.guessForm.querySelector("button[type=submit]")
    .addEventListener("mousedown", (e) => e.preventDefault());

  el.guess.addEventListener("input", () => highlight(el.guess.value));

  el.giveUp.addEventListener("click", () => {
    if (!state || state.over) return;
    finish(false);
  });

  el.newGame.addEventListener("click", backToSetup);
  el.bannerNew.addEventListener("click", backToSetup);

  // Typing anywhere on the page should land in the guess box.
  document.addEventListener("keydown", (e) => {
    if (el.game.hidden || state?.over) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.activeElement !== el.guess && /^[a-zA-Z]$/.test(e.key)) el.guess.focus();
  });

  el.lengthOut.textContent = el.length.value;

  /* ---------- phone: hold the page still and dock the box to the keyboard ----------

     On a phone the page has no scroll of its own (see style.css), so the browser
     cannot scroll it to reveal the focused input - the jump. The shell is sized
     to the visual viewport instead, which is exactly the room left above the
     keyboard, and the guess box is pinned to the bottom of it. */

  const app = document.querySelector(".app");
  const vv = window.visualViewport;
  const phone = window.matchMedia("(max-width: 720px) and (min-height: 501px)");

  function syncViewport() {
    if (!phone.matches) {
      app.style.removeProperty("--vh");
      app.style.removeProperty("--vtop");
      document.body.classList.remove("kb");
      return;
    }

    const h = vv ? vv.height : window.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    // Chrome shrinks the visual viewport for the keyboard but leaves the layout
    // viewport alone, so what is missing from the bottom is the keyboard.
    const keyboard = vv ? Math.max(0, window.innerHeight - (h + top)) : 0;

    app.style.setProperty("--vh", h + "px");
    app.style.setProperty("--vtop", top + "px");
    document.body.classList.toggle("kb", keyboard > 100);

    // Belt and braces for browsers that scroll the window anyway: put it back
    // in the same frame, before anything is painted out of place.
    if (window.scrollY || top) window.scrollTo(0, 0);
  }

  if (vv) {
    vv.addEventListener("resize", syncViewport);
    vv.addEventListener("scroll", syncViewport);
  }
  window.addEventListener("resize", syncViewport);
  window.addEventListener("orientationchange", () => setTimeout(syncViewport, 250));
  phone.addEventListener("change", syncViewport);
  syncViewport();
})();
