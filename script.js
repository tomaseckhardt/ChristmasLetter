"use strict";

/* ===== Konstanty ===== */
const KEYS = {
  draft: "dopis-jezisku:draft",
  sent: "dopis-jezisku:sent",
  sound: "dopis-jezisku:sound",
};
const MAX_WISHES = 10;
const PAPER = "#fffdf7";
const EMOJIS = [
  "🎁",
  "🪆",
  "🧱",
  "🚲",
  "📚",
  "🧸",
  "🖍️",
  "🎲",
  "⛸️",
  "🚗",
  "🛷",
  "🎸",
  "🐶",
  "🐱",
  "⚽",
  "🎮",
  "🧩",
  "🎨",
  "🚂",
  "🚀",
  "🦄",
  "🤖",
  "🎹",
  "👗",
  "🎧",
  "📱",
  "⌚",
  "🏀",
  "🎿",
  "🧶",
  "🔭",
  "🧪",
  "🍫",
  "🐴",
  "🦖",
  "❤️",
];
const DECOS = { hvezda: "⭐", stromecek: "🎄", snehulak: "⛄", zvonecek: "🔔" };

/* ===== Úložiště – vše v try/catch, bez něj stránka běží dál ===== */
const store = {
  get(k) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* plné nebo zakázané úložiště */
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* nic */
    }
  },
};

/* ===== Čeština ===== */
function czPlural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

function daysUntilChristmasEve(now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let eve = new Date(now.getFullYear(), 11, 24);
  if (today > eve) eve = new Date(now.getFullYear() + 1, 11, 24);
  return Math.round((eve - today) / 864e5); // round = odolné vůči změně času
}

function countdownText(now) {
  const d = daysUntilChristmasEve(now);
  if (d === 0) return "Dnes je Štědrý den! 🎄";
  return `Do Štědrého dne ${d >= 2 && d <= 4 ? "zbývají" : "zbývá"} ${d} ${czPlural(d, "den", "dny", "dní")}`;
}

// Rychlá samokontrola (tichá, pokud vše sedí)
console.assert(
  countdownText(new Date(2026, 11, 23)) === "Do Štědrého dne zbývá 1 den",
);
console.assert(
  countdownText(new Date(2026, 11, 21)) === "Do Štědrého dne zbývají 3 dny",
);
console.assert(
  countdownText(new Date(2026, 11, 19)) === "Do Štědrého dne zbývá 5 dní",
);
console.assert(
  countdownText(new Date(2026, 11, 24)) === "Dnes je Štědrý den! 🎄",
);
console.assert(daysUntilChristmasEve(new Date(2026, 11, 25)) === 364);

const formatDate = (d) =>
  d.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const signature = (l) =>
  l.name +
  (l.age ? `, ${l.age} ${czPlural(Number(l.age), "rok", "roky", "let")}` : "");
const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ===== Prvky ===== */
const $ = (s) => document.querySelector(s);
const form = $("#letter-form");
const nameIn = $("#name");
const ageIn = $("#age");
const wishIn = $("#wish-text");
const nameErr = $("#name-error");
const ageErr = $("#age-error");
const wishErr = $("#wish-error");
const pad = $("#pad");
const pctx = pad.getContext("2d");
const formView = $("#form-view");
const letterView = $("#letter-view");
const statusEl = $("#action-status");

const state = { wishes: [], hasDrawing: false, isPhoto: false, letter: null };

/* ===== Chybové hlášky ===== */
function showError(el, msg, input) {
  el.textContent = msg;
  el.hidden = false;
  if (input) input.setAttribute("aria-invalid", "true");
}
function clearError(el, input) {
  el.hidden = true;
  el.textContent = "";
  if (input) input.removeAttribute("aria-invalid");
}

/* ===== Přání ===== */
let pickedEmoji = EMOJIS[0];
let emojiLoading = null;

function loadEmojiData() {
  if (window.EMOJI_DATA) return Promise.resolve();
  emojiLoading =
    emojiLoading ||
    new Promise((resolve) => {
      const sc = document.createElement("script");
      sc.src = "emoji-data.js";
      sc.onload = resolve;
      sc.onerror = () => {
        emojiLoading = null;
        resolve();
      };
      document.head.append(sc);
    });
  return emojiLoading;
}

