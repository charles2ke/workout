// Settings page: edits the display preferences that the workout program page
// reads back from localStorage.
//
// Loaded as a plain <script> after common.js.

// Wrapped in an IIFE: these files are loaded as plain <script> tags, which share
// one global scope, so top-level declarations would otherwise collide.
(function () {

/* istanbul ignore next -- browser global in the page, require() under Jest */
const Common = (typeof window !== "undefined" && window.WorkoutCommon) || require("./common.js");

const { loadPrefs, savePrefs } = Common;

const notesToggle = document.getElementById("toggle-notes");
const difficultyToggle = document.getElementById("toggle-difficulty");
const animationToggle = document.getElementById("toggle-animation");
const statusDisplay = document.getElementById("settings-status");

function currentPrefs() {
  return {
    showNotes: notesToggle.checked,
    showDifficulty: difficultyToggle.checked,
    animate: animationToggle.checked
  };
}

function persistPrefs() {
  const saved = savePrefs(currentPrefs());
  statusDisplay.textContent = saved
    ? "Saved. The workout program page uses these settings."
    : "Could not save settings in this browser.";
  statusDisplay.className = `timer-status${saved ? " done" : " error"}`;
}

notesToggle.addEventListener("change", persistPrefs);
difficultyToggle.addEventListener("change", persistPrefs);
animationToggle.addEventListener("change", persistPrefs);

function initSettings() {
  const prefs = loadPrefs();
  notesToggle.checked = prefs.showNotes;
  difficultyToggle.checked = prefs.showDifficulty;
  animationToggle.checked = prefs.animate;
}

initSettings();

// ===== Test Exports =====
/* istanbul ignore next */
if (typeof module !== "undefined") {
  module.exports = { _test: { currentPrefs, persistPrefs, initSettings } };
}
})();
