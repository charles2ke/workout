// Shared helpers used by both pages.
//
// This file is loaded as a plain <script> before the page scripts, so it
// publishes its API on `window.WorkoutCommon` (and on `module.exports` so Jest
// can require it directly). There is no bundler: keep it dependency-free.

// Wrapped in an IIFE: these files are loaded as plain <script> tags, which share
// one global scope, so top-level declarations would otherwise collide.
(function () {

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

// Formats a Date as YYYY-MM-DD using the local calendar day, so date keys never
// shift by a day the way `toISOString()` does for non-UTC timezones.
function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Returns the date key `offsetDays` away from `dateKey` (negative goes back).
function shiftDateKey(dateKey, offsetDays) {
  const parts = String(dateKey).split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + offsetDays);
  return getLocalDateKey(date);
}

function formatSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function round(value, decimals = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value, decimals = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// Small DOM builder so the render code stays readable without innerHTML.
function createElement(tag, options = {}) {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs || {})) {
    element.setAttribute(name, value);
  }
  for (const child of options.children || []) element.append(child);
  return element;
}

const WorkoutCommon = {
  storage,
  getLocalDateKey,
  shiftDateKey,
  formatSeconds,
  round,
  toNumber,
  formatNumber,
  createElement
};

/* istanbul ignore next */
if (typeof window !== "undefined") {
  window.WorkoutCommon = WorkoutCommon;
}

/* istanbul ignore next */
if (typeof module !== "undefined") {
  module.exports = WorkoutCommon;
}
})();
