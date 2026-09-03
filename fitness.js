// ===== Storage =====
const FITNESS_STORAGE_KEY = "fitnessSources";
const API_SETTINGS_KEY = "fitnessApiSettings";
const AUTH_TOKENS_KEY = "fitnessAuthTokens";
const PENDING_AUTH_KEY_PREFIX = "fitnessPendingAuth:";
// Several connect attempts can be in flight at once (extra tabs, a back button, a retry),
// so pending attempts are kept as a bounded, expiring list instead of a single record.
const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_AUTH = 5;

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
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
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

function round(value, decimals = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ===== Live API connections (OAuth 2.0 + PKCE) =====
// Both providers are contacted straight from the browser: no server, no secrets
// in the repository. OAuth credentials (and, when a provider's endpoints are
// not CORS-enabled, a proxy base URL) are supplied by the user and kept in
// localStorage alongside the tokens.
const API_DEFAULTS = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    apiBase: "https://www.googleapis.com",
    scope: [
      "https://www.googleapis.com/auth/fitness.activity.read",
      "https://www.googleapis.com/auth/fitness.heart_rate.read",
      "https://www.googleapis.com/auth/fitness.sleep.read"
    ].join(" "),
    authParams: { access_type: "offline", prompt: "consent" }
  },
  garmin: {
    authUrl: "https://connect.garmin.com/oauth2Confirm",
    tokenUrl: "https://diauth.garmin.com/di-oauth2-service/oauth/token",
    apiBase: "https://apis.garmin.com",
    scope: "",
    authParams: {}
  }
};

const API_OVERRIDE_FIELDS = ["clientId", "clientSecret", "tokenUrl", "apiBase"];
const DAY_MS = 86400000;
const SYNC_DAYS = 7;

function loadApiSettings() {
  const saved = storage.get(API_SETTINGS_KEY, null);
  const settings = {};

  for (const providerId of Object.keys(API_DEFAULTS)) {
    const savedProvider = saved && typeof saved === "object" ? saved[providerId] : null;
    settings[providerId] = {};
    for (const field of API_OVERRIDE_FIELDS) {
      const value = savedProvider && typeof savedProvider === "object" ? savedProvider[field] : null;
      settings[providerId][field] = typeof value === "string" ? value.trim() : "";
    }
  }

  return settings;
}

let apiSettings = loadApiSettings();

function saveApiSetting(providerId, field, value) {
  apiSettings[providerId][field] = String(value || "").trim();
  storage.set(API_SETTINGS_KEY, apiSettings);
}

function providerConfig(providerId) {
  const defaults = API_DEFAULTS[providerId];
  const overrides = apiSettings[providerId];
  return {
    ...defaults,
    clientId: overrides.clientId,
    clientSecret: providerId === "garmin" ? overrides.clientSecret : "",
    tokenUrl: overrides.tokenUrl || defaults.tokenUrl,
    apiBase: overrides.apiBase || defaults.apiBase
  };
}

function loadTokens() {
  const saved = storage.get(AUTH_TOKENS_KEY, null);
  const tokens = {};

  for (const providerId of Object.keys(API_DEFAULTS)) {
    const savedProvider = saved && typeof saved === "object" ? saved[providerId] : null;
    tokens[providerId] =
      savedProvider && typeof savedProvider === "object" && savedProvider.accessToken
        ? {
            accessToken: String(savedProvider.accessToken),
            refreshToken: savedProvider.refreshToken ? String(savedProvider.refreshToken) : null,
            expiresAt: Number(savedProvider.expiresAt) || 0
          }
        : null;
  }

  return tokens;
}

let authTokens = loadTokens();

function saveTokens(providerId, tokens) {
  authTokens[providerId] = tokens;
  storage.set(AUTH_TOKENS_KEY, authTokens);
}

function clearTokens(providerId) {
  authTokens[providerId] = null;
  storage.set(AUTH_TOKENS_KEY, authTokens);
}