function emojiButton(e, label) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "emoji-btn";
  b.textContent = e;
  b.title = label || "";
  b.setAttribute("aria-label", label || e);
  b.setAttribute("aria-pressed", String(e === pickedEmoji));
  return b;
}

function updateChosen() {
  $("#emoji-chosen").textContent = pickedEmoji;
}

const normalize = (t) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// Emoji, které sedí na slova napsaná v přání (hledá se na začátku slov, bez diakritiky a koncovek)
function matchingEmoji(text) {
  const stems = [
    ...new Set(
      normalize(text)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3)
        .map((w) => (w.length > 4 ? w.slice(0, w.length - 2) : w)),
    ),
  ];
  if (!stems.length) return [];
  const scored = [];
  window.EMOJI_DATA.forEach((e) => {
    e.label = e.label || ` ${normalize(e[1])} `;
    e.search = e.search || ` ${normalize(e[2])}`;
    const n = stems.reduce(
      (sum, w) =>
        sum +
        (e.label.includes(` ${w} `)
          ? 5
          : e.label.includes(` ${w}`)
            ? 3
            : e.search.includes(` ${w}`)
              ? 1
              : 0),
      0,
    );
    if (n) scored.push([n, e]);
  });
  scored.sort((a, b) => b[0] - a[0]);
  // když něco sedí v názvu, slabší shody jen v klíčových slovech vynecháme
  const strong = scored.filter((x) => x[0] >= 3);
  return (strong.length ? strong : scored).map((x) => x[1]);
}

function renderEmojiPicker() {
  let items = window.EMOJI_DATA || EMOJIS.map((e) => [e, ""]);
  const hint = $("#emoji-hint");
  hint.hidden = true;
  if (window.EMOJI_DATA && wishIn.value.trim()) {
    const found = matchingEmoji(wishIn.value);
    if (found.length) {
      items = found;
      hint.textContent = "Ukazuju obrázky, které se hodí k tvému přání.";
      hint.hidden = false;
    } else {
      hint.textContent = "K tomuhle přání jsem nic nenašel, tady je všechno.";
      hint.hidden = false;
    }
  }
  const box = $("#emoji-picker");
  box.replaceChildren(...items.map((e) => emojiButton(e[0], e[1])));
  box.scrollTop = 0;
  updateChosen();
}
wishIn.addEventListener("input", renderEmojiPicker);

$("#emoji-picker").addEventListener("click", (ev) => {
  const b = ev.target.closest(".emoji-btn");
  if (!b) return;
  pickedEmoji = b.textContent;
  $("#emoji-picker")
    .querySelectorAll(".emoji-btn")
    .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  updateChosen();
});

function resetWishPanel() {
  wishIn.value = "";
  pickedEmoji = EMOJIS[0];
  $("#emoji-picker").scrollTop = 0;
  renderEmojiPicker();
}

function setWishPanel(open) {
  $("#wish-panel").hidden = !open;
  $("#open-wish").hidden = open;
  $("#open-wish").setAttribute("aria-expanded", String(open));
  if (open) {
    wishIn.focus();
    loadEmojiData().then(renderEmojiPicker);
  } else {
    $("#open-wish").focus();
  }
}
$("#open-wish").addEventListener("click", () => setWishPanel(true));
$("#cancel-wish").addEventListener("click", () => {
  resetWishPanel();
  clearError(wishErr, wishIn);
  setWishPanel(false);
});

function addWish(icon, text) {
  text = text.trim();
  if (!text) {
    showError(
      wishErr,
      "Napiš, co by sis přál/a, a pak klikni na „Přidat přání“ 🙂",
      wishIn,
    );
    return false;
  }
  if (state.wishes.length >= MAX_WISHES) {
    showError(
      wishErr,
      "Už máš 10 přání – víc se do dopisu nevejde. Když chceš něco jiného, nejdřív jedno přání smaž. 🎁",
    );
    return false;
  }
  state.wishes.push({ icon, text });
  clearError(wishErr, wishIn);
  renderWishes();
  saveDraft();
  return true;
}

