// ================= CONFIG =================
const DATA_FILE = "species_list.json";

// ================= STATE =================
let species = [];
let current = null;

let correctCount = 0;
let wrongCount = 0;

let SCI_KEY = null;
let COMMON_KEY = null;
let TYPE_KEY = null;

let questionToken = 0;

// Hint state (flashcard style)
let commonHintEnabled = false;
let commonRevealed = false;

let scientificHintEnabled = false;
let scientificRevealed = false;

// Filter state
let filteredSpecies = [];

// ================= HELPERS =================
function slugifyKey(key) {
  return String(key).replace(/[^A-Za-z0-9_-]/g, "_");
}
function normalizeAnswer(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}
function getKeysInOrder() {
  if (!species.length) return [];
  return Object.keys(species[0]);
}
function detectKeyLike(...needles) {
  const keys = getKeysInOrder();
  for (const k of keys) {
    const lk = k.toLowerCase();
    if (needles.every(n => lk.includes(n))) return k;
  }
  return null;
}
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function setNextEnabled(val) {
  const btn = document.getElementById("nextBtn");
  if (btn) btn.disabled = !val;
}
function updateScore() {
  const scoreEl = document.getElementById("score");
  if (!scoreEl) return;
  scoreEl.innerHTML = `Correct: ${correctCount} | Wrong: ${wrongCount}`;
}
function cleanScientificName(raw) {
  if (!raw) return "";
  let s = String(raw).trim().replace(/\s+/g, " ");
  s = s.replace(/\s*\(.*?\)\s*$/g, "");
  s = s.replace(/\s+[A-Z][a-z]+,?\s+\d{4}\s*$/g, "");
  s = s.replace(/\s+\d{4}\s*$/g, "");
  const parts = s.split(" ").filter(Boolean);
  if (parts.length >= 2) s = parts[0] + " " + parts[1];
  return s.trim();
}

// ================= FILTERS =================
function normTypeValue(v) {
  return String(v ?? "").trim().toLowerCase();
}
function getActiveTypeFilters() {
  const bird = document.getElementById("filterBird")?.checked;
  const mammal = document.getElementById("filterMammal")?.checked;
  const reptile = document.getElementById("filterReptile")?.checked;

  const active = new Set();
  if (bird) active.add("bird");
  if (mammal) active.add("mammal");
  if (reptile) active.add("reptile");
  return active;
}
function computeFilteredSpecies() {
  const status = document.getElementById("filterStatus");
  const active = getActiveTypeFilters();

  if (active.size === 0) {
    filteredSpecies = [];
    if (status) status.textContent = "No filters selected — check at least one (Bird/Mammal/Reptile).";
    return;
  }

  if (!TYPE_KEY) {
    filteredSpecies = [...species];
    if (status) status.textContent = `Type column not found — studying all species (${filteredSpecies.length}).`;
    return;
  }

  filteredSpecies = species.filter(row => active.has(normTypeValue(row?.[TYPE_KEY])));
  if (status) status.textContent = `Studying ${filteredSpecies.length} species matching your filters.`;
}

// ================= TOGGLES + INPUTS =================
function getSelectedKeys() {
  return getKeysInOrder().filter((key) => {
    const t = document.getElementById(`toggle_${slugifyKey(key)}`);
    return t && t.checked && !t.disabled;
  });
}
function createToggles() {
  const area = document.getElementById("toggleArea");
  if (!area) return;

  area.innerHTML = "";
  getKeysInOrder().forEach((key) => {
    const sid = slugifyKey(key);
    area.innerHTML += `<label><input type="checkbox" id="toggle_${sid}" checked> ${escapeHtml(key)}</label><br>`;
  });

  getKeysInOrder().forEach((key) => {
    const t = document.getElementById(`toggle_${slugifyKey(key)}`);
    if (t) t.addEventListener("change", generateInputs);
  });
}
function generateInputs() {
  const div = document.getElementById("inputs");
  if (!div) return;

  div.innerHTML = "";
  const selected = getSelectedKeys();

  selected.forEach((key) => {
    const sid = slugifyKey(key);
    div.innerHTML += `
      <div>
        ${escapeHtml(key)}:
        <input id="box_${sid}" autocomplete="off">
      </div>
      <br>
    `;
  });
}
function resetToggleAvailability() {
  getKeysInOrder().forEach((key) => {
    const t = document.getElementById(`toggle_${slugifyKey(key)}`);
    if (t) t.disabled = false;
  });
}
function disableBlankTogglesForCurrent() {
  getKeysInOrder().forEach((key) => {
    const t = document.getElementById(`toggle_${slugifyKey(key)}`);
    if (t && t.checked && isBlank(current?.[key])) {
      t.checked = false;
      t.disabled = true;
    }
  });
}

