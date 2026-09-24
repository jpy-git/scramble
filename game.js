/* Scramble - game logic.
   Depends on WORDS (target words), BONUS (every other accepted word), PUZZLES
   (starting words by length) and PUZZLE_COUNTS / MIN_LENS (each starting word's
   target count per "shortest word" setting) from words.js, and DEFS
   (definitions) from defs.js once that has loaded - see loadDefs. */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const el = {
    setup: $("setup"), game: $("game"), banner: $("banner"),
    length: $("length"), lengthOut: $("lengthOut"), minLen: $("minLen"),
    customWord: $("customWord"), customHint: $("customHint"),
    customPanel: $("customPanel"), start: $("start"),
    spreadRead: $("spreadRead"), spreadChart: $("spreadChart"), spreadTable: $("spreadTable"),
    tiles: $("tiles"),
    foundCount: $("foundCount"), totalCount: $("totalCount"),
    progressBar: $("progressBar"),
    guessForm: $("guessForm"), guess: $("guess"), message: $("message"),
    results: $("results"), giveUp: $("giveUp"), newGame: $("newGame"),
    bannerTitle: $("bannerTitle"), bannerText: $("bannerText"), bannerNew: $("bannerNew"),
    defBox: $("defBox"), defWord: $("defWord"), defBody: $("defBody"), defClose: $("defClose"),
  };

  // A guess is accepted if it is in either list, but only WORDS count toward
  // the puzzle - see build_dict.py for how the two are split.
  const TARGETS = new Set(WORDS);
  const EXTRAS = new Set(BONUS);
  const isWord = (w) => TARGETS.has(w) || EXTRAS.has(w);
  const CUSTOM_HINT = "A real word, 5\u201320 letters.";

  let state = null;
  let minLen = 4;

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
        const chip = document.createElement("button");
        chip.type = "button";
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
      const chip = document.createElement("button");
      chip.type = "button";
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

  /* ---------- setup: how many words a round will have ---------- */

  const SVG = "http://www.w3.org/2000/svg";
  const CHART = { height: 110, axis: 22, top: 18, bins: 20 };

  function svg(tag, attrs, parent) {
    const node = document.createElementNS(SVG, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function percentile(sorted, p) {
    return sorted[Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1)))];
  }

  // 1, 2, 5, 10, 20, 50... - the smallest step that fits `span` into `bins` bins.
  function niceStep(span, bins) {
    const raw = Math.max(1, span / bins);
    const mag = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  }

  // Precomputed at build time: computing it here would mean hundreds of
  // milliseconds of dictionary scans on every slider tick.
  function roundSizes(length, min) {
    const counts = PUZZLE_COUNTS[String(length)] || [];
    const i = MIN_LENS.indexOf(min);
    return counts.map((c) => c[i]).sort((a, b) => a - b);
  }

  const fmt = (n) => n.toLocaleString();
  const rangeText = (b, step) => (step === 1 ? fmt(b.from) : `${fmt(b.from)}\u2013${fmt(b.to)}`);

  function renderSpread() {
    const sizes = roundSizes(Number(el.length.value), minLen);
    el.spreadChart.innerHTML = "";
    el.spreadTable.innerHTML = "";
    el.spreadRead.innerHTML = "";
    if (!sizes.length) return;

    const p10 = percentile(sizes, 0.1), p50 = percentile(sizes, 0.5), p90 = percentile(sizes, 0.9);
    const lo = sizes[0], hi = sizes[sizes.length - 1];

    const typical = document.createElement("strong");
    typical.textContent = `${fmt(p50)} words`;
    el.spreadRead.append("Median ", typical, `. 80% of rounds: ${fmt(p10)}\u2013${fmt(p90)} words.`);
    if (sizes.length < 20) el.spreadRead.append(` Only ${sizes.length} starting words at this length.`);

    // Bin the counts.
    const step = niceStep(hi - lo, CHART.bins);
    const start = Math.floor(lo / step) * step;
    const bins = [];
    for (let from = start; from <= hi; from += step) bins.push({ from, to: from + step - 1, n: 0 });
    for (const s of sizes) bins[Math.floor((s - start) / step)].n++;
    const most = Math.max(...bins.map((b) => b.n));

    // Geometry.
    const width = Math.max(240, el.spreadChart.clientWidth || 300);
    const span = step * bins.length;
    const slot = width / bins.length;
    const barW = Math.min(24, slot - 2);
    const base = CHART.top + CHART.height;
    const x = (v) => ((v - start) / span) * width;
    const y = (n) => base - (n / most) * CHART.height;

    const root = svg("svg", { viewBox: `0 0 ${width} ${base + CHART.axis}`, height: base + CHART.axis,
                              "aria-hidden": "true" });

    // The middle 80% of rounds, behind the bars.
    svg("rect", { class: "band", x: x(p10), y: CHART.top, height: CHART.height,
                  width: Math.max(2, x(p90 + 1) - x(p10)) }, root);

    const tip = document.createElement("div");
    tip.className = "spread-tip";
    tip.hidden = true;

    bins.forEach((b, i) => {
      const cx = i * slot + slot / 2;
      // The hit area is the whole column, not just the painted bar.
      const hit = svg("rect", { class: "hit", x: i * slot, y: CHART.top, width: slot, height: CHART.height }, root);
      let bar = null;
      if (b.n) {
        const top = y(b.n), left = cx - barW / 2, r = Math.min(4, base - top, barW / 2);
        // 4px rounded data-end, square at the baseline.
        bar = svg("path", {
          class: "bar",
          d: `M${left},${base}V${top + r}Q${left},${top} ${left + r},${top}` +
             `H${left + barW - r}Q${left + barW},${top} ${left + barW},${top + r}V${base}Z`,
        }, root);
      }
      hit.addEventListener("pointerenter", () => {
        const n = document.createElement("strong");
        n.textContent = `${b.n} starting word${b.n === 1 ? "" : "s"}`;
        tip.replaceChildren(n, `${rangeText(b, step)} words to find`);
        tip.style.left = `${(cx / width) * 100}%`;
        tip.style.top = `${y(b.n) - 6}px`;
        tip.hidden = false;
        bar?.classList.add("on");
      });
      hit.addEventListener("pointerleave", () => {
        tip.hidden = true;
        bar?.classList.remove("on");
      });
    });

    // Median line, labelled.
    const mx = x(p50 + 0.5);
    svg("line", { class: "median", x1: mx, x2: mx, y1: CHART.top - 4, y2: base }, root);
    const label = svg("text", { class: "median-label", x: mx, y: CHART.top - 8, "text-anchor": "middle" }, root);
    label.textContent = `median ${fmt(p50)}`;

    // Baseline and x ticks.
    svg("line", { class: "axis", x1: 0, x2: width, y1: base + 0.5, y2: base + 0.5 }, root);
    const tickStep = niceStep(span, 4);
    for (let v = Math.ceil(start / tickStep) * tickStep; v <= start + span; v += tickStep) {
      // Pull the end labels inside the chart rather than let them clip.
      const px = x(v);
      const anchor = px < 16 ? "start" : px > width - 16 ? "end" : "middle";
      const t = svg("text", { x: px, y: base + 16, "text-anchor": anchor }, root);
      t.textContent = fmt(v);
    }

    el.spreadChart.append(root, tip);

    // The same numbers for screen readers.
    el.spreadTable.createCaption().textContent =
      `Words to find per round: median ${p50}, 80% of rounds ${p10} to ${p90}.`;
    const head = el.spreadTable.insertRow();
    for (const h of ["Words to find", "Starting words"]) {
      const th = document.createElement("th");
      th.textContent = h;
      head.appendChild(th);
    }
    for (const b of bins) {
      const row = el.spreadTable.insertRow();
      row.insertCell().textContent = rangeText(b, step);
      row.insertCell().textContent = b.n;
    }
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
    el.bannerTitle.textContent = won ? "Perfect round! \u{1F373}" : "Here's the full list";
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
    renderSpread(); // the width may have changed while the setup screen was hidden
  }

  /* ---------- definitions ---------- */

  // defs.js is several megabytes, so it is fetched once the page is up rather
  // than holding up the first puzzle. DEFS doesn't exist until it arrives.
  let defs = "loading";

  function loadDefs() {
    const script = document.createElement("script");
    script.src = "defs.js";
    script.onload = () => { defs = "ready"; refreshDef(); };
    script.onerror = () => { defs = "failed"; refreshDef(); };
    document.body.appendChild(script);
  }

  // A tap that beat the download gets its answer as soon as there is one.
  function refreshDef() {
    if (el.defBox.open) showDef(el.defWord.textContent);
  }

  // hasOwn, not DEFS[word]: "constructor" is a word too.
  const entryFor = (word) =>
    defs === "ready" && Object.hasOwn(DEFS, word) ? DEFS[word] : null;

  function note(text) {
    const p = document.createElement("p");
    p.className = "def-note";
    p.textContent = text;
    return p;
  }

  function senseList(senses) {
    const list = document.createElement("ol");
    list.className = "def-senses";
    for (const [pos, gloss] of senses) {
      const li = document.createElement("li");
      const tag = document.createElement("span");
      tag.className = "def-pos";
      tag.textContent = pos;
      li.append(tag, " ", gloss);
      list.appendChild(li);
    }
    return list;
  }

  // "plural of sore", with sore's senses as that part of speech underneath (the
  // noun, not "hurting"). The base word is a link to its full entry.
  function formBlock([label, base, pos]) {
    const block = document.createElement("div");
    block.className = "def-form";
    const line = document.createElement("p");
    const link = document.createElement("button");
    link.type = "button";
    link.className = "def-link";
    link.textContent = base;
    line.append(label + " ", link);
    block.appendChild(line);
    const senses = (entryFor(base)?.[0] || []).filter((s) => s[0] === pos);
    if (senses.length) block.appendChild(senseList(senses.slice(0, 2)));
    return block;
  }

  function showDef(word) {
    el.defWord.textContent = word;
    const parts = [];

    if (defs === "loading") {
      parts.push(note("Looking it up…"));
    } else if (defs === "failed") {
      parts.push(note("Definitions couldn't be loaded."));
    } else {
      const entry = entryFor(word);
      if (!entry) {
        parts.push(note("No definition for this one."));
      } else {
        const [senses, forms = [], formsFirst] = entry;
        if (senses.length) parts.push(senseList(senses));
        parts.push(...forms.map(formBlock));
        if (formsFirst) parts.push(parts.shift());
      }
    }

    el.defBody.replaceChildren(...parts);
    if (!el.defBox.open) el.defBox.showModal();
    el.defBox.querySelector(".def-card").scrollTop = 0;
  }

  /* ---------- wiring ---------- */

  el.length.addEventListener("input", () => {
    el.lengthOut.textContent = el.length.value;
    renderSpread();
  });

  el.minLen.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-min]");
    if (!btn) return;
    minLen = Number(btn.dataset.min);
    for (const b of el.minLen.children) b.classList.toggle("on", b === btn);
    renderSpread();
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

  // Tap a found word for its definition.
  el.results.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) showDef(chip.textContent);
  });
  el.defBody.addEventListener("click", (e) => {
    const link = e.target.closest(".def-link");
    if (link) showDef(link.textContent);
  });
  el.defClose.addEventListener("click", () => el.defBox.close());
  // The card fills the dialog, so a click on the dialog itself is the backdrop.
  el.defBox.addEventListener("click", (e) => {
    if (e.target === el.defBox) el.defBox.close();
  });
  el.defBox.addEventListener("close", () => {
    if (!el.game.hidden && !state?.over) el.guess.focus();
  });

  if (document.readyState === "complete") loadDefs();
  else window.addEventListener("load", loadDefs);

  // Typing anywhere on the page should land in the guess box - closing a
  // definition on the way, if one is open.
  document.addEventListener("keydown", (e) => {
    if (el.game.hidden || state?.over) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (el.defBox.open && /^[a-zA-Z]$/.test(e.key)) el.defBox.close();
    if (document.activeElement !== el.guess && /^[a-zA-Z]$/.test(e.key)) el.guess.focus();
  });

  el.lengthOut.textContent = el.length.value;
  renderSpread();
  window.addEventListener("resize", () => { if (!el.setup.hidden) renderSpread(); });

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