function renderWishes() {
  const list = $("#wish-list");
  list.replaceChildren(
    ...state.wishes.map((w, idx) => {
      const li = document.createElement("li");
      const i = document.createElement("span");
      i.className = "icon";
      i.setAttribute("aria-hidden", "true");
      i.textContent = w.icon;
      const t = document.createElement("span");
      t.className = "text";
      t.textContent = w.text;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "remove";
      del.textContent = "✕";
      del.setAttribute("aria-label", `Smazat přání: ${w.text}`);
      del.addEventListener("click", () => {
        state.wishes.splice(idx, 1);
        clearError(wishErr, wishIn);
        renderWishes();
        saveDraft();
        ($("#wish-list .remove") || wishIn).focus();
      });
      li.append(i, t, del);
      return li;
    }),
  );
  $("#wish-count").textContent = state.wishes.length;
  $("#wish-empty").hidden = state.wishes.length > 0;
}

$("#add-wish").addEventListener("click", () => {
  if (addWish(pickedEmoji, wishIn.value)) {
    resetWishPanel();
    setWishPanel(false);
  }
});
wishIn.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("#add-wish").click();
  }
});

/* ===== Hlasové diktování (jen když ho prohlížeč umí) ===== */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SR) {
  document.querySelectorAll(".mic").forEach((btn) => {
    btn.hidden = false;
    btn.addEventListener("click", () => dictate(btn));
  });
}
function dictate(btn) {
  if (recognition) {
    recognition.stop();
    return;
  }
  const input = document.getElementById(btn.dataset.target);
  try {
    recognition = new SR();
  } catch {
    recognition = null;
    return;
  }
  recognition.lang = "cs-CZ";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  btn.classList.add("is-listening");
  btn.setAttribute("aria-pressed", "true");
  recognition.onresult = (e) => {
    const said = e.results[0][0].transcript.trim();
    if (!said) return;
    const joined =
      input.id === "name" || !input.value.trim()
        ? said
        : `${input.value.trimEnd()} ${said}`;
    input.value =
      input.maxLength > 0 ? joined.slice(0, input.maxLength) : joined;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  recognition.onerror = () => {
    /* odmítnutý mikrofon apod. – tiše ignorujeme */
  };
  recognition.onend = () => {
    btn.classList.remove("is-listening");
    btn.setAttribute("aria-pressed", "false");
    recognition = null;
  };
  try {
    recognition.start();
  } catch {
    recognition.onend();
  }
}

/* ===== Kreslení ===== */
const tool = { color: "#c62828", size: 6, eraser: false };

function clearPad() {
  pctx.fillStyle = PAPER;
  pctx.fillRect(0, 0, pad.width, pad.height);
  state.hasDrawing = false;
  state.isPhoto = false;
  updatePadView();
}

/* ===== Nakreslit / nahrát obrázek ===== */
let padMode = "draw";
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

function updatePadView() {
  const upload = padMode === "upload";
  $("#draw-toolbar").hidden = upload;
  $("#upload-panel").hidden = !upload;
  pad.hidden = upload && !state.hasDrawing;
  pad.classList.toggle("is-locked", upload);
  $("#photo-remove").hidden = !state.hasDrawing;
  $("#photo-empty").hidden = state.hasDrawing;
  pressOnly(".mode-btn", upload ? $("#mode-upload") : $("#mode-draw"));
}

function setPadMode(mode) {
  padMode = mode;
  updatePadView();
}
$("#mode-draw").addEventListener("click", () => setPadMode("draw"));
$("#mode-upload").addEventListener("click", () => setPadMode("upload"));

async function decodeImage(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* zkusíme klasicky */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

async function loadPhoto(file) {
  const err = $("#photo-error");
  clearError(err);
  if (!file) return;
  if (file.size > MAX_PHOTO_BYTES) {
    showError(
      err,
      "Ten obrázek je moc velký. Zkus menší nebo ho vyfoť znovu. 🙂",
    );
    return;
  }
  let img;
  try {
    img = await decodeImage(file);
  } catch {
    img = null;
  }
  if (!img) {
    showError(
      err,
      "Tenhle soubor nejde otevřít. Zkus obrázek ve formátu JPG nebo PNG. 🙂",
    );
    return;
  }
  const w = img.width;
  const h = img.height;
  const s = Math.min(pad.width / w, pad.height / h);
  clearPad();
  pctx.drawImage(
    img,
    (pad.width - w * s) / 2,
    (pad.height - h * s) / 2,
    w * s,
    h * s,
  );
  if (img.close) img.close();
  state.hasDrawing = true;
  state.isPhoto = true;
  updatePadView();
  saveDraft();
}
$("#photo-file").addEventListener("change", (e) => {
  loadPhoto(e.target.files[0]);
  e.target.value = "";
});
$("#photo-remove").addEventListener("click", () => {
  clearPad();
  clearError($("#photo-error"));
  saveDraft();
  $("#photo-file").focus();
});

function pressOnly(selector, btn) {
  document
    .querySelectorAll(selector)
    .forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
}

document.querySelectorAll(".swatch").forEach((b) =>
  b.addEventListener("click", () => {
    tool.color = b.dataset.color;
    tool.eraser = false;
    $("#eraser").setAttribute("aria-pressed", "false");
    pressOnly(".swatch", b);
  }),
);
document.querySelectorAll(".size-btn").forEach((b) =>
  b.addEventListener("click", () => {
    tool.size = Number(b.dataset.size);
    pressOnly(".size-btn", b);
  }),
);
$("#eraser").addEventListener("click", (e) => {
  tool.eraser = !tool.eraser;
  e.currentTarget.setAttribute("aria-pressed", String(tool.eraser));
});
$("#clear-pad").addEventListener("click", () => {
  clearPad();
  saveDraft();
});

let drawing = false;
let last = null;
function padPos(e) {
  const r = pad.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (pad.width / r.width),
    y: (e.clientY - r.top) * (pad.height / r.height),
  };
}
function strokeLine(a, b) {
  pctx.strokeStyle = tool.eraser ? PAPER : tool.color;
  pctx.lineWidth = tool.eraser ? tool.size * 2.5 : tool.size;
  pctx.lineCap = "round";
  pctx.lineJoin = "round";
  pctx.beginPath();
  pctx.moveTo(a.x, a.y);
  pctx.lineTo(b.x, b.y);
  pctx.stroke();
}
pad.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  pad.setPointerCapture(e.pointerId);
  drawing = true;
  last = padPos(e);
  strokeLine(last, { x: last.x + 0.01, y: last.y });
  state.hasDrawing = true;
});
pad.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  e.preventDefault();
  const p = padPos(e);
  strokeLine(last, p);
  last = p;
});
const endStroke = () => {
  if (drawing) {
    drawing = false;
    saveDraft();
  }
};
pad.addEventListener("pointerup", endStroke);
pad.addEventListener("pointercancel", endStroke);
// Pojistka pro starší mobilní Safari – prst na plátně nikdy neposouvá stránku
pad.addEventListener("touchmove", (e) => e.preventDefault(), {
  passive: false,
});