// Navigation is wrapped so the redirect can be stubbed in tests.
const navigation = {
  /* istanbul ignore next -- real navigation is not exercised under jsdom */
  go(url) {
    window.location.assign(url);
  }
};

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  window.crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function createCodeChallenge(verifier) {
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function currentRedirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

function buildAuthUrl(providerId, { codeChallenge, state, redirectUri }) {
  const config = providerConfig(providerId);
  const url = new URL(config.authUrl);
  const params = {
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    ...config.authParams
  };

  if (config.scope) params.scope = config.scope;
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function pendingAuthKey(providerId) {
  return `${PENDING_AUTH_KEY_PREFIX}${providerId}`;
}

function readPendingAuth(providerId) {
  const stored = storage.get(pendingAuthKey(providerId), []);
  if (!Array.isArray(stored)) return [];
  const now = Date.now();
  return stored.filter((entry) => entry && now - Number(entry.createdAt) < PENDING_AUTH_TTL_MS);
}

function writePendingAuth(providerId, entries) {
  if (!entries.length) return storage.remove(pendingAuthKey(providerId));
  return storage.set(pendingAuthKey(providerId), entries);
}

function addPendingAuth(providerId, entry) {
  const entries = [...readPendingAuth(providerId), { ...entry, createdAt: Date.now() }];
  return writePendingAuth(providerId, entries.slice(-MAX_PENDING_AUTH));
}

// Removes and returns only the attempt matching this redirect, so other attempts stay valid.
function takePendingAuth(providerId, state) {
  const entries = readPendingAuth(providerId);
  const pending = entries.find((entry) => entry.state === state) || null;
  writePendingAuth(providerId, pending ? entries.filter((entry) => entry !== pending) : entries);
  return { pending, hadEntries: entries.length > 0 };
}

async function startAuth(providerId) {
  const config = providerConfig(providerId);
  if (!config.clientId) {
    throw new Error("add your OAuth client ID under API settings first.");
  }

  const verifier = randomToken();
  const state = `${providerId}:${randomToken(16)}`;
  const redirectUri = currentRedirectUri();
  const codeChallenge = await createCodeChallenge(verifier);

  if (!addPendingAuth(providerId, { providerId, verifier, state, redirectUri })) {
    throw new Error("failed to save OAuth state in local storage.");
  }
  navigation.go(buildAuthUrl(providerId, { codeChallenge, state, redirectUri }));
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestTokens(providerId, params) {
  const config = providerConfig(providerId);
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  const useBasicAuth = providerId === "garmin" && config.clientSecret;
  if (useBasicAuth) {
    const credentials = new TextEncoder().encode(`${config.clientId}:${config.clientSecret}`);
    headers.Authorization = `Basic ${btoa(String.fromCharCode(...credentials))}`;
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams({ ...(useBasicAuth ? {} : { client_id: config.clientId }), ...params }).toString()
  });

  const payload = await readJson(response);
  if (!response.ok || !payload || !payload.access_token) {
    const detail = payload && payload.error_description ? payload.error_description : `HTTP ${response.status}`;
    throw new Error(`the token request was rejected (${detail}).`);
  }

  const expiresIn = Number(payload.expires_in);
  return {
    accessToken: String(payload.access_token),
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : null,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000
  };
}

function exchangeCode(providerId, code, verifier, redirectUri) {
  return requestTokens(providerId, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri
  });
}

async function ensureAccessToken(providerId) {
  const tokens = authTokens[providerId];
  if (!tokens) throw new Error("connect the API first.");
  if (tokens.expiresAt > Date.now() + 60000) return tokens.accessToken;
  if (!tokens.refreshToken) throw new Error("the session expired — connect the API again.");

  const refreshed = await requestTokens(providerId, {
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken
  });
  const merged = { ...refreshed, refreshToken: refreshed.refreshToken || tokens.refreshToken };
  saveTokens(providerId, merged);
  return merged.accessToken;
}

async function apiFetch(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: "Bearer " + accessToken }
  });

  if (!response.ok) throw new Error(`the API responded with HTTP ${response.status}.`);
  const payload = await readJson(response);
  if (payload === null) throw new Error("the API response could not be read.");
  return payload;
}

// ----- Google Fit -----
const GOOGLE_AGGREGATE_TYPES = [
  "com.google.step_count.delta",
  "com.google.calories.expended",
  "com.google.heart_rate.bpm",
  "com.google.sleep.segment"
];

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

async function fetchGoogleRecords(accessToken, now = Date.now()) {
  const config = providerConfig("google");
  const payload = await apiFetch(`${config.apiBase}/fitness/v1/users/me/dataset:aggregate`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      aggregateBy: GOOGLE_AGGREGATE_TYPES.map((dataTypeName) => ({ dataTypeName })),
      bucketByTime: { durationMillis: DAY_MS },
      startTimeMillis: now - SYNC_DAYS * DAY_MS,
      endTimeMillis: now
    })
  });

  const buckets = Array.isArray(payload.bucket) ? payload.bucket : [];
  return sortRecords(buckets.map(googleBucketToRecord).filter(Boolean));
}

// ----- Garmin Health API -----
// Garmin's wellness summaries accept a 24-hour window per request, so one
// request per endpoint per day is issued.
const GARMIN_ENDPOINTS = ["dailies", "sleeps", "userMetrics"];

async function fetchGarminRecords(accessToken, now = Date.now()) {
  const config = providerConfig("garmin");
  const endSeconds = Math.floor(now / 1000);
  const rows = [];

  for (const endpoint of GARMIN_ENDPOINTS) {
    for (let day = 0; day < SYNC_DAYS; day += 1) {
      const end = endSeconds - day * 86400;
      const url = `${config.apiBase}/wellness-api/rest/${endpoint}?uploadStartTimeInSeconds=${end - 86400}&uploadEndTimeInSeconds=${end}`;
      const payload = await apiFetch(url, accessToken);
      rows.push(...(Array.isArray(payload) ? payload : extractRows(payload)));
    }
  }

  return mergeByDate(rows.map(normalizeRecord).filter(Boolean));
}

const RECORD_FETCHERS = { google: fetchGoogleRecords, garmin: fetchGarminRecords };

