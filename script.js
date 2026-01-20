// ====== CONFIG ======
const DATA_FILE = "species_list.json"; // your JSON filename (must be in same folder as index.html)

// ====== STATE ======
let species = [];
let current = null;

let correctCount = 0;
let wrongCount = 0;

// ====== IMAGE STATE ======
const wikiImageCache = {}; // scientificName -> [url, url, ...]
const wikiUsedImages = {}; // scientificName -> Set(url)

// ====== HELPERS ======
function slugifyKey(key) {
  // Turn "Common Name" -> "Common_Name" (safe for HTML ids)
  return String(key).replace(/[^A-Za-z0-9_-]/g, "_");
}

function normalizeAnswer(s) {
  // forgiving comparison: trim, lowercase, collapse whitespace
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function getKeysInOrder() {
  if (!species || species.length === 0) return [];
  // Most CSV->JSON converters preserve column order in object keys
  return Object.keys(species[0]);
}

function getSelectedKeys() {
  const keys = getKeysInOrder();
  const selected = [];

  for (const key of keys) {
    const sid = slugifyKey(key);
    const toggle = document.getElementById(`toggle_${sid}`);
    if (toggle && toggle.checked && !toggle.disabled) selected.push(key);
  }
  return selected;
}

// ====== UI BUILDERS ======
function createToggles() {
  const area = document.getElementById("toggleArea");
  if (!area) return;

  area.innerHTML = "";

  const keys = getKeysInOrder();

  for (const key of keys) {
    const sid = slugifyKey(key);

    // Default: everything checked (change later if you want)
    const row = document.createElement("label");
    row.innerHTML = `<input type="checkbox" id="toggle_${sid}" checked> ${key}`;
    area.appendChild(row);
    area.appendChild(document.createElement("br"));
  }

  // When any toggle changes, rebuild inputs immediately
  for (const key of keys) {
    const sid = slugifyKey(key);
    const toggle = document.getElementById(`toggle_${sid}`);
    toggle.addEventListener("change", () => {
      generateInputs();
      const result = document.getElementById("result");
      if (result) result.innerHTML = "";
    });
  }
}

function generateInputs() {
  const container = document.getElementById("inputs");
  if (!container) return;

  container.innerHTML = "";

  if (!species || species.length === 0) return;

  const keys = getKeysInOrder();

  for (const key of keys) {
    const sid = slugifyKey(key);
    const toggle = document.getElementById(`toggle_${sid}`);

    if (toggle && toggle.checked && !toggle.disabled) {
      const line = document.createElement("div");
      line.innerHTML = `${key}: <input id="box_${sid}" autocomplete="off">`;
      container.appendChild(line);
      container.appendChild(document.createElement("br"));
    }
  }
}

function updateScore() {
  const scoreEl = document.getElementById("score");
  if (!scoreEl) return;

  scoreEl.innerHTML = `Correct: ${correctCount} | Wrong: ${wrongCount}`;
}

function setNextEnabled(enabled) {
  const nextBtn = document.getElementById("nextBtn");
  if (nextBtn) nextBtn.disabled = !enabled;
}

// ====== AUTO-DETOGGLE BLANKS (per question) ======
function resetToggleAvailability() {
  // Re-enable everything each question (fresh start)
  const keys = getKeysInOrder();
  for (const key of keys) {
    const sid = slugifyKey(key);
    const t = document.getElementById(`toggle_${sid}`);
    if (t) t.disabled = false;
  }
}

function disableTogglesForBlankFields() {
  // If a selected field is blank for THIS species, untick and disable it
  const keys = getKeysInOrder();

  for (const key of keys) {
    const sid = slugifyKey(key);
    const t = document.getElementById(`toggle_${sid}`);
    if (!t) continue;

    if (t.checked && isBlank(current[key])) {
      t.checked = false; // detoggle
      t.disabled = true; // prevent rechecking this question
    }
  }
}

// ====== WIKIPEDIA IMAGE FETCHING ======
async function fetchWikipediaImageUrls(scientificName, maxImages = 12) {
  if (!scientificName) return [];

  // Cache hit
  if (wikiImageCache[scientificName]) return wikiImageCache[scientificName];

  // 1) Find the Wikipedia page title for this scientific name
  const searchUrl =
    "https://en.wikipedia.org/w/api.php" +
    "?action=query&format=json&origin=*" +
    "&list=search" +
    "&srlimit=1" +
    "&srsearch=" +
    encodeURIComponent(scientificName);

  const searchResp = await fetch(searchUrl);
  const searchData = await searchResp.json();

  if (!searchData?.query?.search?.length) {
    wikiImageCache[scientificName] = [];
    return [];
  }

  const pageTitle = searchData.query.search[0].title;

  // 2) Get image FILE TITLES used on that page
  const imagesUrl =
    "https://en.wikipedia.org/w/api.php" +
    "?action=query&format=json&origin=*" +
    "&prop=images" +
    "&titles=" +
    encodeURIComponent(pageTitle) +
    "&imlimit=" +
    maxImages;

  const imagesResp = await fetch(imagesUrl);
  const imagesData = await imagesResp.json();

  const pages = imagesData?.query?.pages || {};
  const firstPage = pages[Object.keys(pages)[0]];
  const imageObjs = firstPage?.images || [];

  // Filter out obvious non-photos
  const fileTitles = imageObjs
    .map((o) => o.title)
    .filter(
      (t) =>
        t &&
        t.startsWith("File:") &&
        !t.match(/\.(svg|ogg|ogv|pdf)$/i) &&
        !t.toLowerCase().includes("logo") &&
        !t.toLowerCase().includes("icon") &&
        !t.toLowerCase().includes("map") &&
        !t.toLowerCase().includes("range") &&
        !t.toLowerCase().includes("diagram")
    )
    .slice(0, maxImages);

  if (fileTitles.length === 0) {
    wikiImageCache[scientificName] = [];
    return [];
  }

  // 3) Convert file titles -> direct image URLs via imageinfo
  const fileTitlesParam = fileTitles.map(encodeURIComponent).join("|");

  const infoUrl =
    "https://en.wikipedia.org/w/api.php" +
    "?action=query&format=json&origin=*" +
    "&prop=imageinfo" +
    "&iiprop=url" +
    "&titles=" +
    fileTitlesParam;

  const infoResp = await fetch(infoUrl);
  const infoData = await infoResp.json();

  const infoPages = infoData?.query?.pages || {};
  const urls = Object.values(infoPages)
    .flatMap((p) => (p?.imageinfo?.[0]?.url ? [p.imageinfo[0].url] : []))
    .filter(Boolean);

  wikiImageCache[scientificName] = urls;
  return urls;
}

function pickNonRepeatingImage(scientificName, urls) {
  if (!wikiUsedImages[scientificName]) wikiUsedImages[scientificName] = new Set();

  const used = wikiUsedImages[scientificName];
  const unused = urls.filter((u) => !used.has(u));

  // If we used them all, reset for that species
  const pool = unused.length ? unused : urls;

  const choice = pool[Math.floor(Math.random() * pool.length)];
  used.add(choice);
  return choice;
}

async function setImageForCurrent() {
  const img = document.getElementById("animalImage");
  if (!img) return;

  const showToggle = document.getElementById("showImagesToggle");
  const showImages = showToggle ? showToggle.checked : true;

  if (!showImages) {
    // We'll hide via refreshImageDisplay()
    return;
  }

  const sci = current?.["Scientific Name"];
  if (!sci) return;

  // Loading placeholder while API runs
  img.src = "https://upload.wikimedia.org/wikipedia/commons/placeholder.png";

  try {
    const urls = await fetchWikipediaImageUrls(sci, 12);
    if (!urls.length) return;

    const chosen = pickNonRepeatingImage(sci, urls);
    img.src = chosen;
  } catch (e) {
    console.log("Image fetch failed:", e);
  }
}

// Hide/show image immediately when toggled; reload current image when turning on
function refreshImageDisplay() {
  const img = document.getElementById("animalImage");
  const showToggle = document.getElementById("showImagesToggle");
  const showImages = showToggle ? showToggle.checked : true;

  if (!img) return;

  if (!showImages) {
    img.style.display = "none";
  } else {
    img.style.display = "block";
    if (current) setImageForCurrent();
  }
}

// ====== QUIZ LOGIC ======
function newQuestion() {
  if (!species || species.length === 0) return;

  // Lock Next until user submits this question
  setNextEnabled(false);

  // Pick a random species first
  current = species[Math.floor(Math.random() * species.length)];

  // Re-enable toggles, then detoggle/disable blanks for this species
  resetToggleAvailability();
  disableTogglesForBlankFields();

  // If user ended up with nothing selected, ask them to select something
  const selectedKeys = getSelectedKeys();
  const resultEl = document.getElementById("result");

  if (selectedKeys.length === 0) {
    if (resultEl) {
      resultEl.innerHTML =
        "Select at least one checkbox (or this row is missing data for your selected fields).";
    }
    generateInputs(); // likely none
    refreshImageDisplay();
    return;
  }

  // Build input boxes for selected fields
  generateInputs();

  // Set image using Wikipedia (Scientific Name) and respect toggle
  setImageForCurrent();
  refreshImageDisplay();

  // Clear result text and clear input values
  if (resultEl) resultEl.innerHTML = "";
  for (const key of selectedKeys) {
    const sid = slugifyKey(key);
    const box = document.getElementById(`box_${sid}`);
    if (box) box.value = "";
  }
}

function checkAnswer() {
  if (!current) {
    const resultEl = document.getElementById("result");
    if (resultEl) resultEl.innerHTML = "No question loaded yet. Click Next or refresh.";
    return;
  }

  const selectedKeys = getSelectedKeys();
  const resultEl = document.getElementById("result");

  if (selectedKeys.length === 0) {
    if (resultEl) resultEl.innerHTML = "Select at least one checkbox to be tested on.";
    return;
  }

  let isCorrect = true;

  for (const key of selectedKeys) {
    const sid = slugifyKey(key);
    const box = document.getElementById(`box_${sid}`);
    const userInput = normalizeAnswer(box ? box.value : "");
    const correctValue = normalizeAnswer(current[key]);

    if (userInput !== correctValue) {
      isCorrect = false;
    }
  }

  if (isCorrect) {
    correctCount++;
    if (resultEl) resultEl.innerHTML = "Correct!";
  } else {
    wrongCount++;

    // Show all selected fields and their correct values
    let feedback = "Wrong. Correct answers:<br><br>";
    for (const key of selectedKeys) {
      feedback += `${key}: ${current[key] ?? ""}<br>`;
    }
    if (resultEl) resultEl.innerHTML = feedback;
  }

  updateScore();

  // Unlock Next after submission
  setNextEnabled(true);
}

function nextQuestion() {
  newQuestion();
}

// ====== INIT ======
document.addEventListener("DOMContentLoaded", () => {
  updateScore();
  setNextEnabled(false);

  // Make the image toggle work instantly
  const showToggle = document.getElementById("showImagesToggle");
  if (showToggle) {
    showToggle.addEventListener("change", refreshImageDisplay);
  }
  refreshImageDisplay();

  fetch(DATA_FILE)
    .then((response) => response.json())
    .then((data) => {
      species = data;

      createToggles();
      generateInputs(); // initial boxes (before first question)
      newQuestion();
    })
    .catch((error) => {
      console.log("Error loading JSON:", error);
      const resultEl = document.getElementById("result");
      if (resultEl) {
        resultEl.innerHTML =
          "Could not load species data. Check the JSON filename and that the server is running.";
      }
    });

  // Optional: Enter key submits
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") checkAnswer();
  });
});