/* ===== Rozepsaný dopis ===== */
let saveTimer = 0;
function collect() {
  return {
    name: nameIn.value.trim(),
    age: ageIn.value,
    wishes: state.wishes,
    deco: form.elements.deco.value || "hvezda",
    drawing: !state.hasDrawing
      ? null
      : state.isPhoto
        ? pad.toDataURL("image/jpeg", 0.85)
        : pad.toDataURL("image/png"),
  };
}
function saveDraft() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set(KEYS.draft, collect()), 300);
}
form.addEventListener("input", saveDraft);
form.addEventListener("change", saveDraft);

function cleanWishes(list) {
  return Array.isArray(list)
    ? list
        .filter((w) => w && typeof w.text === "string" && w.text.trim())
        .slice(0, MAX_WISHES)
        .map((w) => ({
          icon: typeof w.icon === "string" ? w.icon : "🎁",
          text: w.text,
        }))
    : [];
}

function restoreDraft(d) {
  nameIn.value = typeof d.name === "string" ? d.name : "";
  ageIn.value = d.age || "";
  state.wishes = cleanWishes(d.wishes);
  if (DECOS[d.deco]) form.elements.deco.value = d.deco;
  if (typeof d.drawing === "string" && d.drawing.startsWith("data:image/")) {
    const img = new Image();
    img.onload = () => {
      pctx.drawImage(img, 0, 0, pad.width, pad.height);
      state.hasDrawing = true;
      state.isPhoto = d.drawing.startsWith("data:image/jpeg");
      updatePadView();
    };
    img.src = d.drawing;
  }
}

