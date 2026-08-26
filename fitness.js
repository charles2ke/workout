// ===== Storage =====
const FITNESS_STORAGE_KEY = "fitnessSources";

const storage = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
};

const PROVIDERS = {
  google: { id: "google", name: "Google Health" },
  garmin: { id: "garmin", name: "Garmin" }
};

// ===== Parsing helpers =====
const FIELD_ALIASES = {
  date: ["date", "day", "calendardate", "summarydate", "starttime", "startdate", "timestamp"],
  steps: ["steps", "totalsteps", "stepcount", "dailysteps"],
  restingHeartRate: ["restingheartrate", "restinghr", "resting_heart_rate", "restingheartrateinbeatsperminute"],
  sleepHours: ["sleephours", "sleep", "hoursofsleep"],
  sleepMinutes: ["sleepminutes", "totalsleepminutes"],
  sleepSeconds: ["sleepseconds", "sleepdurationinseconds", "totalsleepseconds"],
  activeCalories: ["activecalories", "activekilocalories", "activecaloriesburned", "calories", "caloriesburned"],
  vo2Max: ["vo2max", "vo2maxvalue", "vo2"]
};

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[\s_-]/g, "");
}

function pickField(record, aliases) {
  for (const [key, value] of Object.entries(record)) {
    if (aliases.includes(normalizeKey(key))) return value;
  }
  return undefined;
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateKey(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const parsed = new Date(Number.isFinite(Number(text)) ? Number(text) : text);
  if (Number.isNaN(parsed.getTime())) return null;
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const date = toDateKey(pickField(raw, FIELD_ALIASES.date));
  if (!date) return null;

  const sleepHours = toNumber(pickField(raw, FIELD_ALIASES.sleepHours));
  const sleepMinutes = toNumber(pickField(raw, FIELD_ALIASES.sleepMinutes));
  const sleepSeconds = toNumber(pickField(raw, FIELD_ALIASES.sleepSeconds));

  let sleep = sleepHours;
  if (sleep === null && sleepMinutes !== null) sleep = sleepMinutes / 60;
  if (sleep === null && sleepSeconds !== null) sleep = sleepSeconds / 3600;

  return {
    date,
    steps: toNumber(pickField(raw, FIELD_ALIASES.steps)),
    restingHeartRate: toNumber(pickField(raw, FIELD_ALIASES.restingHeartRate)),
    sleepHours: sleep === null ? null : Math.round(sleep * 10) / 10,
    activeCalories: toNumber(pickField(raw, FIELD_ALIASES.activeCalories)),
    vo2Max: toNumber(pickField(raw, FIELD_ALIASES.vo2Max))
  };
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] === undefined ? "" : cells[index];
    });
    return row;
  });
}

function extractRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  const arrayValue = Object.values(Object(parsed)).find((value) => Array.isArray(value));
  return arrayValue || [];
}

function parseFitnessData(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("The file is empty.");

  let rows;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("Could not read the file as JSON.");
    }
    rows = extractRows(parsed);
  } else {
    rows = parseCsv(trimmed);
  }

  const records = rows.map(normalizeRecord).filter(Boolean);
  if (records.length === 0) throw new Error("No dated fitness records were found in the file.");

  return sortRecords(records);
}

function sortRecords(records) {
  return [...records].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// ===== Sample data =====
function buildSampleRecords(providerId, today = new Date()) {
  const isGarmin = providerId === "garmin";
  const records = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(today.getTime());
    date.setDate(date.getDate() - offset);
    const wobble = (offset % 3) - 1;

    records.push({
      date: toDateKey(date.toISOString()),
      steps: (isGarmin ? 9200 : 8400) + wobble * 850,
      restingHeartRate: (isGarmin ? 54 : 56) + wobble,
      sleepHours: Math.round(((isGarmin ? 7.2 : 7.0) + wobble * 0.4) * 10) / 10,
      activeCalories: (isGarmin ? 640 : 590) + wobble * 60,
      vo2Max: isGarmin ? 46 : null
    });
  }

  return sortRecords(records);
}

