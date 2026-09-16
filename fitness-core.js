// Pure data layer for the My Fitness dashboard: field parsing, CSV/JSON
// import, provider payload adapters and summary maths. No DOM, no network,
// no storage — everything here is a pure function of its arguments.
//
// Loaded as a plain <script> after common.js; publishes `window.FitnessCore`.

// Wrapped in an IIFE: these files are loaded as plain <script> tags, which share
// one global scope, so top-level declarations would otherwise collide.
(function () {

/* istanbul ignore next -- browser global in the page, require() under Jest */
const { round, toNumber, getLocalDateKey } = (typeof window !== "undefined" && window.WorkoutCommon) || require("./common.js");

// ===== Parsing helpers =====
const FIELD_ALIASES = {
  date: ["date", "day", "calendardate", "summarydate", "starttime", "startdate", "timestamp"],
  steps: ["steps", "totalsteps", "stepcount", "dailysteps"],
  restingHeartRate: ["restingheartrate", "restinghr", "resting_heart_rate", "restingheartrateinbeatsperminute"],
  sleepHours: ["sleephours", "sleep", "hoursofsleep"],
  sleepMinutes: ["sleepminutes", "totalsleepminutes"],
  sleepSeconds: ["sleepseconds", "sleepdurationinseconds", "totalsleepseconds", "sleeptimeinseconds"],
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

function toDateKey(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const parsed = new Date(Number.isFinite(Number(text)) ? Number(text) : text);
  if (Number.isNaN(parsed.getTime())) return null;
  return getLocalDateKey(parsed);
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

function splitCsvRows(text) {
  const rows = [];
  let cells = [];
  let current = "";
  let quoted = false;
  let cellQuoted = false;
  let rowHasValue = false;

  const pushCell = () => {
    cells.push(cellQuoted ? current : current.trim());
    current = "";
    cellQuoted = false;
  };

  const pushRow = () => {
    pushCell();
    if (rowHasValue) rows.push(cells);
    cells = [];
    rowHasValue = false;
  };

  const normalized = String(text).replace(/\r\n?/g, "\n");
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (quoted) {
      if (char === '"' && normalized[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
      cellQuoted = true;
      rowHasValue = true;
    } else if (char === ",") {
      rowHasValue = true;
      pushCell();
    } else if (char === "\n") {
      pushRow();
    } else {
      current += char;
      if (char.trim() !== "") rowHasValue = true;
    }
  }

  pushRow();
  return rows;
}

function parseCsv(text) {
  const rows = splitCsvRows(text);
  if (rows.length < 2) return [];

  const headers = rows[0];
  return rows.slice(1).map((cells) => {
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

function sortRecords(records) {
  return [...records].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
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

function mergeByDate(records) {
  const byDate = new Map();

  for (const record of records) {
    const existing = byDate.get(record.date);
    if (!existing) {
      byDate.set(record.date, { ...record });
      continue;
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === "date" || value === null) continue;
      if (existing[key] === null || existing[key] === undefined) existing[key] = value;
    }
  }

  return sortRecords([...byDate.values()]);
}

// ===== Google Fit payload adapter =====
// Google sleep segment values: 1 = awake, 3 = out of bed.
const GOOGLE_NON_SLEEP_STAGES = [1, 3];

function datasetPoints(datasets, index) {
  const dataset = Array.isArray(datasets) ? datasets[index] : null;
  return dataset && Array.isArray(dataset.point) ? dataset.point : [];
}

function pointValue(point, index = 0) {
  const value = Array.isArray(point.value) ? point.value[index] : null;
  if (!value) return null;
  if (typeof value.intVal === "number") return value.intVal;
  if (typeof value.fpVal === "number") return value.fpVal;
  return null;
}

function sumPointValues(points, index = 0) {
  let total = null;
  for (const point of points) {
    const value = pointValue(point, index);
    if (value === null) continue;
    total = (total === null ? 0 : total) + value;
  }
  return total;
}

function sleepHoursFromPoints(points) {
  let seconds = null;

  for (const point of points) {
    const stage = pointValue(point);
    if (stage === null || GOOGLE_NON_SLEEP_STAGES.includes(stage)) continue;
    const start = Number(point.startTimeNanos);
    const end = Number(point.endTimeNanos);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    seconds = (seconds === null ? 0 : seconds) + (end - start) / 1e9;
  }

  return seconds === null ? null : round(seconds / 3600, 1);
}

function googleBucketToRecord(bucket) {
  const date = toDateKey(bucket.startTimeMillis);
  if (!date) return null;

  const datasets = bucket.dataset;
  const heartPoints = datasetPoints(datasets, 2);
  // Aggregated heart-rate points are [average, max, min]; the daily minimum is
  // the closest stand-in Google Fit offers for resting heart rate.
  const restingHeartRate = heartPoints.length === 0 ? null : pointValue(heartPoints[0], 2);

  return {
    date,
    steps: round(sumPointValues(datasetPoints(datasets, 0))),
    restingHeartRate: round(restingHeartRate),
    sleepHours: sleepHoursFromPoints(datasetPoints(datasets, 3)),
    activeCalories: round(sumPointValues(datasetPoints(datasets, 1))),
    vo2Max: null
  };
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
      date: getLocalDateKey(date),
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
  const latestVo2Record = sortRecords(records).find((record) => typeof record.vo2Max === "number");
  const workoutDates = new Set(
    records.filter((record) => typeof record.exercisesCompleted === "number" && record.exercisesCompleted > 0)
      .map((record) => record.date)
  );

  return {
    days,
    avgSteps: average(collect(records, "steps")),
    avgRestingHeartRate: average(collect(records, "restingHeartRate")),
    avgSleepHours: average(collect(records, "sleepHours")),
    totalActiveCalories: collect(records, "activeCalories").reduce((sum, value) => sum + value, 0),
    latestVo2Max: latestVo2Record ? latestVo2Record.vo2Max : null,
    workoutDays: workoutDates.size,
    exercisesCompleted: collect(records, "exercisesCompleted").reduce((sum, value) => sum + value, 0)
  };
}

const FitnessCore = {
  FIELD_ALIASES,
  normalizeKey,
  pickField,
  toDateKey,
  normalizeRecord,
  splitCsvRows,
  parseCsv,
  extractRows,
  parseFitnessData,
  sortRecords,
  mergeByDate,
  datasetPoints,
  pointValue,
  sumPointValues,
  sleepHoursFromPoints,
  googleBucketToRecord,
  buildSampleRecords,
  average,
  collect,
  summarize
};

/* istanbul ignore next */
if (typeof window !== "undefined") {
  window.FitnessCore = FitnessCore;
}

/* istanbul ignore next */
if (typeof module !== "undefined") {
  module.exports = FitnessCore;
}
})();