/* ===== Zvoneček (Web Audio, žádný soubor) ===== */
let soundOn = store.get(KEYS.sound) !== false;
let audioCtx = null;

function updateSoundBtn() {
  const btn = $("#sound-toggle");
  btn.setAttribute("aria-pressed", String(soundOn));
  $("#sound-icon").textContent = soundOn ? "🔔" : "🔕";
  $("#sound-label").textContent = soundOn ? "Zvuk zapnutý" : "Zvuk vypnutý";
}
$("#sound-toggle").addEventListener("click", () => {
  soundOn = !soundOn;
  store.set(KEYS.sound, soundOn);
  updateSoundBtn();
  if (soundOn) chime();
});

function ring(freq, t) {
  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
  master.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  master.connect(audioCtx.destination);
  // Neharmonické alikvóty dělají z tónu zvoneček
  [
    [1, 1],
    [2.76, 0.4],
    [5.4, 0.12],
  ].forEach(([mult, vol]) => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    g.gain.value = vol;
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 1.7);
  });
}
function chime() {
  if (!soundOn) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const now = audioCtx.currentTime + 0.05;
    [
      [1318.5, 0],
      [1760, 0.16],
      [2093, 0.32],
      [1760, 0.62],
    ].forEach(([f, at]) => ring(f, now + at));
  } catch {
    /* zvuk není nutný */
  }
}

/* ===== Odeslání ===== */
form.addEventListener("submit", (e) => {
  e.preventDefault();
  [
    [nameErr, nameIn],
    [ageErr, ageIn],
    [wishErr, wishIn],
  ].forEach(([el, inp]) => clearError(el, inp));
  let firstBad = null;

  if (!nameIn.value.trim()) {
    showError(nameErr, "Ještě nám chybí tvoje jméno ✨", nameIn);
    firstBad = firstBad || nameIn;
  }
  if (ageIn.value !== "" || ageIn.validity.badInput) {
    const n = Number(ageIn.value);
    if (!Number.isInteger(n) || n < 1 || n > 99) {
      showError(
        ageErr,
        "Věk napiš číslem od 1 do 99 – nebo ho klidně nech prázdný 🎈",
        ageIn,
      );
      firstBad = firstBad || ageIn;
    }
  }
  if (state.wishes.length === 0) {
    showError(
      wishErr,
      "Přidej aspoň jedno přání – klikni na plus a napiš ho 🎁",
    );
    firstBad = firstBad || (!$("#open-wish").hidden ? $("#open-wish") : wishIn);
  }
  if (firstBad) {
    firstBad.focus();
    return;
  }

  clearTimeout(saveTimer);
  const letter = { ...collect(), date: new Date().toISOString() };
  store.set(KEYS.draft, letter);
  store.set(KEYS.sent, letter);
  chime();
  renderLetter(letter);
  playTransition(() => showView("letter", true));
});

function showView(which, focus) {
  formView.hidden = which !== "form";
  letterView.hidden = which !== "letter";
  if (!focus) return;
  window.scrollTo(0, 0);
  (which === "letter" ? $("#letter-title") : nameIn).focus({
    preventScroll: true,
  });
}

/* ===== Kouzelný přechod (max 4 s, přeskočitelný) ===== */
function playTransition(done) {
  if (reducedMotion()) {
    done();
    return;
  }
  const ov = $("#transition");
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    ov.hidden = true;
    ov.classList.remove("play");
    document.body.classList.remove("no-scroll");
    done();
  };
  ov.hidden = false;
  ov.classList.remove("play");
  void ov.offsetWidth; // restart animací
  ov.classList.add("play");
  document.body.classList.add("no-scroll");
  $("#skip-anim").focus();
  ov.onclick = finish;
  ov.onkeydown = (e) => {
    if (e.key === "Escape") finish();
  };
  const timer = setTimeout(finish, 3750);
}

