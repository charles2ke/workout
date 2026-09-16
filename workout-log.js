// Workout log: per-exercise completion plus the sets/reps/weight actually
// performed, keyed by local calendar day.
//
// Loaded as a plain <script> after common.js; publishes `window.WorkoutLog`.

// Wrapped in an IIFE: these files are loaded as plain <script> tags, which share
// one global scope, so top-level declarations would otherwise collide.
(function () {

/* istanbul ignore next -- browser global in the page, require() under Jest */
const { storage, getLocalDateKey, shiftDateKey, toNumber } = (typeof window !== "undefined" && window.WorkoutCommon) || require("./common.js");

const WORKOUT_LOG_KEY = "workoutLog";
const MAX_HISTORY_DAYS = 14;
const LOG_FIELDS = [
  { field: "sets", label: "Sets", min: 0, max: 99, step: 1 },
  { field: "reps", label: "Reps", min: 0, max: 999, step: 1 },
  { field: "weight", label: "kg", min: 0, max: 999, step: 0.5 }
];

// Fallback identity for exercises that predate the `id` field: a slug of the
// display name. Kept only as a migration alias — see exerciseIdentity below.
function exerciseKey(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The stable identity for an exercise. Plan authors give each exercise a
// permanent `id` so renaming it (or normalizing punctuation) never orphans
// its history; only exercises without one fall back to a name slug.
function exerciseIdentity(exercise) {
  return exercise && exercise.id ? String(exercise.id) : exerciseKey(exercise && exercise.name);
}

function validateLogValue(field, rawValue) {
  const spec = LOG_FIELDS.find((candidate) => candidate.field === field);
  /* istanbul ignore if -- callers only use fields from LOG_FIELDS */
  if (!spec) return { valid: false, value: null };

  const raw = String(rawValue ?? "").trim();
  if (raw === "") return { valid: true, value: "" };

  const value = toNumber(raw);
  if (value === null || value < spec.min || value > spec.max) return { valid: false, value: null };

  const steps = (value - spec.min) / spec.step;
  const stepTolerance = Number.EPSILON * Math.max(1, Math.abs(steps)) * 8;
  if (Math.abs(steps - Math.round(steps)) > stepTolerance) return { valid: false, value: null };

  return { valid: true, value };
}

function sanitizeLogValue(field, rawValue) {
  const result = validateLogValue(field, rawValue);
  return result.valid && result.value !== "" ? result.value : null;
}

function sanitizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const entry = {
    done: Boolean(raw.done),
    sets: sanitizeLogValue("sets", raw.sets),
    reps: sanitizeLogValue("reps", raw.reps),
    weight: sanitizeLogValue("weight", raw.weight)
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

// `legacyKey` is an optional alias — the name-slug an exercise used before it
// had a stable `id` — so history recorded under the old key is still found
// after the plan gains (or changes) an id, without ever writing to it again.
function getEntry(log, dateKey, key, legacyKey) {
  const session = log[dateKey];
  if (!session) return emptyEntry();
  const entry = session.entries[key] || (legacyKey && legacyKey !== key ? session.entries[legacyKey] : undefined);
  return entry ? { ...entry } : emptyEntry();
}

// Applies a partial update and persists. An entry with nothing recorded is
// dropped so empty days never show up in the history or streak.
function updateEntry(log, dateKey, dayId, key, patch, legacyKey) {
  const session = log[dateKey] || { dayId, entries: {} };
  session.dayId = dayId;

  const merged = sanitizeEntry({ ...getEntry(log, dateKey, key, legacyKey), ...patch });
  if (legacyKey && legacyKey !== key) delete session.entries[legacyKey];
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

function sessionProgress(log, dateKey, identities) {
  const session = log[dateKey];
  const total = identities.length;
  if (!session) return { done: 0, total };
  const done = identities.filter(({ key, legacyKey }) => getEntry(log, dateKey, key, legacyKey).done).length;
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
// recorded with something worth beating. `legacyKey` is checked as a fallback
// so history under a pre-id name slug still counts.
function lastPerformance(log, key, beforeDateKey, legacyKey) {
  const dateKeys = Object.keys(log)
    .filter((dateKey) => dateKey < beforeDateKey)
    .sort()
    .reverse();

  for (const dateKey of dateKeys) {
    const entries = log[dateKey].entries;
    const entry = entries[key] || (legacyKey && legacyKey !== key ? entries[legacyKey] : undefined);
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
  LOG_FIELDS,
  exerciseKey,
  exerciseIdentity,
  validateLogValue,
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
})();