// ================= HINTS (FLASHCARD) =================
function getCurrentCommonName() {
  const key = COMMON_KEY || "Common Name";
  return String(current?.[key] ?? "").trim();
}
function getCurrentScientificName() {
  const key = SCI_KEY || "Scientific Name";
  return String(current?.[key] ?? "").trim();
}

// Common Name hint
function updateCommonHintUI() {
  const box = document.getElementById("commonHintBox");
  const btn = document.getElementById("revealCommonBtn");
  if (!box || !btn) return;

  if (!commonHintEnabled) {
    box.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Hide Common Name";
    commonRevealed = false;
    return;
  }

  btn.disabled = false;

  const common = getCurrentCommonName();
  if (!common) {
    box.style.display = "block";
    box.innerHTML = "No Common Name available for this entry.";
    btn.textContent = "Hide Common Name";
    commonRevealed = true;
    return;
  }

  if (commonRevealed) {
    box.style.display = "block";
    box.innerHTML = `<strong>Common Name:</strong> ${escapeHtml(common)}`;
    btn.textContent = "Hide Common Name";
  } else {
    box.style.display = "none";
    btn.textContent = "Reveal Common Name";
  }
}
function toggleCommonName() {
  if (!commonHintEnabled) return;
  commonRevealed = !commonRevealed;
  updateCommonHintUI();
}
window.toggleCommonName = toggleCommonName;

// Scientific Name hint
function updateScientificHintUI() {
  const box = document.getElementById("scientificHintBox");
  const btn = document.getElementById("revealScientificBtn");
  if (!box || !btn) return;

  if (!scientificHintEnabled) {
    box.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Hide Scientific Name";
    scientificRevealed = false;
    return;
  }

  btn.disabled = false;

  const sci = getCurrentScientificName();
  if (!sci) {
    box.style.display = "block";
    box.innerHTML = "No Scientific Name available for this entry.";
    btn.textContent = "Hide Scientific Name";
    scientificRevealed = true;
    return;
  }

  if (scientificRevealed) {
    box.style.display = "block";
    box.innerHTML = `<strong>Scientific Name:</strong> ${escapeHtml(sci)}`;
    btn.textContent = "Hide Scientific Name";
  } else {
    box.style.display = "none";
    btn.textContent = "Reveal Scientific Name";
  }
}
function toggleScientificName() {
  if (!scientificHintEnabled) return;
  scientificRevealed = !scientificRevealed;
  updateScientificHintUI();
}
window.toggleScientificName = toggleScientificName;

// ================= IMAGE SYSTEM (unchanged, “some work”) =================
const wikidataInfoCache = {};
const imageUrlCache = {};
const badImageUrls = {};