/* ===== Vykreslení dopisu ===== */
function plainText(l) {
  return [
    "Milý Ježíšku,",
    "",
    "moc by mě potěšilo:",
    ...l.wishes.map((w) => `- ${w.text}`),
    "",
    "S láskou",
    signature(l),
    formatDate(new Date(l.date)),
  ].join("\n");
}

function renderLetter(l) {
  state.letter = l;
  $("#countdown").textContent = countdownText(new Date());
  $("#letter-deco").textContent = DECOS[l.deco] || DECOS.hvezda;
  $("#letter-wishes").replaceChildren(
    ...l.wishes.map((w) => {
      const li = document.createElement("li");
      const i = document.createElement("span");
      i.className = "icon";
      i.setAttribute("aria-hidden", "true");
      i.textContent = w.icon;
      const t = document.createElement("span");
      t.textContent = w.text;
      li.append(i, t);
      return li;
    }),
  );
  const hasImg =
    typeof l.drawing === "string" && l.drawing.startsWith("data:image/");
  $("#letter-drawing-wrap").hidden = !hasImg;
  if (hasImg) $("#letter-drawing").src = l.drawing;
  else $("#letter-drawing").removeAttribute("src");
  $("#letter-name").textContent = signature(l);
  $("#letter-date").textContent = formatDate(new Date(l.date));
  statusEl.textContent = "";
}

/* ===== Akce ===== */
$("#print-btn").addEventListener("click", () => window.print());

/* ===== Odkaz a sdílení ===== */
const b64 = {
  enc(bytes) {
    let s = "";
    bytes.forEach((b) => {
      s += String.fromCharCode(b);
    });
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(str) {
    const s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};
async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

async function smallDrawing(l) {
  if (!l.drawing) return null;
  try {
    const img = await loadImage(l.drawing);
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 200;
    const x = c.getContext("2d");
    x.fillStyle = PAPER;
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0, c.width, c.height);
    let url = c.toDataURL("image/webp", 0.6);
    if (!url.startsWith("data:image/webp"))
      url = c.toDataURL("image/jpeg", 0.6);
    const mime = url.slice(5, url.indexOf(";"));
    const bin = atob(url.slice(url.indexOf(",") + 1));
    return { mime, bytes: Uint8Array.from(bin, (ch) => ch.charCodeAt(0)) };
  } catch {
    return null;
  }
}

async function letterLink(l) {
  const pic = await smallDrawing(l);
  const head = new TextEncoder().encode(
    JSON.stringify({
      n: l.name,
      a: l.age,
      d: l.deco,
      t: l.date,
      m: pic ? pic.mime : null,
      w: l.wishes.map((w) => [w.icon, w.text]),
    }),
  );
  const body = pic ? pic.bytes : new Uint8Array(0);
  const raw = new Uint8Array(2 + head.length + body.length);
  raw[0] = head.length >> 8;
  raw[1] = head.length & 255;
  raw.set(head, 2);
  raw.set(body, 2 + head.length);
  let code = "r" + b64.enc(raw);
  if (typeof CompressionStream === "function") {
    try {
      code =
        "z" + b64.enc(await pipe(raw, new CompressionStream("deflate-raw")));
    } catch {
      /* bez komprese */
    }
  }
  return `${location.origin}${location.pathname}#d=${code}`;
}

async function parseLink(hash) {
  const m = /^#d=([zr])([\w-]+)$/.exec(hash);
  if (!m) return null;
  try {
    let bytes = b64.dec(m[2]);
    if (m[1] === "z")
      bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    const len = (bytes[0] << 8) | bytes[1];
    const o = JSON.parse(new TextDecoder().decode(bytes.subarray(2, 2 + len)));
    const date = new Date(o.t);
    let drawing = null;
    if (
      (o.m === "image/webp" || o.m === "image/jpeg") &&
      bytes.length > 2 + len
    ) {
      const std = b64
        .enc(bytes.subarray(2 + len))
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      drawing = `data:${o.m};base64,${std}`;
    }
    return {
      name: String(o.n || "").slice(0, 60),
      age: o.a,
      deco: typeof o.d === "string" ? o.d : "hvezda",
      date: isNaN(date) ? new Date().toISOString() : date.toISOString(),
      wishes: cleanWishes((o.w || []).map(([icon, text]) => ({ icon, text }))),
      drawing,
    };
  } catch {
    return null;
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.className = "visually-hidden";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

$("#link-btn").addEventListener("click", async () => {
  const link = await letterLink(state.letter);
  statusEl.textContent = (await copyToClipboard(link))
    ? "Odkaz je zkopírovaný ✔ Stačí ho vložit do zprávy."
    : "Kopírování se nepovedlo.";
});

const canShare =
  typeof navigator.share === "function" &&
  matchMedia("(pointer: coarse)").matches;
$("#share-btn").hidden = !canShare;

$("#share-btn").addEventListener("click", async () => {
  const l = state.letter;
  const link = await letterLink(l);
  try {
    const blob = await makePngBlob(l);
    const file =
      blob &&
      new File([blob], `dopis-jezisku-${fileSlug(l.name)}.png`, {
        type: "image/png",
      });
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "Dopis Ježíškovi",
        files: [file],
        text: link,
      });
    } else {
      await navigator.share({
        title: "Dopis Ježíškovi",
        text: "Dopis Ježíškovi",
        url: link,
      });
    }
  } catch (err) {
    if (err && err.name !== "AbortError")
      statusEl.textContent = "Sdílení se nepovedlo – zkus „Zkopírovat odkaz“.";
  }
});

