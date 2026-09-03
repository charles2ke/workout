"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// DOM bootstrap — read the HTML body (no scripts) so DOM elements exist when
// workout.js is required and runs its module-level getElementById calls.
// ---------------------------------------------------------------------------
const htmlPath = path.join(__dirname, "workout.html");
const htmlContent = fs.readFileSync(htmlPath, "utf8");
const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
// JSDOM does not execute scripts inserted via innerHTML, so no stripping needed
const domBody = bodyMatch ? bodyMatch[1] : "";

// ---------------------------------------------------------------------------
// Re-usable mock builders
// ---------------------------------------------------------------------------
let mockOscillator, mockGain, mockAudioCtx;

function buildAudioMocks() {
  mockOscillator = {
    type: null,
    frequency: { setValueAtTime: jest.fn() },
    connect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn()
  };
  mockGain = { gain: { setValueAtTime: jest.fn() }, connect: jest.fn() };
  mockAudioCtx = {
    createOscillator: jest.fn(() => mockOscillator),
    createGain: jest.fn(() => mockGain),
    destination: {},
    currentTime: 0
  };
}

function setupEnv({ restSecondsValue } = {}) {
  document.body.innerHTML = domBody;
  if (restSecondsValue !== undefined) {
    document.getElementById("rest-seconds").value = restSecondsValue;
  }
  buildAudioMocks();
  window.AudioContext = jest.fn(() => mockAudioCtx);
  window.webkitAudioContext = window.AudioContext;
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    configurable: true,
    writable: true
  });
}

function loadModule() {
  return require("./workout.js");
}