function getBadSet(sci) {
  if (!badImageUrls[sci]) badImageUrls[sci] = new Set();
  return badImageUrls[sci];
}
function looksLikeJunkFilename(title) {
  const t = String(title).toLowerCase();
  return (
    t.includes("map") ||
    t.includes("range") ||
    t.includes("diagram") ||
    t.includes("logo") ||
    t.includes("icon") ||
    t.includes("symbol") ||
    t.includes("flag") ||
    t.includes("distribution") ||
    t.includes("coat_of_arms")
  );
}
function isAllowedFileExt(title) {
  return /\.(jpg|jpeg|png|webp)$/i.test(String(title));
}
function setPlaceholderImage() {
  const img = document.getElementById("animalImage");
  if (!img) return;
  img.onerror = null;
  img.src = "https://upload.wikimedia.org/wikipedia/commons/placeholder.png";
}
async function commonsThumbUrlsFromFileTitles(fileTitles, width = 900) {
  if (!fileTitles.length) return [];
  const titlesParam = fileTitles.map((t) => (t.startsWith("File:") ? t : `File:${t}`));
  const joined = titlesParam.map(encodeURIComponent).join("|");

  const url =
    "https://commons.wikimedia.org/w/api.php" +
    "?action=query&format=json&origin=*" +
    "&prop=imageinfo&iiprop=url" +
    `&iiurlwidth=${width}` +
    "&titles=" + joined;

  const resp = await fetch(url);
  const data = await resp.json();

  const pages = data?.query?.pages || {};
  const urls = [];

  for (const p of Object.values(pages)) {
    const ii = p?.imageinfo?.[0];
    const u = ii?.thumburl || ii?.url;
    if (u) urls.push(u);
  }
  return urls;
}
async function fetchCommonsCategoryFileTitles(categoryName, limit = 60) {
  if (!categoryName) return [];

  const url =
    "https://commons.wikimedia.org/w/api.php" +
    "?action=query&format=json&origin=*" +
    "&list=categorymembers&cmtype=file" +
    `&cmlimit=${limit}` +
    "&cmtitle=" + encodeURIComponent(`Category:${categoryName}`);

  const resp = await fetch(url);
  const data = await resp.json();
  const members = data?.query?.categorymembers || [];

  return members
    .map((m) => m.title)
    .filter((t) => isAllowedFileExt(t))
    .filter((t) => !looksLikeJunkFilename(t));
}
async function fetchWikidataInfo(scientificName) {
  const sci = cleanScientificName(scientificName);
  if (!sci) return null;

  if (wikidataInfoCache[sci] !== undefined) return wikidataInfoCache[sci];

  const searchUrl =
    "https://www.wikidata.org/w/api.php" +
    "?action=wbsearchentities&format=json&origin=*" +
    "&language=en&type=item&limit=10" +
    "&search=" + encodeURIComponent(sci);

  const s = await fetch(searchUrl).then((r) => r.json());
  const hits = s?.search || [];
  if (!hits.length) {
    wikidataInfoCache[sci] = null;
    return null;
  }

  const ids = hits.map((h) => h.id).join("|");
  const entitiesUrl =
    "https://www.wikidata.org/w/api.php" +
    "?action=wbgetentities&format=json&origin=*" +
    "&props=claims&ids=" + encodeURIComponent(ids);

  const e = await fetch(entitiesUrl).then((r) => r.json());
  const entities = e?.entities || {};

  const target = sci.toLowerCase();
  let best = null;

  for (const ent of Object.values(entities)) {
    const taxon = ent?.claims?.P225?.[0]?.mainsnak?.datavalue?.value;
    if (taxon && String(taxon).trim().toLowerCase() === target) {
      best = ent;
      break;
    }
  }

  if (!best) {
    wikidataInfoCache[sci] = null;
    return null;
  }

  const imageFile = best?.claims?.P18?.[0]?.mainsnak?.datavalue?.value || null;
  const commonsCategory = best?.claims?.P373?.[0]?.mainsnak?.datavalue?.value || null;

  const info = {
    imageFile: imageFile ? String(imageFile) : null,
    commonsCategory: commonsCategory ? String(commonsCategory) : null,
  };

  wikidataInfoCache[sci] = info;
  return info;
}
async function getImageUrlsForSpecies(scientificName) {
  const sci = cleanScientificName(scientificName);
  if (!sci) return [];
  if (imageUrlCache[sci]) return imageUrlCache[sci];

  const info = await fetchWikidataInfo(sci);
  let urls = [];

  if (info?.commonsCategory) {
    const fileTitles = await fetchCommonsCategoryFileTitles(info.commonsCategory, 80);
    const thumbs = await commonsThumbUrlsFromFileTitles(fileTitles.slice(0, 20), 900);
    urls = thumbs.filter(Boolean);
  }

  if (!urls.length && info?.imageFile) {
    const thumbs = await commonsThumbUrlsFromFileTitles([`File:${info.imageFile}`], 900);
    urls = thumbs.filter(Boolean);
  }

  urls = Array.from(new Set(urls));
  imageUrlCache[sci] = urls;
  return urls;
}
async function setImageForCurrent(tokenAtStart) {
  const img = document.getElementById("animalImage");
  const toggle = document.getElementById("showImagesToggle");
  if (!img) return;

  if (toggle && !toggle.checked) {
    img.style.display = "none";
    return;
  }
  img.style.display = "block";
  setPlaceholderImage();

  const sciRaw = SCI_KEY ? current?.[SCI_KEY] : "";
  const sci = cleanScientificName(sciRaw);
  if (!sci) return;

  try {
    const urls = await getImageUrlsForSpecies(sci);
    if (tokenAtStart !== questionToken) return;
    if (!urls.length) return;

    const bad = getBadSet(sci);
    const candidates = urls.filter(u => !bad.has(u));
    const pool = candidates.length ? candidates : urls;
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    img.src = chosen;
    img.onerror = () => {
      bad.add(chosen);
      setPlaceholderImage();
    };
  } catch (e) {
    console.log("Image error:", e);
    setPlaceholderImage();
  }
}
function refreshImageDisplay() {
  const img = document.getElementById("animalImage");
  const t = document.getElementById("showImagesToggle");
  if (!img) return;

  if (t && !t.checked) {
    img.style.display = "none";
  } else {
    img.style.display = "block";
    if (current) setImageForCurrent(questionToken);
  }
}

