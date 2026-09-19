"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// DOM bootstrap — the settings page body (scripts are not executed by JSDOM
// when inserted via innerHTML) so settings.js finds its controls on load.
// ---------------------------------------------------------------------------
const htmlContent = fs.readFileSync(path.join(__dirname, "settings.html"), "utf8");
const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
const domBody = bodyMatch ? bodyMatch[1] : "";

const dispatchChange = (el) => el.dispatchEvent(new Event("change", { bubbles: true }));

function resetAndLoad(storageData) {
  jest.resetModules();
  localStorage.clear();
  if (storageData) {
    Object.entries(storageData).forEach(([key, value]) =>
      localStorage.setItem(key, JSON.stringify(value))
    );
  }
  document.body.innerHTML = domBody;
  return require("./settings.js");
}

const toggles = () => ({
  notes: document.getElementById("toggle-notes"),
  difficulty: document.getElementById("toggle-difficulty"),
  animation: document.getElementById("toggle-animation"),
  status: document.getElementById("settings-status")
});

describe("settings.js", () => {
  test("every toggle starts checked when nothing is saved", () => {
    resetAndLoad();
    const { notes, difficulty, animation } = toggles();
    expect(notes.checked).toBe(true);
    expect(difficulty.checked).toBe(true);
    expect(animation.checked).toBe(true);
  });

  test("saved preferences populate the toggles", () => {
    resetAndLoad({ prefs: { showNotes: false, showDifficulty: true, animate: false } });
    const { notes, difficulty, animation } = toggles();
    expect(notes.checked).toBe(false);
    expect(difficulty.checked).toBe(true);
    expect(animation.checked).toBe(false);
  });

  test("changing a toggle persists every preference and confirms the save", () => {
    resetAndLoad();
    const { notes, animation, status } = toggles();

    notes.checked = false;
    dispatchChange(notes);
    expect(JSON.parse(localStorage.getItem("prefs"))).toEqual({
      showNotes: false,
      showDifficulty: true,
      animate: true
    });
    expect(status.textContent).toContain("Saved");
    expect(status.className).toBe("timer-status done");

    animation.checked = false;
    dispatchChange(animation);
    expect(JSON.parse(localStorage.getItem("prefs")).animate).toBe(false);
  });

  test("the difficulty toggle is wired up too", () => {
    resetAndLoad();
    const { difficulty } = toggles();
    difficulty.checked = false;
    dispatchChange(difficulty);
    expect(JSON.parse(localStorage.getItem("prefs")).showDifficulty).toBe(false);
  });

  test("a storage failure is reported instead of silently dropped", () => {
    resetAndLoad();
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
    try {
      const { notes, status } = toggles();
      notes.checked = false;
      dispatchChange(notes);
      expect(status.textContent).toContain("Could not save");
      expect(status.className).toBe("timer-status error");
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
