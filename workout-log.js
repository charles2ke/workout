// Workout log: per-exercise completion plus the sets/reps/weight actually
// performed, keyed by local calendar day.
//
// Loaded as a plain <script> after common.js; publishes `window.WorkoutLog`.

/* istanbul ignore next -- browser global in the page, require() under Jest */
const { storage, getLocalDateKey, shiftDateKey, toNumber } = (typeof window !== "undefined" && window.WorkoutCommon) || require("./common.js");

const WORKOUT_LOG_KEY = "workoutLog";
const MAX_HISTORY_DAYS = 14;

// Exercise names are the stable identity across days, so they are slugged into
// a key rather than using a positional index that shifts when the plan changes.
function exerciseKey(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const entry = {
    done: Boolean(raw.done),
    sets: toNumber(raw.sets),
    reps: toNumber(raw.reps),
    weight: toNumber(raw.weight)
  };
  const hasValues = entry.sets !== null || entry.reps !== null || entry.weight !== null;
  return entry.done || hasValues ? entry : null;
}

function sanitizeSession(raw) {
  if (!raw || typeof raw !== "object") return null;
  const entries = {};
  for (const [key, value] of Object.entries(raw.entries || {})) {
    const entry = sanitizeEntry(value);
    if (entry) entries[key] = entry;
  }
  if (Object.keys(entries).length === 0) return null;
  return { dayId: typeof raw.dayId === "string" ? raw.dayId : "", entries };
}

function loadLog() {
  const saved = storage.get(WORKOUT_LOG_KEY, null);
  const log = {};
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return log;

  for (const [dateKey, value] of Object.entries(saved)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    const session = sanitizeSession(value);
    if (session) log[dateKey] = session;
  }

  return log;
}

function saveLog(log) {
  return storage.set(WORKOUT_LOG_KEY, log);
}

function emptyEntry() {
  return { done: false, sets: null, reps: null, weight: null };
}

function getEntry(log, dateKey, key) {
  const session = log[dateKey];
  const entry = session && session.entries[key];
  return entry ? { ...entry } : emptyEntry();
}

// Applies a partial update and persists. An entry with nothing recorded is
// dropped so empty days never show up in the history or streak.
function updateEntry(log, dateKey, dayId, key, patch) {
  const session = log[dateKey] || { dayId, entries: {} };
  session.dayId = dayId;

  const merged = sanitizeEntry({ ...getEntry(log, dateKey, key), ...patch });
  if (merged) {
    session.entries[key] = merged;
  } else {
    delete session.entries[key];
  }

  if (Object.keys(session.entries).length === 0) {
    delete log[dateKey];
  } else {
    log[dateKey] = session;
  }

  saveLog(log);
  return log;
}

function clearSession(log, dateKey) {
  delete log[dateKey];
  saveLog(log);
  return log;
}

function completedCount(session) {
  return Object.values(session.entries).filter((entry) => entry.done).length;
}

function sessionProgress(log, dateKey, keys) {
  const session = log[dateKey];
  const total = keys.length;
  if (!session) return { done: 0, total };
  const done = keys.filter((key) => session.entries[key] && session.entries[key].done).length;
  return { done, total };
}

function formatPerformance(entry) {
  if (!entry) return "";
  const parts = [];
  if (entry.sets !== null && entry.reps !== null) {
    parts.push(`${entry.sets}×${entry.reps}`);
  } else if (entry.sets !== null) {
    parts.push(`${entry.sets} sets`);
  } else if (entry.reps !== null) {
    parts.push(`${entry.reps} reps`);
  }
  if (entry.weight !== null) parts.push(`@ ${entry.weight} kg`);
  return parts.join(" ");
}

// Most recent day strictly before `beforeDateKey` where this exercise was
// recorded with something worth beating.
function lastPerformance(log, key, beforeDateKey) {
  const dateKeys = Object.keys(log)
    .filter((dateKey) => dateKey < beforeDateKey)
    .sort()
    .reverse();

  for (const dateKey of dateKeys) {
    const entry = log[dateKey].entries[key];
    if (entry && formatPerformance(entry)) return { dateKey, entry };
  }

  return null;
}

// Consecutive days with at least one completed exercise, ending today. A day
// that has not been trained yet does not break the streak, so the count is
// allowed to start at yesterday.
function computeStreak(log, todayKey = getLocalDateKey()) {
  const trained = (dateKey) => Boolean(log[dateKey]) && completedCount(log[dateKey]) > 0;

  let cursor = trained(todayKey) ? todayKey : shiftDateKey(todayKey, -1);
  let streak = 0;

  while (trained(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  return streak;
}

function recentSessions(log, limit = MAX_HISTORY_DAYS) {
  return Object.keys(log)
    .sort()
    .reverse()
    .slice(0, limit)
    .map((dateKey) => ({
      dateKey,
      dayId: log[dateKey].dayId,
      completed: completedCount(log[dateKey]),
      logged: Object.keys(log[dateKey].entries).length
    }));
}

// Shape used by the My Fitness dashboard so training load can sit alongside
// the steps/sleep/VO2 rows pulled from the providers.
function logRecords(log) {
  return Object.keys(log)
    .sort()
    .reverse()
    .map((dateKey) => ({
      date: dateKey,
      steps: null,
      restingHeartRate: null,
      sleepHours: null,
      activeCalories: null,
      vo2Max: null,
      exercisesCompleted: completedCount(log[dateKey])
    }))
    .filter((record) => record.exercisesCompleted > 0);
}

const WorkoutLog = {
  WORKOUT_LOG_KEY,
  MAX_HISTORY_DAYS,
  exerciseKey,
  loadLog,
  saveLog,
  emptyEntry,
  getEntry,
  updateEntry,
  clearSession,
  sessionProgress,
  formatPerformance,
  lastPerformance,
  computeStreak,
  recentSessions,
  logRecords
};

/* istanbul ignore next */
if (typeof window !== "undefined") {
  window.WorkoutLog = WorkoutLog;
}

/* istanbul ignore next */
if (typeof module !== "undefined") {
  module.exports = WorkoutLog;
}