// ================= QUIZ LOGIC =================
function newQuestion() {
  if (!species.length) return;

  computeFilteredSpecies();

  if (!filteredSpecies.length) {
    current = null;
    setNextEnabled(false);
    const res = document.getElementById("result");
    if (res) res.innerHTML = "No species match your current filters. Turn on at least one filter.";
    setPlaceholderImage();

    commonRevealed = false;
    scientificRevealed = false;
    updateCommonHintUI();
    updateScientificHintUI();
    return;
  }

  questionToken += 1;
  const myToken = questionToken;

  setNextEnabled(false);
  current = filteredSpecies[Math.floor(Math.random() * filteredSpecies.length)];

  resetToggleAvailability();
  disableBlankTogglesForCurrent();
  generateInputs();

  const res = document.getElementById("result");
  if (res) res.innerHTML = "";

  // Auto-reveal if enabled
  commonRevealed = commonHintEnabled ? true : false;
  scientificRevealed = scientificHintEnabled ? true : false;
  updateCommonHintUI();
  updateScientificHintUI();

  setImageForCurrent(myToken);
}

function checkAnswer() {
  if (!current) return;

  const selected = getSelectedKeys();
  const res = document.getElementById("result");

  if (!selected.length) {
    if (res) res.innerHTML = "Select at least one checkbox to be tested on.";
    return;
  }

  let ok = true;
  selected.forEach((key) => {
    const sid = slugifyKey(key);
    const el = document.getElementById(`box_${sid}`);
    const userVal = normalizeAnswer(el ? el.value : "");
    const correctVal = normalizeAnswer(current[key]);
    if (userVal !== correctVal) ok = false;
  });

  if (ok) {
    correctCount++;
    if (res) res.innerHTML = "Correct!";
  } else {
    wrongCount++;
    let out = "Wrong. Correct answers:<br><br>";
    selected.forEach((k) => (out += `${escapeHtml(k)}: ${escapeHtml(current[k] ?? "")}<br>`));
    if (res) res.innerHTML = out;
  }

  updateScore();
  setNextEnabled(true);
}
function nextQuestion() { newQuestion(); }

window.checkAnswer = checkAnswer;
window.nextQuestion = nextQuestion;

// ================= INIT =================
document.addEventListener("DOMContentLoaded", () => {
  updateScore();
  setNextEnabled(false);

  // Hint toggles
  const commonToggle = document.getElementById("enableCommonHintToggle");
  if (commonToggle) {
    commonToggle.addEventListener("change", () => {
      commonHintEnabled = commonToggle.checked;
      commonRevealed = commonHintEnabled ? true : false;
      updateCommonHintUI();
    });
  }
  const sciToggle = document.getElementById("enableScientificHintToggle");
  if (sciToggle) {
    sciToggle.addEventListener("change", () => {
      scientificHintEnabled = sciToggle.checked;
      scientificRevealed = scientificHintEnabled ? true : false;
      updateScientificHintUI();
    });
  }

  // Filter bindings
  ["filterBird", "filterMammal", "filterReptile"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", () => newQuestion());
  });

  // Images toggle
  const showToggle = document.getElementById("showImagesToggle");
  if (showToggle) showToggle.addEventListener("change", refreshImageDisplay);

  fetch(DATA_FILE)
    .then((r) => r.json())
    .then((data) => {
      species = data;

      SCI_KEY = detectKeyLike("scientific", "name");
      TYPE_KEY = detectKeyLike("type");

      // Hard set for exact key names if present
      const keys = getKeysInOrder();
      COMMON_KEY = keys.includes("Common Name") ? "Common Name" : detectKeyLike("common", "name");
      if (!SCI_KEY && keys.includes("Scientific Name")) SCI_KEY = "Scientific Name";

      console.log("Detected keys:", { SCI_KEY, COMMON_KEY, TYPE_KEY });

      createToggles();
      generateInputs();

      computeFilteredSpecies();
      newQuestion();
    })
    .catch((e) => {
      console.log(e);
      const res = document.getElementById("result");
      if (res) res.innerHTML = "Failed to load species data.";
    });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") checkAnswer();
  });
});
