"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// DOM bootstrap — read the HTML, strip script tags, set document.body so that
// all getElementById calls in workout.js succeed when the module is required.
// ---------------------------------------------------------------------------
const htmlPath = path.join(__dirname, "workout.html");
const htmlContent = fs.readFileSync(htmlPath, "utf8");
const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
const rawBody = bodyMatch ? bodyMatch[1] : "";
const domBody = rawBody.replace(/<script[\s\S]*?<\/script>/gi, "");

// ---------------------------------------------------------------------------
// Module-level mock setup (must happen before require('workout.js'))
// ---------------------------------------------------------------------------
let mockOscillator;
let mockGain;
let mockAudioCtx;

function buildAudioMocks() {
  mockOscillator = {
    type: null,
    frequency: { setValueAtTime: jest.fn() },
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn()
  };
  mockGain = {
    gain: { setValueAtTime: jest.fn() },
    connect: jest.fn()
  };
  mockAudioCtx = {
    createOscillator: jest.fn(() => mockOscillator),
    createGain: jest.fn(() => mockGain),
    destination: {},
    currentTime: 0
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function dispatchInput(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
function dispatchChange(el) {
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
function fireKeydown(target, key) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("workout.js", () => {
  let formatSeconds, storage, createSvg, activateDay;

  beforeAll(() => {
    // 1. Hydrate the DOM
    document.body.innerHTML = domBody;

    // 2. Mock AudioContext
    buildAudioMocks();
    window.AudioContext = jest.fn(() => mockAudioCtx);
    window.webkitAudioContext = window.AudioContext;

    // 3. Mock clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true
    });

    // 4. Load the module — this runs all top-level code (DOM wiring + initWorkoutProgram)
    const exports = require("./workout.js");
    ({ formatSeconds, storage, createSvg, activateDay } = exports._test);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  // =========================================================================
  // formatSeconds
  // =========================================================================
  describe("formatSeconds", () => {
    test("formats zero as 00:00", () => {
      expect(formatSeconds(0)).toBe("00:00");
    });

    test("formats 90 seconds as 01:30", () => {
      expect(formatSeconds(90)).toBe("01:30");
    });

    test("formats values >= 60 minutes correctly", () => {
      expect(formatSeconds(3661)).toBe("61:01");
    });

    test("clamps negative to 00:00", () => {
      expect(formatSeconds(-10)).toBe("00:00");
    });

    test("treats NaN as 00:00", () => {
      expect(formatSeconds(NaN)).toBe("00:00");
    });

    test("treats null as 00:00 (|| 0 branch)", () => {
      expect(formatSeconds(null)).toBe("00:00");
    });
  });

  // =========================================================================
  // storage
  // =========================================================================
  describe("storage", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    test("get returns fallback when key is absent", () => {
      expect(storage.get("missing_key", "fallback")).toBe("fallback");
    });

    test("get returns parsed value when key exists", () => {
      localStorage.setItem("myKey", JSON.stringify({ x: 1 }));
      expect(storage.get("myKey", null)).toEqual({ x: 1 });
    });

    test("get returns fallback when localStorage.getItem throws", () => {
      jest.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
        throw new Error("security error");
      });
      expect(storage.get("key", "safe")).toBe("safe");
    });

    test("get returns fallback when stored value is invalid JSON", () => {
      localStorage.setItem("bad", "not-json{{");
      expect(storage.get("bad", "default")).toBe("default");
    });

    test("set stores value and returns true", () => {
      expect(storage.set("hello", { a: 1 })).toBe(true);
      expect(JSON.parse(localStorage.getItem("hello"))).toEqual({ a: 1 });
    });

    test("set returns false when localStorage.setItem throws", () => {
      jest.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
        throw new Error("quota exceeded");
      });
      expect(storage.set("key", "value")).toBe(false);
    });
  });

  // =========================================================================
  // createSvg — all illustration types + default
  // =========================================================================
  describe("createSvg", () => {
    const types = ["press", "pull", "squat", "cardio", "row", "split", "swing", "recovery"];

    test.each(types)("creates SVG for illustration type '%s'", (type) => {
      const svg = createSvg(type, `${type} title`);
      expect(svg.tagName.toLowerCase()).toBe("svg");
      expect(svg.getAttribute("aria-label")).toBe(`${type} title`);
      expect(svg.querySelector("title").textContent).toBe(`${type} title`);
      // Each known type adds at least one child beyond the <title>
      expect(svg.children.length).toBeGreaterThan(1);
    });

    test("renders default placeholder for unknown illustration", () => {
      const svg = createSvg("unknown_type", "unknown title");
      expect(svg.tagName.toLowerCase()).toBe("svg");
      // Default branch adds a rect and a text element
      const rect = svg.querySelector("rect");
      const text = svg.querySelector("text");
      expect(rect).not.toBeNull();
      expect(text).not.toBeNull();
      expect(text.textContent).toBe("Exercise");
    });
  });

  // =========================================================================
  // Initialisation — DOM is populated after module load
  // =========================================================================
  describe("initWorkoutProgram side-effects", () => {
    test("renders 7 tab buttons", () => {
      const tabs = document.querySelectorAll(".tab-btn");
      expect(tabs.length).toBe(7);
    });

    test("renders day sections", () => {
      const panels = document.querySelectorAll(".day-section");
      expect(panels.length).toBe(7);
    });

    test("first tab is active by default", () => {
      const firstTab = document.querySelector(".tab-btn");
      expect(firstTab.classList.contains("active")).toBe(true);
    });

    test("timer display shows saved/default time", () => {
      const display = document.getElementById("timer-display");
      expect(display.textContent).toMatch(/^\d{2}:\d{2}$/);
    });

    test("loads saved profile from localStorage", () => {
      localStorage.setItem(
        "profile",
        JSON.stringify({ name: "Alice", age: "30", ethnicity: "East Asian", height: "5'5\"", weight: "60" })
      );
      jest.resetModules();

      document.body.innerHTML = domBody;
      buildAudioMocks();
      window.AudioContext = jest.fn(() => mockAudioCtx);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true
      });

      require("./workout.js");

      expect(document.getElementById("name-input").value).toBe("Alice");
      expect(document.getElementById("ethnicity-input").value).toBe("East Asian");
      localStorage.clear();
      jest.resetModules();
    });

    test("loads saved prefs (notes/difficulty off) from localStorage", () => {
      localStorage.setItem("prefs", JSON.stringify({ showNotes: false, showDifficulty: false }));
      jest.resetModules();
      document.body.innerHTML = domBody;
      buildAudioMocks();
      window.AudioContext = jest.fn(() => mockAudioCtx);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true
      });

      require("./workout.js");

      expect(document.getElementById("toggle-notes").checked).toBe(false);
      expect(document.getElementById("toggle-difficulty").checked).toBe(false);
      expect(document.getElementById("workout-content").classList.contains("hidden-notes")).toBe(true);
      localStorage.clear();
      jest.resetModules();
    });

    test("restores previously selected day from localStorage", () => {
      localStorage.setItem("selectedDay", "wed");
      jest.resetModules();
      document.body.innerHTML = domBody;
      buildAudioMocks();
      window.AudioContext = jest.fn(() => mockAudioCtx);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true
      });

      require("./workout.js");

      const wedTab = document.getElementById("tab-wed");
      expect(wedTab.classList.contains("active")).toBe(true);
      localStorage.clear();
      jest.resetModules();
    });

    test("restores saved timer seconds from localStorage", () => {
      localStorage.setItem("timerSeconds", JSON.stringify(120));
      jest.resetModules();
      document.body.innerHTML = domBody;
      buildAudioMocks();
      window.AudioContext = jest.fn(() => mockAudioCtx);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true
      });

      require("./workout.js");

      expect(document.getElementById("rest-seconds").value).toBe("120");
      expect(document.getElementById("timer-display").textContent).toBe("02:00");
      localStorage.clear();
      jest.resetModules();
    });
  });

  // =========================================================================
  // activateDay
  // =========================================================================
  describe("activateDay", () => {
    beforeEach(() => {
      // Reset modules to get a fresh activateDay bound to current DOM
      jest.resetModules();
      document.body.innerHTML = domBody;
      buildAudioMocks();
      window.AudioContext = jest.fn(() => mockAudioCtx);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true
      });
      const exp = require("./workout.js");
      activateDay = exp._test.activateDay;
    });

    test("activates the correct tab and panel", () => {
      activateDay("wed");
      expect(document.getElementById("tab-wed").classList.contains("active")).toBe(true);
      expect(document.getElementById("panel-wed").hidden).toBe(false);
      expect(document.getElementById("tab-mon").classList.contains("active")).toBe(false);
    });

    test("falls back to first tab for unknown dayId", () => {
      activateDay("UNKNOWN_DAY");
      const tabs = document.querySelectorAll(".tab-btn");
      const activeTab = document.querySelector(".tab-btn.active");
      expect(activeTab).toBe(tabs[0]);
    });

    test("focuses the tab when focusTab is true", () => {
      const tab = document.getElementById("tab-fri");
      jest.spyOn(tab, "focus");
      activateDay("fri", true);
      expect(tab.focus).toHaveBeenCalled();
    });

    test("does nothing when no tabs exist", () => {
      document.getElementById("day-tabs").innerHTML = "";
      document.getElementById("workout-content").innerHTML = "";
      expect(() => activateDay("mon")).not.toThrow();
    });

    test("saves selected day to localStorage", () => {
      activateDay("sat");
      expect(JSON.parse(localStorage.getItem("selectedDay"))).toBe("sat");
    });
  });

  // =========================================================================
  // Tab click & keyboard navigation
  // =========================================================================
  describe("Tab navigation", () => {
    let tabsNav;

    beforeEach(() => {
      jest.resetModules();
      document.body.innerHTML = domBody;
      buildAudioMocks();
      window.AudioContext = jest.fn(() => mockAudioCtx);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true
      });
      require("./workout.js");
      tabsNav = document.getElementById("day-tabs");
    });

    test("click on tab-btn activates it", () => {
      const tueTab = document.getElementById("tab-tue");
      tueTab.click();
      expect(tueTab.classList.contains("active")).toBe(true);
    });

    test("click on non-tab inside tabsNav is ignored", () => {
      const before = document.querySelector(".tab-btn.active").dataset.day;
      tabsNav.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(document.querySelector(".tab-btn.active").dataset.day).toBe(before);
    });

    test("ArrowRight moves to next tab", () => {
      const monTab = document.getElementById("tab-mon");
      monTab.focus();
      fireKeydown(monTab, "ArrowRight");
      expect(document.getElementById("tab-tue").classList.contains("active")).toBe(true);
    });

    test("ArrowRight wraps around from last to first tab", () => {
      const sunTab = document.getElementById("tab-sun");
      fireKeydown(sunTab, "ArrowRight");
      expect(document.getElementById("tab-mon").classList.contains("active")).toBe(true);
    });

    test("ArrowLeft moves to previous tab", () => {
      activateDay = require("./workout.js")._test.activateDay;
      activateDay("tue");
      const tueTab = document.getElementById("tab-tue");
      fireKeydown(tueTab, "ArrowLeft");
      expect(document.getElementById("tab-mon").classList.contains("active")).toBe(true);
    });

    test("ArrowLeft wraps around from first to last tab", () => {
      const monTab = document.getElementById("tab-mon");
      fireKeydown(monTab, "ArrowLeft");
      expect(document.getElementById("tab-sun").classList.contains("active")).toBe(true);
    });

    test("Home key activates first tab", () => {
      activateDay = require("./workout.js")._test.activateDay;
      activateDay("fri");
      const friTab = document.getElementById("tab-fri");
      fireKeydown(friTab, "Home");
      expect(document.getElementById("tab-mon").classList.contains("active")).toBe(true);
    });

    test("End key activates last tab", () => {
      const monTab = document.getElementById("tab-mon");
      fireKeydown(monTab, "End");
      expect(document.getElementById("tab-sun").classList.contains("active")).toBe(true);
    });

    test("Enter key activates current tab", () => {
      activateDay = require("./workout.js")._test.activateDay;
      activateDay("tue");
      const tueTab = document.getElementById("tab-tue");
      fireKeydown(tueTab, "Enter");
      expect(tueTab.classList.contains("active")).toBe(true);
    });

    test("Space key activates current tab", () => {
      activateDay = require("./workout.js")._test.activateDay;
      activateDay("wed");
      const wedTab = document.getElementById("tab-wed");
      fireKeydown(wedTab, " ");
      expect(wedTab.classList.contains("active")).toBe(true);
    });

    test("unhandled key (e.g. Tab) is ignored", () => {
      const monTab = document.getElementById("tab-mon");
      monTab.focus();
      const before = document.querySelector(".tab-btn.active").dataset.day;
      fireKeydown(monTab, "Tab");
      expect(document.querySelector(".tab-btn.active").dataset.day).toBe(before);
    });

    test("keydown on non-tab element inside tabsNav is ignored", () => {
      const before = document.querySelector(".tab-btn.active").dataset.day;
      fireKeydown(tabsNav, "ArrowRight");
      expect(document.querySelector(".tab-btn.active").dataset.day).toBe(before);
    });
  });

  // =========================================================================
  // Visibility preferences (Show notes / Show difficulty)
  // =========================================================================
  describe("Visibility preferences", () => {
    beforeEach(() => {
      jest.resetModules();
      document.body.innerHTML = domBody;
      buildAudioMocks();
      window.AudioContext = jest.fn(() => mockAudioCtx);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true
      });
      require("./workout.js");
    });

    test("unchecking notes hides notes in DOM", () => {
      const toggle = document.getElementById("toggle-notes");
      toggle.checked = false;
      dispatchChange(toggle);
      expect(document.getElementById("workout-content").classList.contains("hidden-notes")).toBe(true);
    });

    test("re-checking notes shows notes again", () => {
      const toggle = document.getElementById("toggle-notes");
      toggle.checked = false;
      dispatchChange(toggle);
      toggle.checked = true;
      dispatchChange(toggle);
      expect(document.getElementById("workout-content").classList.contains("hidden-notes")).toBe(false);
    });

    test("unchecking difficulty hides difficulty in DOM", () => {
      const toggle = document.getElementById("toggle-difficulty");
      toggle.checked = false;
      dispatchChange(toggle);
      expect(document.getElementById("workout-content").classList.contains("hidden-difficulty")).toBe(true);
    });

    test("preferences are persisted to localStorage", () => {
      const notesToggle = document.getElementById("toggle-notes");
      const diffToggle = document.getElementById("toggle-difficulty");
      notesToggle.checked = false;
      dispatchChange(notesToggle);
      const saved = JSON.parse(localStorage.getItem("prefs"));
      expect(saved.showNotes).toBe(false);
      expect(saved.showDifficulty).toBe(true);

      diffToggle.checked = false;
      dispatchChange(diffToggle);
      const saved2 = JSON.parse(localStorage.getItem("prefs"));
      expect(saved2.showDifficulty).toBe(false);
    });
  });

  // =========================================================================
  // Profile inputs & reset
  // =========================================================================
  describe("Profile inputs", () => {
    beforeEach(() => {
      jest.resetModules();
      localStorage.clear();
      document.body.innerHTML = domBody;
      buildAudioMocks();
      window.AudioContext = jest.fn(() => mockAudioCtx);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true
      });
      require("./workout.js");
    });

    test("changing name saves to localStorage", () => {
      const input = document.getElementById("name-input");
      input.value = "Charlie";
      dispatchInput(input);
      expect(JSON.parse(localStorage.getItem("profile")).name).toBe("Charlie");
    });

    test("changing age saves to localStorage", () => {
      const input = document.getElementById("age-input");
      input.value = "35";
      dispatchInput(input);
      expect(JSON.parse(localStorage.getItem("profile")).age).toBe("35");
    });

    test("changing ethnicity (select) saves to localStorage", () => {
      const select = document.getElementById("ethnicity-input");
      select.value = "East Asian";
      dispatchChange(select);
      expect(JSON.parse(localStorage.getItem("profile")).ethnicity).toBe("East Asian");
    });

    test("changing height saves to localStorage", () => {
      const input = document.getElementById("height-input");
      input.value = "6'0\"";
      dispatchInput(input);
      expect(JSON.parse(localStorage.getItem("profile")).height).toBe("6'0\"");
    });

    test("changing weight saves to localStorage", () => {
      const input = document.getElementById("weight-input");
      input.value = "85";
      dispatchInput(input);
      expect(JSON.parse(localStorage.getItem("profile")).weight).toBe("85");
    });

    test("reset button restores all fields to defaults", () => {
      document.getElementById("name-input").value = "Someone";
      document.getElementById("age-input").value = "99";
      document.getElementById("ethnicity-input").value = "East Asian";
      document.getElementById("height-input").value = "4'0\"";
      document.getElementById("weight-input").value = "50";

      document.getElementById("reset-profile-btn").click();

      expect(document.getElementById("name-input").value).toBe("Tito");
      expect(document.getElementById("age-input").value).toBe("42");
      expect(document.getElementById("ethnicity-input").value).toBe("Indian");
      expect(document.getElementById("height-input").value).toBe("5'11\"");
      expect(document.getElementById("weight-input").value).toBe("77");
    });

    test("reset saves defaults to localStorage", () => {
      document.getElementById("reset-profile-btn").click();
      const saved = JSON.parse(localStorage.getItem("profile"));
      expect(saved.name).toBe("Tito");
      expect(saved.ethnicity).toBe("Indian");
    });
  });

  // =========================================================================
  // Rest timer
  // =========================================================================
  describe("Rest timer", () => {
    beforeEach(() => {
      jest.resetModules();
      localStorage.clear();
      document.body.innerHTML = domBody;
      buildAudioMocks();
      window.AudioContext = jest.fn(() => mockAudioCtx);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true
      });
      jest.useFakeTimers();
      require("./workout.js");
    });

    test("starts timer and updates display each second", () => {
      document.getElementById("rest-seconds").value = "10";
      document.getElementById("start-timer").click();

      expect(document.getElementById("timer-status").textContent).toBe("Running...");

      jest.advanceTimersByTime(3000);
      expect(document.getElementById("timer-display").textContent).toBe("00:07");
    });

    test("timer completes and shows Rest complete! message", () => {
      document.getElementById("rest-seconds").value = "5";
      document.getElementById("start-timer").click();
      jest.advanceTimersByTime(5000);

      expect(document.getElementById("timer-status").textContent).toBe("Rest complete!");
      expect(document.getElementById("timer-status").className).toContain("done");
    });

    test("timer plays audio tone on completion", () => {
      document.getElementById("rest-seconds").value = "5";
      document.getElementById("start-timer").click();
      jest.advanceTimersByTime(5000);

      expect(window.AudioContext).toHaveBeenCalled();
      expect(mockAudioCtx.createOscillator).toHaveBeenCalled();
    });

    test("stop button halts running timer", () => {
      document.getElementById("rest-seconds").value = "30";
      document.getElementById("start-timer").click();
      jest.advanceTimersByTime(5000);
      document.getElementById("stop-timer").click();

      expect(document.getElementById("timer-status").textContent).toBe("Stopped.");
      jest.advanceTimersByTime(30000); // should not crash
    });

    test("stop button when no timer running just shows Stopped.", () => {
      document.getElementById("stop-timer").click();
      expect(document.getElementById("timer-status").textContent).toBe("Stopped.");
    });

    test("shows error for value less than 5 seconds", () => {
      document.getElementById("rest-seconds").value = "3";
      document.getElementById("start-timer").click();
      expect(document.getElementById("timer-status").textContent).toBe("Please enter at least 5 seconds.");
      expect(document.getElementById("timer-status").className).toContain("error");
    });

    test("shows error for non-numeric input", () => {
      document.getElementById("rest-seconds").value = "";
      document.getElementById("start-timer").click();
      expect(document.getElementById("timer-status").textContent).toBe("Please enter at least 5 seconds.");
    });

    test("timer seconds are saved to localStorage on start", () => {
      document.getElementById("rest-seconds").value = "60";
      document.getElementById("start-timer").click();
      expect(JSON.parse(localStorage.getItem("timerSeconds"))).toBe(60);
    });

    test("setTimerStatus without kind produces no extra class", () => {
      document.getElementById("rest-seconds").value = "10";
      document.getElementById("start-timer").click();
      jest.advanceTimersByTime(3000);
      document.getElementById("stop-timer").click();
      // Stopped message with no kind
      expect(document.getElementById("timer-status").className).toBe("timer-status");
    });

    test("timer display shows 00:00 when countdown reaches zero", () => {
      document.getElementById("rest-seconds").value = "5";
      document.getElementById("start-timer").click();
      jest.advanceTimersByTime(5000);
      expect(document.getElementById("timer-display").textContent).toBe("00:00");
    });
  });

  // =========================================================================
  // playNotificationTone error handling
  // =========================================================================
  describe("playNotificationTone error handling", () => {
    beforeEach(() => {
      jest.resetModules();
      localStorage.clear();
      document.body.innerHTML = domBody;
      jest.useFakeTimers();
    });

    test("swallows AudioContext errors silently", () => {
      window.AudioContext = jest.fn(() => {
        throw new Error("audio blocked");
      });
      window.webkitAudioContext = undefined;
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true
      });

      require("./workout.js");

      document.getElementById("rest-seconds").value = "5";
      document.getElementById("start-timer").click();
      // Should not throw when AudioContext is unavailable
      expect(() => jest.advanceTimersByTime(5000)).not.toThrow();
    });
  });

  // =========================================================================
  // Copy button
  // =========================================================================
  describe("Copy button", () => {
    let workoutContent;

    beforeEach(() => {
      jest.resetModules();
      document.body.innerHTML = domBody;
      buildAudioMocks();
      window.AudioContext = jest.fn(() => mockAudioCtx);
      jest.useFakeTimers();
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true
      });
      require("./workout.js");
      workoutContent = document.getElementById("workout-content");
    });

    test("clicking copy uses clipboard API and updates button text", async () => {
      const copyBtn = workoutContent.querySelector(".copy-btn");
      copyBtn.click();
      await Promise.resolve(); // flush the async clipboard call
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(copyBtn.textContent).toBe("Copied!");
    });

    test("copy announcement is set on success", async () => {
      const copyBtn = workoutContent.querySelector(".copy-btn");
      copyBtn.click();
      await Promise.resolve();
      const announcement = document.getElementById("copy-announcement");
      expect(announcement.textContent).not.toBe("");
    });

    test("copy announcement and button text reset after 1200ms", async () => {
      const copyBtn = workoutContent.querySelector(".copy-btn");
      copyBtn.click();
      await Promise.resolve();
      jest.advanceTimersByTime(1200);
      expect(copyBtn.textContent).toBe("Copy details");
      expect(document.getElementById("copy-announcement").textContent).toBe("");
    });

    test("falls back to execCommand when clipboard API unavailable", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
        writable: true
      });
      document.execCommand = jest.fn();

      const copyBtn = workoutContent.querySelector(".copy-btn");
      copyBtn.click();
      await Promise.resolve();
      expect(document.execCommand).toHaveBeenCalledWith("copy");
      expect(copyBtn.textContent).toBe("Copied!");
    });

    test("shows Copy failed when clipboard rejects", async () => {
      navigator.clipboard.writeText = jest.fn().mockRejectedValue(new Error("denied"));
      const copyBtn = workoutContent.querySelector(".copy-btn");
      copyBtn.click();
      await Promise.resolve();
      await Promise.resolve(); // extra tick for rejection handling
      expect(copyBtn.textContent).toBe("Copy failed");
      expect(document.getElementById("copy-announcement").textContent).toBe(
        "Copy failed. Please try again."
      );
    });

    test("click on non-copy-btn inside workoutContent is ignored", async () => {
      const exerciseTitle = workoutContent.querySelector(".exercise-title");
      if (exerciseTitle) {
        exerciseTitle.click();
      } else {
        workoutContent.click();
      }
      await Promise.resolve();
      // No error thrown and clipboard was not called
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });
  });
});