// ===== Summary =====
function average(values) {
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function collect(records, field) {
  return records.map((record) => record[field]).filter((value) => typeof value === "number");
}

function summarize(records) {
  const days = new Set(records.map((record) => record.date)).size;
  const vo2Values = collect(records, "vo2Max");

  return {
    days,
    avgSteps: average(collect(records, "steps")),
    avgRestingHeartRate: average(collect(records, "restingHeartRate")),
    avgSleepHours: average(collect(records, "sleepHours")),
    totalActiveCalories: collect(records, "activeCalories").reduce((sum, value) => sum + value, 0),
    latestVo2Max: vo2Values.length > 0 ? vo2Values[0] : null
  };
}

function formatNumber(value, decimals = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// ===== State =====
function defaultState() {
  return {
    google: { connected: false, lastSyncedAt: null, sourceLabel: null, records: [] },
    garmin: { connected: false, lastSyncedAt: null, sourceLabel: null, records: [] }
  };
}

function loadState() {
  const saved = storage.get(FITNESS_STORAGE_KEY, null);
  const state = defaultState();
  if (!saved || typeof saved !== "object") return state;

  for (const providerId of Object.keys(state)) {
    const savedProvider = saved[providerId];
    if (!savedProvider || typeof savedProvider !== "object") continue;
    state[providerId] = {
      connected: Boolean(savedProvider.connected),
      lastSyncedAt: savedProvider.lastSyncedAt || null,
      sourceLabel: savedProvider.sourceLabel || null,
      records: Array.isArray(savedProvider.records) ? savedProvider.records : []
    };
  }

  return state;
}

let fitnessState = loadState();

function saveState() {
  storage.set(FITNESS_STORAGE_KEY, fitnessState);
}

function connectProvider(providerId, records, sourceLabel) {
  fitnessState[providerId] = {
    connected: true,
    lastSyncedAt: new Date().toISOString(),
    sourceLabel,
    records: sortRecords(records)
  };
  saveState();
}

function disconnectProvider(providerId) {
  fitnessState[providerId] = defaultState()[providerId];
  saveState();
}

function mergedRecords(state = fitnessState) {
  const all = [];
  for (const providerId of Object.keys(PROVIDERS)) {
    const provider = state[providerId];
    if (!provider || !provider.connected) continue;
    for (const record of provider.records) {
      all.push({ ...record, source: PROVIDERS[providerId].name });
    }
  }
  return sortRecords(all);
}

// ===== DOM =====
const elements = {
  summaryGrid: document.getElementById("summary-grid"),
  recordsBody: document.getElementById("records-body"),
  recordsTable: document.getElementById("records-table"),
  recordsEmpty: document.getElementById("records-empty"),
  google: {
    status: document.getElementById("google-status"),
    file: document.getElementById("google-file"),
    sample: document.getElementById("google-sample"),
    disconnect: document.getElementById("google-disconnect")
  },
  garmin: {
    status: document.getElementById("garmin-status"),
    file: document.getElementById("garmin-file"),
    sample: document.getElementById("garmin-sample"),
    disconnect: document.getElementById("garmin-disconnect")
  }
};

function formatSyncedAt(isoString) {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return "just now";
  return parsed.toLocaleString();
}

function renderStatus(providerId) {
  const statusElement = elements[providerId].status;
  const provider = fitnessState[providerId];
  statusElement.classList.remove("connected", "error");

  if (!provider.connected) {
    statusElement.textContent = "Not connected.";
    return;
  }

  statusElement.classList.add("connected");
  const label = provider.sourceLabel ? ` from ${provider.sourceLabel}` : "";
  statusElement.textContent =
    `Connected · ${provider.records.length} day(s)${label} · synced ${formatSyncedAt(provider.lastSyncedAt)}`;
}

function showError(providerId, message) {
  const statusElement = elements[providerId].status;
  statusElement.classList.remove("connected");
  statusElement.classList.add("error");
  statusElement.textContent = message;
}

function renderSummary(records) {
  const summary = summarize(records);
  const cards = [
    { label: "Days tracked", value: formatNumber(summary.days), unit: "days" },
    { label: "Avg steps", value: formatNumber(summary.avgSteps), unit: "per day" },
    { label: "Avg resting HR", value: formatNumber(summary.avgRestingHeartRate), unit: "bpm" },
    { label: "Avg sleep", value: formatNumber(summary.avgSleepHours, 1), unit: "hours" },
    { label: "Active calories", value: formatNumber(summary.totalActiveCalories), unit: "kcal total" },
    { label: "VO2 max", value: formatNumber(summary.latestVo2Max, 1), unit: "latest" }
  ];

  elements.summaryGrid.textContent = "";
  for (const card of cards) {
    const article = document.createElement("article");
    article.className = "metric-card";

    const label = document.createElement("p");
    label.className = "metric-label";
    label.textContent = card.label;

    const value = document.createElement("p");
    value.className = "metric-value";
    value.textContent = card.value;

    const unit = document.createElement("p");
    unit.className = "metric-unit";
    unit.textContent = card.unit;

    article.append(label, value, unit);
    elements.summaryGrid.append(article);
  }
}

function renderRecords(records) {
  elements.recordsBody.textContent = "";
  const hasRecords = records.length > 0;

  elements.recordsEmpty.hidden = hasRecords;
  elements.recordsTable.hidden = !hasRecords;

  for (const record of records.slice(0, 30)) {
    const row = document.createElement("tr");
    const cells = [
      record.date,
      record.source,
      formatNumber(record.steps),
      formatNumber(record.restingHeartRate),
      formatNumber(record.sleepHours, 1),
      formatNumber(record.activeCalories),
      formatNumber(record.vo2Max, 1)
    ];

    for (const cellValue of cells) {
      const cell = document.createElement("td");
      cell.textContent = cellValue;
      row.append(cell);
    }

    elements.recordsBody.append(row);
  }
}

function render() {
  for (const providerId of Object.keys(PROVIDERS)) renderStatus(providerId);
  const records = mergedRecords();
  renderSummary(records);
  renderRecords(records);
}

function handleFile(providerId, file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const records = parseFitnessData(reader.result);
      connectProvider(providerId, records, file.name);
      render();
    } catch (error) {
      showError(providerId, `Import failed: ${error.message}`);
    }
  };
  reader.onerror = () => showError(providerId, "Import failed: the file could not be read.");
  reader.readAsText(file);
}

function wireProvider(providerId) {
  const controls = elements[providerId];

  controls.file.addEventListener("change", (event) => {
    handleFile(providerId, event.target.files[0]);
    event.target.value = "";
  });

  controls.sample.addEventListener("click", () => {
    connectProvider(providerId, buildSampleRecords(providerId), "sample data");
    render();
  });

  controls.disconnect.addEventListener("click", () => {
    disconnectProvider(providerId);
    render();
  });
}

function initFitnessPage() {
  for (const providerId of Object.keys(PROVIDERS)) wireProvider(providerId);
  render();
}

initFitnessPage();

// ===== Test Exports =====
/* istanbul ignore next */
if (typeof module !== "undefined") {
  module.exports = {
    _test: {
      parseCsv,
      parseFitnessData,
      normalizeRecord,
      toDateKey,
      toNumber,
      summarize,
      formatNumber,
      buildSampleRecords,
      sortRecords,
      mergedRecords,
      loadState,
      connectProvider,
      disconnectProvider,
      render,
      FITNESS_STORAGE_KEY
    }
  };
}