function resetAndLoad({ restSecondsValue, storageData } = {}) {
  jest.resetModules();
  localStorage.clear();
  if (storageData) {
    Object.entries(storageData).forEach(([k, v]) =>
      localStorage.setItem(k, JSON.stringify(v))
    );
  }
  setupEnv({ restSecondsValue });
  return loadModule();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const dispatchInput = (el) => el.dispatchEvent(new Event("input", { bubbles: true }));
const dispatchChange = (el) => el.dispatchEvent(new Event("change", { bubbles: true }));
const fireKeydown = (target, key) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("workout.js", () => {
  let formatSeconds, storage, createSvg, activateDay, getTodayDayId, getLocalDateKey;

  beforeAll(() => {
    // Fix the system date to a Monday so the module's default-day-selection
    // logic (based on the current date) is deterministic across test runs.
    jest.useFakeTimers().setSystemTime(new Date("2026-08-03T09:00:00"));
    setupEnv();
    const exports = loadModule();
    ({ formatSeconds, storage, createSvg, activateDay, getTodayDayId, getLocalDateKey } = exports._test);
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  // =========================================================================
  // formatSeconds
  // =========================================================================
  describe("formatSeconds", () => {
    test("zero → 00:00", () => expect(formatSeconds(0)).toBe("00:00"));
    test("90 → 01:30", () => expect(formatSeconds(90)).toBe("01:30"));
    test("3661 → 61:01", () => expect(formatSeconds(3661)).toBe("61:01"));
    test("negative → 00:00", () => expect(formatSeconds(-10)).toBe("00:00"));
    test("NaN → 00:00 (|| 0 branch)", () => expect(formatSeconds(NaN)).toBe("00:00"));
    test("null → 00:00 (|| 0 branch)", () => expect(formatSeconds(null)).toBe("00:00"));
  });

  // =========================================================================
  // storage
  // =========================================================================
  describe("storage", () => {
    beforeEach(() => localStorage.clear());

    test("get: missing key returns fallback", () =>
      expect(storage.get("x", "fb")).toBe("fb"));

    test("get: existing key returns parsed value", () => {
      localStorage.setItem("k", JSON.stringify(42));
      expect(storage.get("k", null)).toBe(42);
    });

    test("get: getItem throws → fallback (catch branch)", () => {
      jest.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
        throw new Error("sec");
      });
      expect(storage.get("k", "safe")).toBe("safe");
    });

    test("get: invalid JSON → fallback (catch branch)", () => {
      localStorage.setItem("bad", "not-json{{");
      expect(storage.get("bad", "def")).toBe("def");
    });

    test("set: stores value, returns true", () => {
      expect(storage.set("a", { x: 1 })).toBe(true);
      expect(JSON.parse(localStorage.getItem("a"))).toEqual({ x: 1 });
    });

    test("set: setItem throws → returns false (catch branch)", () => {
      jest.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
        throw new Error("quota");
      });
      expect(storage.set("k", "v")).toBe(false);
    });
  });

  // =========================================================================
  // createSvg — all 8 known types + default
  // =========================================================================
  describe("createSvg", () => {
    const known = ["press", "pull", "squat", "cardio", "row", "split", "swing", "recovery"];

    test.each(known)("type '%s' creates a valid SVG", (type) => {
      const svg = createSvg(type, `${type} label`);
      expect(svg.tagName.toLowerCase()).toBe("svg");
      expect(svg.getAttribute("aria-label")).toBe(`${type} label`);
      expect(svg.querySelector("title").textContent).toBe(`${type} label`);
      expect(svg.children.length).toBeGreaterThan(1);
    });

    test.each(known)("type '%s' includes animated parts", (type) => {
      const svg = createSvg(type, `${type} label`);
      expect(svg.querySelectorAll('[class^="anim-"]').length).toBeGreaterThan(0);
    });

    test("unknown type renders default placeholder", () => {
      const svg = createSvg("__unknown__", "title");
      expect(svg.querySelector("rect")).not.toBeNull();
      expect(svg.querySelector("text").textContent).toBe("Exercise");
    });
  });

  // =========================================================================
  // initWorkoutProgram — side-effects after module load
  // =========================================================================
  describe("initWorkoutProgram", () => {
    test("renders 7 tab buttons", () =>
      expect(document.querySelectorAll(".tab-btn").length).toBe(7));

    test("renders 7 day panels", () =>
      expect(document.querySelectorAll(".day-section").length).toBe(7));

    test("today's tab is active by default", () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-08-05T09:00:00"));
      resetAndLoad();
      const activeTabs = document.querySelectorAll(".tab-btn.active");
      expect(activeTabs.length).toBe(1);
      expect(activeTabs[0].dataset.day).toBe(getTodayDayId());
    });

    test("timer display shows HH:MM format", () =>
      expect(document.getElementById("timer-display").textContent).toMatch(/^\d{2}:\d{2}$/));

    test("loads saved profile from localStorage", () => {
      const { _test } = resetAndLoad({
        storageData: {
          profile: { name: "Alice", age: "30", ethnicity: "East Asian", height: "5'5\"", weight: "60" }
        }
      });
      expect(document.getElementById("name-input").value).toBe("Alice");
      expect(document.getElementById("ethnicity-input").value).toBe("East Asian");
    });

    test("profile fields fall back to defaults when saved values are falsy (|| branches)", () => {
      resetAndLoad({
        storageData: { profile: { name: "", age: "", ethnicity: "", height: "", weight: "" } }
      });
      expect(document.getElementById("name-input").value).toBe("Tito");
      expect(document.getElementById("age-input").value).toBe("42");
      expect(document.getElementById("height-input").value).toBe("5'11\"");
      expect(document.getElementById("weight-input").value).toBe("77");
    });

    test("ethnicity falls back to Indian when saved value is not a valid option", () => {
      resetAndLoad({
        storageData: {
          profile: { name: "Bob", age: "40", ethnicity: "OldCustomValue", height: "6'0\"", weight: "80" }
        }
      });
      // "OldCustomValue" is not a <select> option → value becomes "" → falls back to "Indian"
      expect(document.getElementById("ethnicity-input").value).toBe("Indian");
    });

    test("loads prefs (notes + difficulty off) from localStorage", () => {
      resetAndLoad({ storageData: { prefs: { showNotes: false, showDifficulty: false } } });
      expect(document.getElementById("toggle-notes").checked).toBe(false);
      expect(document.getElementById("toggle-difficulty").checked).toBe(false);
      expect(document.getElementById("workout-content").classList.contains("hidden-notes")).toBe(true);
    });

    test("defaults to today's day when no saved selection exists", () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-08-05T09:00:00"));
      resetAndLoad();
      expect(document.getElementById("tab-wed").classList.contains("active")).toBe(true);
    });

    test("restores same-day saved day from localStorage", () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-08-05T09:00:00"));
      resetAndLoad({ storageData: { selectedDay: { dayId: "fri", dateKey: "2026-08-05" } } });
      expect(document.getElementById("tab-fri").classList.contains("active")).toBe(true);
    });

    test("ignores stale saved day from localStorage after the date changes", () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-08-05T09:00:00"));
      resetAndLoad({ storageData: { selectedDay: { dayId: "fri", dateKey: "2026-08-04" } } });
      expect(document.getElementById("tab-wed").classList.contains("active")).toBe(true);
    });

    test("restores saved timer seconds from localStorage", () => {
      resetAndLoad({ storageData: { timerSeconds: 120 } });
      expect(document.getElementById("rest-seconds").value).toBe("120");
      expect(document.getElementById("timer-display").textContent).toBe("02:00");
    });

    test("timer seconds fall back to 90 when saved value is 0 (|| 90 branch)", () => {
      resetAndLoad({ storageData: { timerSeconds: 0 } });
      expect(document.getElementById("rest-seconds").value).toBe("90");
    });

    test("module-level remainingSeconds falls back to 90 when rest-seconds input is empty (|| 90 branch)", () => {
      resetAndLoad({ restSecondsValue: "" });
      // Just verify the module loaded without error; the || 90 fallback runs at module scope
      expect(document.getElementById("timer-display").textContent).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  // =========================================================================
  // activateDay
  // =========================================================================
  describe("activateDay", () => {
    beforeEach(() => {
      activateDay = resetAndLoad()._test.activateDay;
    });

    test("activates correct tab and panel", () => {
      activateDay("wed");
      expect(document.getElementById("tab-wed").classList.contains("active")).toBe(true);
      expect(document.getElementById("panel-wed").hidden).toBe(false);
      expect(document.getElementById("tab-mon").classList.contains("active")).toBe(false);
    });

    test("falls back to first tab for unknown dayId", () => {
      activateDay("NOPE");
      expect(document.querySelector(".tab-btn.active")).toBe(document.querySelectorAll(".tab-btn")[0]);
    });

    test("focuses tab when focusTab is true", () => {
      const tab = document.getElementById("tab-fri");
      jest.spyOn(tab, "focus");
      activateDay("fri", true);
      expect(tab.focus).toHaveBeenCalled();
    });

    test("returns early without throwing when no tabs exist", () => {
      document.getElementById("day-tabs").innerHTML = "";
      document.getElementById("workout-content").innerHTML = "";
      expect(() => activateDay("mon")).not.toThrow();
    });

    test("saves selected day to localStorage", () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-08-08T09:00:00"));
      activateDay("sat");
      expect(JSON.parse(localStorage.getItem("selectedDay"))).toEqual({
        dayId: "sat",
        dateKey: "2026-08-08"
      });
    });
  });

  // =========================================================================
  // Date helpers
  // =========================================================================
  describe("date helpers", () => {
    test("getTodayDayId maps Date#getDay to workout ids", () => {
      expect(getTodayDayId(new Date("2026-08-02T09:00:00"))).toBe("sun");
      expect(getTodayDayId(new Date("2026-08-03T09:00:00"))).toBe("mon");
      expect(getTodayDayId(new Date("2026-08-08T09:00:00"))).toBe("sat");
    });

    test("getTodayDayId falls back to first workout day for out-of-range getDay()", () => {
      expect(getTodayDayId({ getDay: () => 99 })).toBe("mon");
    });

    test("getLocalDateKey returns YYYY-MM-DD in local time", () => {
      expect(getLocalDateKey(new Date("2026-08-03T09:00:00"))).toBe("2026-08-03");
    });
  });

  // =========================================================================
  // Tab click + keyboard navigation
  // =========================================================================
  describe("Tab navigation", () => {
    let tabsNav;

    beforeEach(() => {
      activateDay = resetAndLoad()._test.activateDay;
      tabsNav = document.getElementById("day-tabs");
    });

    test("click activates the target tab", () => {
      document.getElementById("tab-tue").click();
      expect(document.getElementById("tab-tue").classList.contains("active")).toBe(true);
    });

    test("click on tabsNav background (non-tab) is ignored", () => {
      const before = document.querySelector(".tab-btn.active").dataset.day;
      tabsNav.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(document.querySelector(".tab-btn.active").dataset.day).toBe(before);
    });

    test("ArrowRight moves to next tab", () => {
      activateDay("mon");
      fireKeydown(document.getElementById("tab-mon"), "ArrowRight");
      expect(document.getElementById("tab-tue").classList.contains("active")).toBe(true);
    });

    test("ArrowRight wraps from last to first", () => {
      activateDay("sun");
      fireKeydown(document.getElementById("tab-sun"), "ArrowRight");
      expect(document.getElementById("tab-mon").classList.contains("active")).toBe(true);
    });

    test("ArrowLeft moves to previous tab", () => {
      activateDay("tue");
      fireKeydown(document.getElementById("tab-tue"), "ArrowLeft");
      expect(document.getElementById("tab-mon").classList.contains("active")).toBe(true);
    });

    test("ArrowLeft wraps from first to last", () => {
      activateDay("mon");
      fireKeydown(document.getElementById("tab-mon"), "ArrowLeft");
      expect(document.getElementById("tab-sun").classList.contains("active")).toBe(true);
    });

    test("Home activates first tab", () => {
      activateDay("fri");
      fireKeydown(document.getElementById("tab-fri"), "Home");
      expect(document.getElementById("tab-mon").classList.contains("active")).toBe(true);
    });

    test("End activates last tab", () => {
      activateDay("mon");
      fireKeydown(document.getElementById("tab-mon"), "End");
      expect(document.getElementById("tab-sun").classList.contains("active")).toBe(true);
    });

    test("Enter activates current tab", () => {
      activateDay("tue");
      fireKeydown(document.getElementById("tab-tue"), "Enter");
      expect(document.getElementById("tab-tue").classList.contains("active")).toBe(true);
    });

    test("Space activates current tab", () => {
      activateDay("wed");
      fireKeydown(document.getElementById("tab-wed"), " ");
      expect(document.getElementById("tab-wed").classList.contains("active")).toBe(true);
    });

    test("unhandled key (Tab) is a no-op", () => {
      activateDay("mon");
      const before = document.querySelector(".tab-btn.active").dataset.day;
      fireKeydown(document.getElementById("tab-mon"), "Tab");
      expect(document.querySelector(".tab-btn.active").dataset.day).toBe(before);
    });

    test("keydown on tabsNav itself (non-.tab-btn target) is ignored", () => {
      const before = document.querySelector(".tab-btn.active").dataset.day;
      fireKeydown(tabsNav, "ArrowRight");
      expect(document.querySelector(".tab-btn.active").dataset.day).toBe(before);
    });
  });

  // =========================================================================
  // Visibility preferences
  // =========================================================================
  describe("Visibility preferences", () => {
    beforeEach(() => {
      resetAndLoad();
    });

    test("unchecking notes adds hidden-notes class", () => {
      const t = document.getElementById("toggle-notes");
      t.checked = false;
      dispatchChange(t);
      expect(document.getElementById("workout-content").classList.contains("hidden-notes")).toBe(true);
    });

    test("re-checking notes removes hidden-notes class", () => {
      const t = document.getElementById("toggle-notes");
      t.checked = false;
      dispatchChange(t);
      t.checked = true;
      dispatchChange(t);
      expect(document.getElementById("workout-content").classList.contains("hidden-notes")).toBe(false);
    });

    test("unchecking difficulty adds hidden-difficulty class", () => {
      const t = document.getElementById("toggle-difficulty");
      t.checked = false;
      dispatchChange(t);
      expect(document.getElementById("workout-content").classList.contains("hidden-difficulty")).toBe(true);
    });

    test("prefs are persisted to localStorage", () => {
      const notesToggle = document.getElementById("toggle-notes");
      notesToggle.checked = false;
      dispatchChange(notesToggle);

      const saved = JSON.parse(localStorage.getItem("prefs"));
      expect(saved.showNotes).toBe(false);
      expect(saved.showDifficulty).toBe(true);
      expect(saved.animate).toBe(true);
    });

    test("unchecking animation adds no-animation class and persists", () => {
      const t = document.getElementById("toggle-animation");
      t.checked = false;
      dispatchChange(t);
      expect(document.getElementById("workout-content").classList.contains("no-animation")).toBe(true);
      expect(JSON.parse(localStorage.getItem("prefs")).animate).toBe(false);
    });

    test("re-checking animation removes no-animation class", () => {
      const t = document.getElementById("toggle-animation");
      t.checked = false;
      dispatchChange(t);
      t.checked = true;
      dispatchChange(t);
      expect(document.getElementById("workout-content").classList.contains("no-animation")).toBe(false);
    });

    test("animation preference is restored from localStorage", () => {
      resetAndLoad({ storageData: { prefs: { showNotes: true, showDifficulty: true, animate: false } } });
      expect(document.getElementById("toggle-animation").checked).toBe(false);
      expect(document.getElementById("workout-content").classList.contains("no-animation")).toBe(true);
    });
  });

  // =========================================================================
  // Profile inputs & reset
  // =========================================================================
  describe("Profile inputs", () => {
    beforeEach(() => resetAndLoad());

    test("name input saves to localStorage", () => {
      const el = document.getElementById("name-input");
      el.value = "Charlie";
      dispatchInput(el);
      expect(JSON.parse(localStorage.getItem("profile")).name).toBe("Charlie");
    });

    test("age input saves to localStorage", () => {
      const el = document.getElementById("age-input");
      el.value = "35";
      dispatchInput(el);
      expect(JSON.parse(localStorage.getItem("profile")).age).toBe("35");
    });

    test("ethnicity select saves on change", () => {
      const el = document.getElementById("ethnicity-input");
      el.value = "East Asian";
      dispatchChange(el);
      expect(JSON.parse(localStorage.getItem("profile")).ethnicity).toBe("East Asian");
    });

    test("height input saves to localStorage", () => {
      const el = document.getElementById("height-input");
      el.value = "6'0\"";
      dispatchInput(el);
      expect(JSON.parse(localStorage.getItem("profile")).height).toBe("6'0\"");
    });

    test("weight input saves to localStorage", () => {
      const el = document.getElementById("weight-input");
      el.value = "85";
      dispatchInput(el);
      expect(JSON.parse(localStorage.getItem("profile")).weight).toBe("85");
    });

    test("Reset button restores all fields to defaults", () => {
      document.getElementById("name-input").value = "X";
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

    test("Reset button persists defaults to localStorage", () => {
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
      jest.useFakeTimers();
      resetAndLoad();
    });

    test("clicking Start begins countdown", () => {
      document.getElementById("rest-seconds").value = "10";
      document.getElementById("start-timer").click();
      expect(document.getElementById("timer-status").textContent).toBe("Running...");
      jest.advanceTimersByTime(3000);
      expect(document.getElementById("timer-display").textContent).toBe("00:07");
    });

    test("timer shows 00:00 when it reaches zero", () => {
      document.getElementById("rest-seconds").value = "5";
      document.getElementById("start-timer").click();
      jest.advanceTimersByTime(5000);
      expect(document.getElementById("timer-display").textContent).toBe("00:00");
    });

    test("timer shows Rest complete! + done class when it finishes", () => {
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

    test("webkitAudioContext fallback is used when AudioContext is undefined", () => {
      document.getElementById("rest-seconds").value = "5";
      const fakeCtx = {
        createOscillator: jest.fn(() => mockOscillator),
        createGain: jest.fn(() => mockGain),
        destination: {},
        currentTime: 0
      };
      window.AudioContext = undefined;
      window.webkitAudioContext = jest.fn(() => fakeCtx);
      document.getElementById("start-timer").click();
      jest.advanceTimersByTime(5000);
      expect(window.webkitAudioContext).toHaveBeenCalled();
    });

    test("Stop button halts the timer", () => {
      document.getElementById("rest-seconds").value = "30";
      document.getElementById("start-timer").click();
      jest.advanceTimersByTime(5000);
      document.getElementById("stop-timer").click();
      expect(document.getElementById("timer-status").textContent).toBe("Stopped.");
      jest.advanceTimersByTime(30000); // no crash
    });

    test("Stop when idle shows Stopped.", () => {
      document.getElementById("stop-timer").click();
      expect(document.getElementById("timer-status").textContent).toBe("Stopped.");
    });

    test("setTimerStatus with no kind gives base class only", () => {
      document.getElementById("rest-seconds").value = "10";
      document.getElementById("start-timer").click();
      document.getElementById("stop-timer").click();
      expect(document.getElementById("timer-status").className).toBe("timer-status");
    });

    test("input < 5 shows error message with error class", () => {
      document.getElementById("rest-seconds").value = "3";
      document.getElementById("start-timer").click();
      expect(document.getElementById("timer-status").textContent).toBe(
        "Please enter at least 5 seconds."
      );
      expect(document.getElementById("timer-status").className).toContain("error");
    });

    test("empty input shows error", () => {
      document.getElementById("rest-seconds").value = "";
      document.getElementById("start-timer").click();
      expect(document.getElementById("timer-status").textContent).toBe(
        "Please enter at least 5 seconds."
      );
    });

    test("timer seconds saved to localStorage on start", () => {
      document.getElementById("rest-seconds").value = "60";
      document.getElementById("start-timer").click();
      expect(JSON.parse(localStorage.getItem("timerSeconds"))).toBe(60);
    });
  });

  // =========================================================================
  // playNotificationTone — AudioContext error handling
  // =========================================================================
  describe("playNotificationTone error handling", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    test("swallows AudioContext constructor error silently", () => {
      jest.resetModules();
      localStorage.clear();
      document.body.innerHTML = domBody;
      window.AudioContext = jest.fn(() => {
        throw new Error("blocked");
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
      expect(() => jest.advanceTimersByTime(5000)).not.toThrow();
    });
  });

  // =========================================================================
  // Copy button
  // =========================================================================
  describe("Copy button", () => {
    let workoutContent;

    beforeEach(() => {
      jest.useFakeTimers();
      resetAndLoad();
      workoutContent = document.getElementById("workout-content");
    });

    test("uses clipboard API and shows Copied!", async () => {
      const btn = workoutContent.querySelector(".copy-btn");
      btn.click();
      await Promise.resolve();
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(btn.textContent).toBe("Copied!");
    });

    test("announcement element is populated on success", async () => {
      workoutContent.querySelector(".copy-btn").click();
      await Promise.resolve();
      expect(document.getElementById("copy-announcement").textContent).not.toBe("");
    });

    test("button and announcement reset after 1200 ms", async () => {
      const btn = workoutContent.querySelector(".copy-btn");
      btn.click();
      await Promise.resolve();
      jest.advanceTimersByTime(1200);
      expect(btn.textContent).toBe("Copy details");
      expect(document.getElementById("copy-announcement").textContent).toBe("");
    });

    test("falls back to execCommand when clipboard is unavailable", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
        writable: true
      });
      document.execCommand = jest.fn().mockReturnValue(true);
      workoutContent.querySelector(".copy-btn").click();
      await Promise.resolve();
      expect(document.execCommand).toHaveBeenCalledWith("copy");
    });

    test("shows Copy failed when execCommand fallback fails", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
        writable: true
      });
      document.execCommand = jest.fn().mockReturnValue(false);
      workoutContent.querySelector(".copy-btn").click();
      await Promise.resolve();
      const btn = workoutContent.querySelector(".copy-btn");
      expect(btn.textContent).toBe("Copy failed");
      expect(document.getElementById("copy-announcement").textContent).toBe(
        "Copy failed. Please try again."
      );
    });

    test("shows Copy failed when clipboard rejects", async () => {
      navigator.clipboard = { writeText: jest.fn().mockRejectedValue(new Error("denied")) };
      workoutContent.querySelector(".copy-btn").click();
      await Promise.resolve();
      await Promise.resolve();
      const btn = workoutContent.querySelector(".copy-btn");
      expect(btn.textContent).toBe("Copy failed");
      expect(document.getElementById("copy-announcement").textContent).toBe(
        "Copy failed. Please try again."
      );
    });

    test("copy with empty dataset.exercise (|| '{}' branch) does not throw", async () => {
      const btn = workoutContent.querySelector(".copy-btn");
      const originalData = btn.dataset.exercise;
      delete btn.dataset.exercise;
      btn.click();
      await Promise.resolve();
      expect(btn.textContent).toBe("Copied!");
      btn.dataset.exercise = originalData;
    });

    test("click on non-copy element is ignored", async () => {
      const title = workoutContent.querySelector(".exercise-title") || workoutContent;
      title.click();
      await Promise.resolve();
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });
  });
});