async function syncProvider(providerId) {
  const fetchRecords = Object.prototype.hasOwnProperty.call(RECORD_FETCHERS, providerId)
    ? RECORD_FETCHERS[providerId]
    : null;

  if (typeof fetchRecords !== "function") {
    throw new Error("unsupported fitness provider.");
  }

  const accessToken = await ensureAccessToken(providerId);
  const records = await fetchRecords(accessToken);
  if (records.length === 0) throw new Error("the API returned no daily records.");
  connectProvider(providerId, records, `${PROVIDERS[providerId].name} API`);
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
  const latestVo2Record = sortRecords(records).find((record) => typeof record.vo2Max === "number");

  return {
    days,
    avgSteps: average(collect(records, "steps")),
    avgRestingHeartRate: average(collect(records, "restingHeartRate")),
    avgSleepHours: average(collect(records, "sleepHours")),
    totalActiveCalories: collect(records, "activeCalories").reduce((sum, value) => sum + value, 0),
    latestVo2Max: latestVo2Record ? latestVo2Record.vo2Max : null
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
  clearTokens(providerId);
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
function providerElements(providerId) {
  return {
    status: document.getElementById(`${providerId}-status`),
    file: document.getElementById(`${providerId}-file`),
    sample: document.getElementById(`${providerId}-sample`),
    disconnect: document.getElementById(`${providerId}-disconnect`),
    connect: document.getElementById(`${providerId}-connect`),
    sync: document.getElementById(`${providerId}-sync`),
    clientId: document.getElementById(`${providerId}-client-id`),
    clientSecret: document.getElementById(`${providerId}-client-secret`),
    tokenUrl: document.getElementById(`${providerId}-token-url`),
    apiBase: document.getElementById(`${providerId}-api-base`)
  };
}

const elements = {
  summaryGrid: document.getElementById("summary-grid"),
  recordsBody: document.getElementById("records-body"),
  recordsTable: document.getElementById("records-table"),
  recordsEmpty: document.getElementById("records-empty"),
  google: providerElements("google"),
  garmin: providerElements("garmin")
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

function showPending(providerId, message) {
  const statusElement = elements[providerId].status;
  statusElement.classList.remove("connected", "error");
  statusElement.textContent = message;
}

function renderSettings(providerId) {
  const controls = elements[providerId];
  for (const field of API_OVERRIDE_FIELDS) {
    if (!controls[field]) continue;
    controls[field].value = apiSettings[providerId][field];
  }
}

async function handleConnect(providerId) {
  showPending(providerId, "Opening the sign-in page…");
  try {
    await startAuth(providerId);
  } catch (error) {
    showError(providerId, `Connection failed: ${error.message}`);
  }
}

async function handleSync(providerId) {
  showPending(providerId, "Syncing…");
  try {
    await syncProvider(providerId);
    render();
  } catch (error) {
    showError(providerId, `Sync failed: ${error.message}`);
  }
}

function clearAuthParamsFromUrl() {
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
}

async function handleAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");
  if (!code && !error) return false;

  const state = params.get("state");
  const providerId = state && state.includes(":") ? state.slice(0, state.indexOf(":")) : null;
  const { pending, hadEntries } = providerId
    ? takePendingAuth(providerId, state)
    : { pending: null, hadEntries: false };
  clearAuthParamsFromUrl();

  if (!PROVIDERS[providerId]) return false;

  if (!pending) {
    if (hadEntries) showError(providerId, "Connection failed: the sign-in state did not match.");
    return false;
  }

  if (error) {
    showError(providerId, `Connection failed: ${error}`);
    return false;
  }

  showPending(providerId, "Finishing sign-in…");
  try {
    saveTokens(providerId, await exchangeCode(providerId, code, pending.verifier, pending.redirectUri));
    await syncProvider(providerId);
    render();
  } catch (exchangeError) {
    showError(providerId, `Connection failed: ${exchangeError.message}`);
  }

  return true;
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

  controls.connect.addEventListener("click", () => handleConnect(providerId));
  controls.sync.addEventListener("click", () => handleSync(providerId));

  for (const field of API_OVERRIDE_FIELDS) {
    if (!controls[field]) continue;
    controls[field].addEventListener("change", (event) => saveApiSetting(providerId, field, event.target.value));
  }
}

function initFitnessPage() {
  for (const providerId of Object.keys(PROVIDERS)) {
    wireProvider(providerId);
    renderSettings(providerId);
  }
  render();
  return handleAuthRedirect();
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
      mergeByDate,
      round,
      loadApiSettings,
      saveApiSetting,
      providerConfig,
      loadTokens,
      saveTokens,
      clearTokens,
      navigation,
      buildAuthUrl,
      startAuth,
      readPendingAuth,
      addPendingAuth,
      takePendingAuth,
      exchangeCode,
      ensureAccessToken,
      apiFetch,
      googleBucketToRecord,
      fetchGoogleRecords,
      fetchGarminRecords,
      syncProvider,
      handleAuthRedirect,
      initFitnessPage,
      FITNESS_STORAGE_KEY,
      API_SETTINGS_KEY,
      AUTH_TOKENS_KEY,
      PENDING_AUTH_KEY_PREFIX,
      PENDING_AUTH_TTL_MS,
      MAX_PENDING_AUTH
    }
  };
}