$("#png-btn").addEventListener("click", downloadPng);

const dialog = $("#confirm-dialog");
$("#new-btn").addEventListener("click", () => {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else if (
    window.confirm("Napsat nový dopis? Tenhle dopis i obrázek se smažou.")
  )
    resetAll();
});
dialog.addEventListener("close", () => {
  if (dialog.returnValue === "ok") resetAll();
  else $("#new-btn").focus();
});

function resetAll() {
  clearTimeout(saveTimer);
  store.del(KEYS.draft);
  store.del(KEYS.sent);
  form.reset();
  state.wishes = [];
  state.letter = null;
  renderWishes();
  clearPad();
  clearError($("#photo-error"));
  setPadMode("draw");
  [
    [nameErr, nameIn],
    [ageErr, ageIn],
    [wishErr, wishIn],
  ].forEach(([el, inp]) => clearError(el, inp));
  showView("form", true);
}

/* ===== PNG – vlastní vykreslení na canvas ===== */
function wrapText(ctx, text, maxW) {
  const lines = [];
  let line = "";
  text
    .split(/\s+/)
    .filter(Boolean)
    .forEach((word) => {
      // Hodně dlouhé slovo rozdělíme po písmenech
      while (ctx.measureText(word).width > maxW) {
        let cut = word.length - 1;
        while (cut > 1 && ctx.measureText(word.slice(0, cut)).width > maxW)
          cut--;
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else line = test;
    });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

// draw=false jen změří výšku, draw=true kreslí
function layoutLetter(ctx, l, img, W, draw) {
  const P = 110;
  const inner = W - 2 * P;
  const H = ctx.canvas.height;
  const ink = "#2b2118";
  const wine = "#8c1c2b";
  let y = P;

  if (draw) {
    ctx.fillStyle = "#fbf5e6";
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(
      W * 0.15,
      H * 0.08,
      0,
      W * 0.15,
      H * 0.08,
      W * 0.6,
    );
    glow.addColorStop(0, "rgba(255,255,255,0.7)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(70,110,170,0.14)";
    ctx.lineWidth = 2;
    for (let ly = 170; ly < H - 40; ly += 62) {
      ctx.beginPath();
      ctx.moveTo(30, ly);
      ctx.lineTo(W - 30, ly);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(140,28,43,0.35)";
    ctx.beginPath();
    ctx.moveTo(P - 34, 20);
    ctx.lineTo(P - 34, H - 20);
    ctx.stroke();
    ctx.strokeStyle = "#d9c9a3";
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.save();
    ctx.translate(W - 110, 110);
    ctx.rotate(0.2);
    ctx.font = "110px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(DECOS[l.deco] || DECOS.hvezda, 0, 0);
    ctx.restore();
    ctx.textBaseline = "alphabetic";
  }

  const text = (str, font, color, x, lh, align = "left") => {
    ctx.font = font;
    wrapText(
      ctx,
      str,
      inner - (x - P) - (align === "left" && y < 220 ? 120 : 0),
    ).forEach((line) => {
      if (draw) {
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.fillText(line, align === "right" ? W - P : x, y + lh * 0.78);
      }
      y += lh;
    });
  };

  text("DOPIS JEŽÍŠKOVI", "700 34px Fraunces, Georgia, serif", wine, P, 56);
  y += 10;
  text("Milý Ježíšku,", "700 84px Caveat, cursive", ink, P, 100);
  text("moc by mě potěšilo:", "400 56px Caveat, cursive", ink, P, 70);
  l.wishes.forEach((w) => {
    if (draw) {
      ctx.font = "44px serif";
      ctx.textAlign = "left";
      ctx.fillText(w.icon, P, y + 54);
    }
    text(w.text, "400 58px Caveat, cursive", ink, P + 74, 68);
  });
  if (img) {
    y += 30;
    const s = Math.min(inner / img.width, 560 / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    const x = P + (inner - dw) / 2;
    if (draw) {
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(80,50,20,0.25)";
      ctx.shadowBlur = 24;
      ctx.fillRect(x - 12, y - 12, dw + 24, dh + 24);
      ctx.shadowColor = "transparent";
      ctx.drawImage(img, x, y, dw, dh);
    }
    y += dh + 40;
  }
  y += 20;
  text("S láskou", "400 56px Caveat, cursive", ink, P, 66);
  text(signature(l), "700 70px Caveat, cursive", wine, P, 82);
  y += 10;
  text(
    formatDate(new Date(l.date)),
    "400 32px Fraunces, Georgia, serif",
    "#5d5145",
    P,
    48,
    "right",
  );
  return Math.ceil(y + P);
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function fileSlug(name) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "dopis"
  );
}

async function makePngBlob(l) {
  try {
    await Promise.all(
      [
        "400 56px Caveat",
        "700 84px Caveat",
        "700 34px Fraunces",
        "400 32px Fraunces",
      ].map((f) => document.fonts.load(f, "Žluťoučký kůň")),
    );
  } catch {
    /* písma offline – použije se náhradní */
  }
  const img = l.drawing ? await loadImage(l.drawing) : null;
  const W = 1240;
  const measure = document.createElement("canvas").getContext("2d");
  const c = document.createElement("canvas");
  c.width = W;
  c.height = layoutLetter(measure, l, img, W, false);
  layoutLetter(c.getContext("2d"), l, img, W, true);
  return new Promise((resolve) => c.toBlob(resolve, "image/png"));
}

async function downloadPng() {
  const l = state.letter;
  if (!l) return;
  statusEl.textContent = "Připravuji obrázek…";
  const blob = await makePngBlob(l);
  if (!blob) {
    statusEl.textContent = "Obrázek se nepovedlo vytvořit.";
    return;
  }
  {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dopis-jezisku-${fileSlug(l.name)}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    statusEl.textContent = "Obrázek dopisu je stažený ✔";
  }
}

/* ===== Start ===== */
renderEmojiPicker();
clearPad();
updateSoundBtn();
const draft = store.get(KEYS.draft);
if (draft) restoreDraft(draft);
renderWishes();
const sent = store.get(KEYS.sent);
(async () => {
  const shared = await parseLink(location.hash);
  if (shared && shared.name) {
    renderLetter(shared);
    showView("letter", false);
    $("#new-btn").lastChild.textContent = " Napsat vlastní dopis";
    $("#new-btn").addEventListener(
      "click",
      (e) => {
        e.stopImmediatePropagation();
        history.replaceState(null, "", location.pathname);
        location.reload();
      },
      true,
    );
  }
})();
if (sent && typeof sent.name === "string" && sent.name) {
  sent.wishes = cleanWishes(sent.wishes);
  renderLetter(sent);
  showView("letter", false);
} else {
  showView("form", false);
}
