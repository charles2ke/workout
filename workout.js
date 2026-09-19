// ===== Data =====

// Wrapped in an IIFE: these files are loaded as plain <script> tags, which share
// one global scope, so top-level declarations would otherwise collide.
(function () {

const WORKOUT_DATA = [
  {
    id: "mon",
    label: "Mon",
    title: "Monday: Upper Body Push & Pull",
    description: "Upper body strength and joint stability.",
    estimatedMinutes: 45,
    exercises: [
      {
        id: "bench-press-push-ups",
        name: "Bench Press / Push-ups",
        stats: "3 Sets • 8–12 Reps • 90s Rest",
        notes: "Retract shoulder blades; elbows tucked at 45°.",
        difficulty: "Moderate",
        restSeconds: 90,
        rounds: 3,
        illustration: "press"
      },
      {
        id: "lat-pulldowns-pull-ups",
        name: "Lat Pulldowns / Pull-ups",
        stats: "3 Sets • 8–10 Reps • 90s Rest",
        notes: "Drive with elbows down smoothly to upper chest.",
        difficulty: "Moderate",
        restSeconds: 90,
        rounds: 3,
        illustration: "pull"
      }
    ]
  },
  {
    id: "tue",
    label: "Tue",
    title: "Tuesday: Lower Body & Core",
    description: "Leg power with spine protection.",
    estimatedMinutes: 40,
    exercises: [
      {
        id: "goblet-squats",
        name: "Goblet Squats",
        stats: "3 Sets • 10–12 Reps • 90s Rest",
        notes: "Upright chest, sit between hips, knees out.",
        difficulty: "Moderate",
        restSeconds: 90,
        rounds: 3,
        illustration: "squat"
      }
    ]
  },
  {
    id: "wed",
    label: "Wed",
    title: "Wednesday: Active Recovery",
    description: "Aerobic base and joint mobility work.",
    estimatedMinutes: 30,
    exercises: [
      {
        id: "zone-2-cardio",
        name: "Zone 2 Cardio",
        stats: "30 Mins • HR 105–120 BPM",
        notes: "Brisk walk, light cycling, or light rowing.",
        difficulty: "Easy",
        restSeconds: 30,
        rounds: 1,
        illustration: "cardio"
      }
    ]
  },
  {
    id: "thu",
    label: "Thu",
    title: "Thursday: Upper Body Hypertrophy",
    description: "Posture strengthening and back alignment.",
    estimatedMinutes: 40,
    exercises: [
      {
        id: "single-arm-db-rows",
        name: "Single-Arm DB Rows",
        stats: "3 Sets • 10 Reps/side • 60s Rest",
        notes: "Pull dumbbell to hip, keeping elbow close.",
        difficulty: "Moderate",
        restSeconds: 60,
        rounds: 3,
        illustration: "row"
      }
    ]
  },
  {
    id: "fri",
    label: "Fri",
    title: "Friday: Lower Body & Posterior Chain",
    description: "Glutes and hamstrings for joint support.",
    estimatedMinutes: 40,
    exercises: [
      {
        id: "bulgarian-split-squats",
        name: "Bulgarian Split Squats",
        stats: "3 Sets • 8 Reps/leg • 90s Rest",
        notes: "Keep front foot flat; controls hip stability.",
        difficulty: "Hard",
        restSeconds: 90,
        rounds: 3,
        illustration: "split"
      }
    ]
  },
  {
    id: "sat",
    label: "Sat",
    title: "Saturday: Full Body Conditioning",
    description: "Endurance circuit and core strength.",
    estimatedMinutes: 35,
    exercises: [
      {
        id: "kettlebell-swings",
        name: "Kettlebell Swings",
        stats: "3 Rounds • 12–15 Reps",
        notes: "Explode from the hips; power comes from glutes.",
        difficulty: "Moderate",
        restSeconds: 45,
        rounds: 3,
        illustration: "swing"
      }
    ]
  },
  {
    id: "sun",
    label: "Sun",
    title: "Sunday: Rest & Recovery",
    description: "Full rest day for total muscle recovery.",
    estimatedMinutes: 20,
    exercises: [
      {
        id: "foam-rolling-walk",
        name: "Foam Rolling & Walk",
        stats: "15–20 Mins • Light Pressure",
        notes: "Focus on upper back, quads, and calves.",
        difficulty: "Easy",
        restSeconds: 30,
        rounds: 1,
        illustration: "recovery"
      }
    ]
  }
];

// ===== Utilities =====
/* istanbul ignore next -- browser global in the page, require() under Jest */
const Common = (typeof window !== "undefined" && window.WorkoutCommon) || require("./common.js");

/* istanbul ignore next -- browser global in the page, require() under Jest */
const Log = (typeof window !== "undefined" && window.WorkoutLog) || require("./workout-log.js");

const { storage, getLocalDateKey, formatSeconds, createElement, toNumber, loadPrefs } = Common;
const {
  LOG_FIELDS,
  exerciseKey,
  exerciseIdentity,
  validateLogValue,
  loadLog,
  getEntry,
  updateEntry,
  clearSession,
  sessionProgress,
  formatPerformance,
  lastPerformance,
  computeStreak,
  recentSessions
} = Log;

const DAY_IDS_BY_INDEX = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function getTodayDayId(date = new Date()) {
  return DAY_IDS_BY_INDEX[date.getDay()] || WORKOUT_DATA[0].id;
}

function getInitialDayId() {
  const todayId = getTodayDayId();
  const todayKey = getLocalDateKey();
  const savedDay = storage.get("selectedDay", null);

  if (
    savedDay &&
    typeof savedDay === "object" &&
    savedDay.dateKey === todayKey &&
    WORKOUT_DATA.some((day) => day.id === savedDay.dayId)
  ) {
    return savedDay.dayId;
  }

  return todayId;
}

function createSvg(illustration, titleText) {
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "0 0 100 60");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", titleText);

  const title = document.createElementNS(svgNs, "title");
  title.textContent = titleText;
  svg.appendChild(title);

  const add = (name, attrs) => {
    const el = document.createElementNS(svgNs, name);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
    svg.appendChild(el);
  };

  switch (illustration) {
    case "press":
      add("rect", { x: 15, y: 42, width: 70, height: 4, fill: "#475569" });
      add("circle", { cx: 25, cy: 35, r: 5, fill: "#38bdf8" });
      add("line", { x1: 28, y1: 37, x2: 65, y2: 37, stroke: "#38bdf8", "stroke-width": 4, class: "anim-press" });
      add("line", { x1: 45, y1: 15, x2: 45, y2: 35, stroke: "#cbd5e1", "stroke-width": 3, class: "anim-press" });
      break;
    case "pull":
      add("line", { x1: 20, y1: 10, x2: 80, y2: 10, stroke: "#cbd5e1", "stroke-width": 3 });
      add("circle", { cx: 50, cy: 28, r: 5, fill: "#38bdf8", class: "anim-pull" });
      add("line", { x1: 50, y1: 33, x2: 50, y2: 52, stroke: "#38bdf8", "stroke-width": 4, class: "anim-pull" });
      add("path", { d: "M 50 35 L 30 20 M 50 35 L 70 20", stroke: "#38bdf8", "stroke-width": 3, fill: "none", class: "anim-pull" });
      break;
    case "squat":
      add("circle", { cx: 40, cy: 20, r: 5, fill: "#38bdf8", class: "anim-squat" });
      add("path", { d: "M 40 25 L 40 38 L 25 45 L 25 58", stroke: "#38bdf8", "stroke-width": 4, fill: "none", class: "anim-squat" });
      add("circle", { cx: 48, cy: 28, r: 4, fill: "#cbd5e1", class: "anim-squat" });
      break;
    case "cardio":
      add("path", { d: "M 10 30 Q 30 10 50 30 T 90 30", fill: "none", stroke: "#38bdf8", "stroke-width": 3 });
      add("circle", { cx: 50, cy: 30, r: 4, fill: "#f8fafc", class: "anim-run" });
      break;
    case "row":
      add("rect", { x: 20, y: 38, width: 45, height: 4, fill: "#475569" });
      add("circle", { cx: 30, cy: 20, r: 5, fill: "#38bdf8" });
      add("path", { d: "M 45 28 L 45 42", stroke: "#38bdf8", "stroke-width": 3, class: "anim-row" });
      break;
    case "split":
      add("rect", { x: 70, y: 38, width: 20, height: 4, fill: "#475569" });
      add("circle", { cx: 42, cy: 18, r: 5, fill: "#38bdf8", class: "anim-squat" });
      add("path", { d: "M 42 23 L 42 40 L 35 58", stroke: "#38bdf8", "stroke-width": 4, fill: "none", class: "anim-squat" });
      break;
    case "swing":
      add("circle", { cx: 50, cy: 18, r: 5, fill: "#38bdf8" });
      add("path", { d: "M 40 48 Q 55 48 70 28", stroke: "#f8fafc", "stroke-width": 2, "stroke-dasharray": "2,2", fill: "none" });
      add("circle", { cx: 70, cy: 28, r: 4, fill: "#38bdf8", class: "anim-swing" });
      break;
    case "recovery":
      add("rect", { x: 25, y: 38, width: 50, height: 12, rx: 6, fill: "#475569", class: "anim-roll" });
      add("circle", { cx: 50, cy: 28, r: 5, fill: "#38bdf8", class: "anim-pulse" });
      break;
    default:
      add("rect", { x: 10, y: 12, width: 80, height: 36, rx: 6, fill: "#334155" });
      add("text", { x: 50, y: 34, "text-anchor": "middle", fill: "#cbd5e1", "font-size": 8 });
      svg.lastChild.textContent = "Exercise";
  }

  return svg;
}

// ===== UI Rendering =====
const tabsNav = document.getElementById("day-tabs");
const workoutContent = document.getElementById("workout-content");
const nameInput = document.getElementById("name-input");
const ageInput = document.getElementById("age-input");
const ethnicityInput = document.getElementById("ethnicity-input");
const heightInput = document.getElementById("height-input");
const weightInput = document.getElementById("weight-input");
const copyAnnouncement = document.getElementById("copy-announcement");
const streakDisplay = document.getElementById("streak-display");
const historyList = document.getElementById("history-list");
const historyEmpty = document.getElementById("history-empty");
const clearTodayButton = document.getElementById("clear-today-log");

// ===== Workout log =====
let workoutLog = loadLog();

function exerciseIdentitiesFor(day) {
  return day.exercises.map((exercise) => ({
    key: exerciseIdentity(exercise),
    legacyKey: exerciseKey(exercise.name)
  }));
}

function lastPerformanceText(key, todayKey, legacyKey) {
  const previous = lastPerformance(workoutLog, key, todayKey, legacyKey);
  if (!previous) return "No previous entry yet — today sets the baseline.";
  return `Last time (${previous.dateKey}): ${formatPerformance(previous.entry)}`;
}

// One side of a counter-style control: taps adjust the sibling number input by
// a single step and re-use the existing change handler to persist the value.
function createStepperButton(field, delta, label, exerciseName) {
  const decreasing = delta < 0;
  return createElement("button", {
    className: `stepper-btn${decreasing ? " decrease" : " increase"}`,
    text: decreasing ? "\u2212" : "+",
    attrs: {
      type: "button",
      "data-step-field": field,
      "data-step-delta": String(delta),
      "aria-label": `${decreasing ? "Decrease" : "Increase"} ${label.toLowerCase()} for ${exerciseName}`
    }
  });
}

// Builds the per-exercise log controls: a done checkbox, the sets/reps/weight
// actually performed, and what to beat from the last time it was recorded.
// The exercise name goes into every accessible name so a screen-reader user
// navigating the form controls knows which exercise they are updating.
function createLogControls(exerciseName, key, todayKey, legacyKey) {
  const entry = getEntry(workoutLog, todayKey, key, legacyKey);

  const checkbox = createElement("input", {
    className: "log-check",
    attrs: { type: "checkbox", "data-log-field": "done", "aria-label": `Mark ${exerciseName} complete` }
  });
  checkbox.checked = entry.done;

  const fields = LOG_FIELDS.map(({ field, label, min, max, step, counter }) => {
    const input = createElement("input", {
      className: "log-input",
      attrs: {
        type: "number",
        min: String(min),
        max: String(max),
        step: String(step),
        inputmode: "decimal",
        "data-log-field": field,
        "aria-label": `${label} performed for ${exerciseName}`
      }
    });
    input.value = entry[field] === null ? "" : String(entry[field]);
    // Whole-number fields get counter-style steppers so a set or rep can be
    // added with one tap mid-workout instead of typing into a number field.
    // A <label> may only wrap one labelable control, so counters use a plain
    // wrapper plus a text span; every control already has its own aria-label.
    if (counter) {
      return createElement("div", {
        className: "log-field log-counter",
        children: [
          createElement("span", { className: "log-field-text", text: label }),
          createStepperButton(field, -step, label, exerciseName),
          input,
          createStepperButton(field, step, label, exerciseName)
        ]
      });
    }
    return createElement("label", { className: "log-field", text: label, children: [input] });
  });

  return createElement("div", {
    className: "exercise-log",
    children: [
      createElement("label", { className: "log-done", text: "Done", children: [checkbox] }),
      createElement("div", { className: "log-fields", children: fields }),
      createElement("p", { className: "log-last", text: lastPerformanceText(key, todayKey, legacyKey) })
    ]
  });
}

// Per-exercise rest timer: the athlete taps "Round done" after finishing a
// round (set) and the countdown for that exercise's own rest interval starts,
// repeating until every round of the exercise is complete.
function createRestTimer(exercise) {
  // Every exercise in WORKOUT_DATA declares both values.
  const rounds = Number(exercise.rounds);
  const restSeconds = Number(exercise.restSeconds);

  const display = createElement("p", {
    className: "rest-display",
    text: formatSeconds(restSeconds),
    attrs: { role: "timer", "aria-label": `Rest remaining for ${exercise.name}` }
  });

  const startButton = createElement("button", {
    className: "button rest-start",
    text: "Round done \u2014 rest",
    attrs: { type: "button", "data-rest-start": "", "aria-label": `Finish a round of ${exercise.name} and start the rest timer` }
  });

  const skipButton = createElement("button", {
    className: "button secondary rest-skip",
    text: "Skip rest",
    attrs: { type: "button", "data-rest-skip": "", "aria-label": `Skip the rest timer for ${exercise.name}` }
  });
  skipButton.disabled = true;

  return createElement("div", {
    className: "exercise-rest",
    attrs: {
      "data-rest-seconds": String(restSeconds),
      "data-rest-rounds": String(rounds),
      "data-rest-round": "0"
    },
    children: [
      createElement("div", {
        className: "rest-head",
        children: [
          createElement("h4", { className: "rest-title", text: `Rest timer \u00b7 ${restSeconds}s` }),
          display
        ]
      }),
      createElement("div", { className: "rest-actions", children: [startButton, skipButton] }),
      createElement("p", {
        className: "rest-status",
        text: `Round 1 of ${rounds} \u2014 tap when the round is done.`,
        attrs: { role: "status" }
      })
    ]
  });
}

function renderTabs(days) {
  const fragment = document.createDocumentFragment();
  days.forEach((day, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab-btn";
    button.role = "tab";
    button.id = `tab-${day.id}`;
    button.dataset.day = day.id;
    button.setAttribute("aria-controls", `panel-${day.id}`);
    button.setAttribute("aria-selected", "false");
    button.setAttribute("aria-label", `Show workout for ${day.title}`);
    button.tabIndex = index === 0 ? 0 : -1;
    button.textContent = day.label;
    fragment.appendChild(button);
  });
  tabsNav.replaceChildren(fragment);
}

function renderDays(days) {
  // Any running rest timer belongs to a card that is about to be replaced.
  stopActiveRest();
  const fragment = document.createDocumentFragment();
  const todayKey = getLocalDateKey();

  days.forEach((day) => {
    const section = document.createElement("section");
    section.className = "day-section";
    section.id = `panel-${day.id}`;
    section.setAttribute("role", "tabpanel");
    section.setAttribute("aria-labelledby", `tab-${day.id}`);

    const header = document.createElement("div");
    header.className = "day-header";

    const title = document.createElement("h2");
    title.className = "day-title";
    title.textContent = day.title;

    const desc = document.createElement("p");
    desc.className = "day-desc";
    desc.textContent = day.description;

    const eta = document.createElement("p");
    eta.className = "day-time";
    eta.textContent = `Estimated completion time: ${day.estimatedMinutes} mins`;

    const progress = createElement("p", {
      className: "day-progress",
      attrs: { id: `progress-${day.id}`, "aria-live": "polite" }
    });

    header.append(title, desc, eta, progress);

    const grid = document.createElement("section");
    grid.className = "exercise-grid";
    grid.setAttribute("aria-label", `${day.label} exercises`);

    day.exercises.forEach((exercise) => {
      const card = document.createElement("article");
      card.className = "exercise-card";

      const svgContainer = document.createElement("div");
      svgContainer.className = "svg-container";
      svgContainer.appendChild(createSvg(exercise.illustration, `${exercise.name} illustration`));

      const info = document.createElement("div");
      info.className = "exercise-info";

      const exerciseTitle = document.createElement("h3");
      exerciseTitle.className = "exercise-title";
      exerciseTitle.textContent = exercise.name;

      const stats = document.createElement("p");
      stats.className = "exercise-stats";
      stats.textContent = exercise.stats;

      const difficulty = document.createElement("p");
      difficulty.className = "exercise-difficulty";
      difficulty.textContent = `Difficulty: ${exercise.difficulty}`;

      const notes = document.createElement("p");
      notes.className = "exercise-notes";
      notes.textContent = exercise.notes;

      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "button copy-btn";
      copyButton.dataset.exercise = JSON.stringify({
        day: day.title,
        name: exercise.name,
        stats: exercise.stats,
        notes: exercise.notes,
        difficulty: exercise.difficulty
      });
      copyButton.setAttribute("aria-label", `Copy details for ${exercise.name}`);
      copyButton.textContent = "Copy details";

      const key = exerciseIdentity(exercise);
      const legacyKey = exercise.id ? exerciseKey(exercise.name) : null;
      card.dataset.exerciseKey = key;
      card.dataset.legacyExerciseKey = legacyKey || "";
      card.dataset.dayId = day.id;

      info.append(
        exerciseTitle,
        stats,
        difficulty,
        notes,
        copyButton,
        createLogControls(exercise.name, key, todayKey, legacyKey),
        createRestTimer(exercise)
      );
      card.append(svgContainer, info);
      grid.appendChild(card);
    });

    section.append(header, grid);
    fragment.appendChild(section);
  });

  workoutContent.replaceChildren(fragment);
}

let currentDayId = WORKOUT_DATA[0].id;

function activateDay(dayId, focusTab = false) {
  const tabs = Array.from(document.querySelectorAll(".tab-btn"));
  const panels = Array.from(document.querySelectorAll(".day-section"));
  const selectedTab = tabs.find((tab) => tab.dataset.day === dayId) || tabs[0];
  if (!selectedTab) {
    return;
  }

  const selectedId = selectedTab.dataset.day;

  tabs.forEach((tab) => {
    const isActive = tab.dataset.day === selectedId;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });

  panels.forEach((panel) => {
    const isActive = panel.id === `panel-${selectedId}`;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });

  currentDayId = selectedId;
  storage.set("selectedDay", { dayId: selectedId, dateKey: getLocalDateKey() });
  if (focusTab) {
    selectedTab.focus();
  }
}

// ===== Interaction =====
tabsNav.addEventListener("click", (event) => {
  const tab = event.target.closest(".tab-btn");
  if (!tab) {
    return;
  }
  activateDay(tab.dataset.day);
});

tabsNav.addEventListener("keydown", (event) => {
  const currentTab = event.target.closest(".tab-btn");
  if (!currentTab) {
    return;
  }

  const tabs = Array.from(document.querySelectorAll(".tab-btn"));
  const currentIndex = tabs.indexOf(currentTab);
  let nextIndex;

  if (event.key === "ArrowRight") {
    nextIndex = (currentIndex + 1) % tabs.length;
  } else if (event.key === "ArrowLeft") {
    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = tabs.length - 1;
  } else if (event.key === "Enter" || event.key === " ") {
    activateDay(currentTab.dataset.day);
    return;
  } else {
    return;
  }

  event.preventDefault();
  activateDay(tabs[nextIndex].dataset.day, true);
});

workoutContent.addEventListener("click", async (event) => {
  const copyBtn = event.target.closest(".copy-btn");
  if (!copyBtn) {
    return;
  }

  try {
    const details = JSON.parse(copyBtn.dataset.exercise || "{}");
    const text = `${details.day}\n${details.name}\n${details.stats}\nDifficulty: ${details.difficulty}\n${details.notes}`;

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const fallbackInput = document.createElement("textarea");
      fallbackInput.value = text;
      fallbackInput.style.position = "fixed";
      fallbackInput.style.left = "-9999px";
      document.body.appendChild(fallbackInput);
      try {
        fallbackInput.select();
        if (!document.execCommand("copy")) {
          throw new Error("Copy failed.");
        }
      } catch {
        throw new Error("Copy failed.");
      } finally {
        fallbackInput.remove();
      }
    }

    copyBtn.textContent = "Copied!";
    copyAnnouncement.textContent = `Copied details for ${details.name}`;
    window.setTimeout(() => {
      copyBtn.textContent = "Copy details";
      copyAnnouncement.textContent = "";
    }, 1200);
  } catch {
    copyBtn.textContent = "Copy failed";
    copyAnnouncement.textContent = "Copy failed. Please try again.";
  }
});

// ===== Log rendering =====
function renderProgress() {
  const todayKey = getLocalDateKey();
  for (const day of WORKOUT_DATA) {
    const element = document.getElementById(`progress-${day.id}`);
    /* istanbul ignore next -- the element is always rendered with its day */
    if (!element) continue;
    const { done, total } = sessionProgress(workoutLog, todayKey, exerciseIdentitiesFor(day));
    element.textContent = `Today: ${done} of ${total} exercise(s) complete`;
    element.classList.toggle("complete", total > 0 && done === total);
  }
}

function dayTitleFor(dayId) {
  const day = WORKOUT_DATA.find((item) => item.id === dayId);
  return day ? day.title : "Workout";
}

function renderHistory() {
  const streak = computeStreak(workoutLog);
  streakDisplay.textContent =
    streak > 0
      ? `Current streak: ${streak} day(s) in a row.`
      : "No streak yet — tick off an exercise to start one.";

  const sessions = recentSessions(workoutLog);
  historyEmpty.hidden = sessions.length > 0;

  historyList.replaceChildren(
    ...sessions.map((session) =>
      createElement("li", {
        className: "history-item",
        text: `${session.dateKey} · ${dayTitleFor(session.dayId)} · ${session.completed} of ${session.logged} logged exercise(s) complete`
      })
    )
  );

  clearTodayButton.disabled = !workoutLog[getLocalDateKey()];
}

function refreshLogViews() {
  renderProgress();
  renderHistory();
}

// Delegated so the controls survive re-renders of the day panels.
workoutContent.addEventListener("change", (event) => {
  const control = event.target.closest("[data-log-field]");
  if (!control) {
    return;
  }

  const card = control.closest(".exercise-card");
  const field = control.dataset.logField;

  let patch;
  if (field === "done") {
    patch = { done: control.checked };
  } else {
    // A number input exposes unparsable text as an empty value plus badInput,
    // so an empty string alone cannot be trusted to mean "cleared".
    const badInput = Boolean(control.validity && control.validity.badInput);
    const { valid, value } = badInput
      ? { valid: false, value: null }
      : validateLogValue(field, control.value);
    control.classList.toggle("is-invalid", !valid);
    control.setAttribute("aria-invalid", valid ? "false" : "true");
    if (!valid) return;
    patch = { [field]: value };
  }

  workoutLog = updateEntry(
    workoutLog,
    getLocalDateKey(),
    card.dataset.dayId,
    card.dataset.exerciseKey,
    patch,
    card.dataset.legacyExerciseKey
  );
  refreshLogViews();
});

clearTodayButton.addEventListener("click", () => {
  workoutLog = clearSession(workoutLog, getLocalDateKey());
  renderDays(WORKOUT_DATA);
  activateDay(currentDayId);
  refreshLogViews();
});

// Display preferences are edited on the settings page, so they are read back
// from storage here — on load and whenever the page is shown again (including
// when it comes back from the browser's back/forward cache after a settings
// change).
function applyVisibilityPreferences() {
  const prefs = loadPrefs();
  workoutContent.classList.toggle("hidden-notes", !prefs.showNotes);
  workoutContent.classList.toggle("hidden-difficulty", !prefs.showDifficulty);
  workoutContent.classList.toggle("no-animation", !prefs.animate);
}

window.addEventListener("pageshow", applyVisibilityPreferences);

function applyProfilePreferences() {
  storage.set("profile", {
    name: nameInput.value,
    age: ageInput.value,
    ethnicity: ethnicityInput.value,
    height: heightInput.value,
    weight: weightInput.value
  });
}

nameInput.addEventListener("input", applyProfilePreferences);
ageInput.addEventListener("input", applyProfilePreferences);
ethnicityInput.addEventListener("change", applyProfilePreferences);
heightInput.addEventListener("input", applyProfilePreferences);
weightInput.addEventListener("input", applyProfilePreferences);

const PROFILE_DEFAULTS = { name: "Tito", age: "42", ethnicity: "Indian", height: "5'11\"", weight: "77" };

document.getElementById("reset-profile-btn").addEventListener("click", function () {
  nameInput.value = PROFILE_DEFAULTS.name;
  ageInput.value = PROFILE_DEFAULTS.age;
  ethnicityInput.value = PROFILE_DEFAULTS.ethnicity;
  heightInput.value = PROFILE_DEFAULTS.height;
  weightInput.value = PROFILE_DEFAULTS.weight;
  applyProfilePreferences();
});

// ===== Rest Timer =====
const restSecondsInput = document.getElementById("rest-seconds");
const startTimerButton = document.getElementById("start-timer");
const stopTimerButton = document.getElementById("stop-timer");
const timerDisplay = document.getElementById("timer-display");
const timerStatus = document.getElementById("timer-status");

let timerHandle = null;
let remainingSeconds = Number(restSecondsInput.value) || 90;

function updateTimerDisplay(seconds) {
  timerDisplay.textContent = formatSeconds(seconds);
}

function setTimerStatus(text, kind) {
  timerStatus.textContent = text;
  timerStatus.className = `timer-status${kind ? ` ${kind}` : ""}`;
}

function playNotificationTone() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gain.gain.setValueAtTime(0.15, audioContext.currentTime);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.25);
  } catch {
    // If audio is blocked by browser settings, keep visual notification only.
  }
}

function stopTimer(message = "Stopped.", kind = "") {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  setTimerStatus(message, kind);
}

function startTimer() {
  const inputSeconds = Number(restSecondsInput.value);
  if (!Number.isFinite(inputSeconds) || inputSeconds < 5) {
    setTimerStatus("Please enter at least 5 seconds.", "error");
    return;
  }

  remainingSeconds = Math.floor(inputSeconds);
  storage.set("timerSeconds", remainingSeconds);
  updateTimerDisplay(remainingSeconds);
  stopTimer("Running...");

  timerHandle = window.setInterval(() => {
    remainingSeconds -= 1;
    updateTimerDisplay(remainingSeconds);

    if (remainingSeconds <= 0) {
      stopTimer("Rest complete!", "done");
      playNotificationTone();
    }
  }, 1000);
}

startTimerButton.addEventListener("click", startTimer);
stopTimerButton.addEventListener("click", () => stopTimer());

// ===== Per-exercise rest timers =====
// Only one rest timer runs at a time: starting a rest anywhere stops the one
// that was already counting down, so the page never ticks two countdowns.
let activeRest = null;

function restPanelState(panel) {
  return {
    rounds: Number(panel.dataset.restRounds),
    restSeconds: Number(panel.dataset.restSeconds),
    round: Number(panel.dataset.restRound)
  };
}

function setRestStatus(panel, text, kind = "") {
  const status = panel.querySelector(".rest-status");
  status.textContent = text;
  status.className = `rest-status${kind ? ` ${kind}` : ""}`;
}

function setRestDisplay(panel, seconds) {
  panel.querySelector(".rest-display").textContent = formatSeconds(seconds);
}

// A rest cut short by starting another exercise's rest would otherwise keep a
// frozen countdown and a "resting…" status, so reset it to its idle state.
function markRestInterrupted(panel) {
  const { rounds, restSeconds, round } = restPanelState(panel);
  setRestDisplay(panel, restSeconds);
  setRestStatus(panel, `Rest interrupted — start round ${round + 1} of ${rounds}.`);
}

function stopActiveRest({ interrupted = false } = {}) {
  if (!activeRest) return;
  const { panel } = activeRest;
  clearInterval(activeRest.handle);
  panel.classList.remove("resting");
  panel.querySelector(".rest-skip").disabled = true;
  activeRest = null;
  if (interrupted) markRestInterrupted(panel);
}

function startRestAfterRound(panel) {
  if (activeRest?.panel === panel) return;
  stopActiveRest({ interrupted: true });

  const { rounds, restSeconds, round } = restPanelState(panel);
  const completedRounds = round + 1;
  panel.dataset.restRound = String(completedRounds);

  if (completedRounds >= rounds) {
    setRestDisplay(panel, 0);
    setRestStatus(panel, `All ${rounds} round(s) complete — no rest needed.`, "done");
    panel.querySelector(".rest-start").disabled = true;
    return;
  }

  let remainingRestSeconds = restSeconds;
  setRestDisplay(panel, remainingRestSeconds);
  setRestStatus(panel, `Round ${completedRounds} of ${rounds} done — resting…`);
  panel.classList.add("resting");
  panel.querySelector(".rest-skip").disabled = false;

  const handle = window.setInterval(() => {
    remainingRestSeconds -= 1;
    setRestDisplay(panel, remainingRestSeconds);

    if (remainingRestSeconds <= 0) {
      stopActiveRest();
      setRestStatus(panel, `Rest complete — start round ${completedRounds + 1} of ${rounds}.`, "done");
      playNotificationTone();
    }
  }, 1000);

  activeRest = { panel, handle };
}

function skipRest(panel) {
  const { rounds, round } = restPanelState(panel);
  stopActiveRest();
  setRestDisplay(panel, 0);
  setRestStatus(panel, `Rest skipped — start round ${round + 1} of ${rounds}.`);
}

workoutContent.addEventListener("click", (event) => {
  const restStart = event.target.closest("[data-rest-start]");
  if (restStart) {
    startRestAfterRound(restStart.closest(".exercise-rest"));
    return;
  }

  const restSkip = event.target.closest("[data-rest-skip]");
  if (restSkip) {
    skipRest(restSkip.closest(".exercise-rest"));
  }
});

// ===== Counter-style sets/reps =====
workoutContent.addEventListener("click", (event) => {
  const stepper = event.target.closest("[data-step-delta]");
  if (!stepper) {
    return;
  }

  const field = stepper.dataset.stepField;
  const spec = LOG_FIELDS.find((candidate) => candidate.field === field);
  const input = stepper.closest(".log-field").querySelector(".log-input");
  const current = toNumber(input.value);
  const next = Math.min(spec.max, Math.max(spec.min, (current === null ? 0 : current) + Number(stepper.dataset.stepDelta)));

  input.value = String(next);
  input.classList.remove("is-invalid");
  input.setAttribute("aria-invalid", "false");
  input.dispatchEvent(new Event("change", { bubbles: true }));
});

// ===== Initialization =====
function initWorkoutProgram() {
  /* istanbul ignore next */
  if (!Array.isArray(WORKOUT_DATA) || WORKOUT_DATA.length === 0) {
    /* istanbul ignore next */
    workoutContent.textContent = "Workout program data is unavailable right now.";
    /* istanbul ignore next */
    return;
  }

  renderTabs(WORKOUT_DATA);
  renderDays(WORKOUT_DATA);

  applyVisibilityPreferences();

  const savedProfile = storage.get("profile", {
    name: "Tito",
    age: "42",
    ethnicity: "Indian",
    height: "5'11\"",
    weight: "77"
  });
  nameInput.value = savedProfile.name || "Tito";
  ageInput.value = savedProfile.age || "42";
  ethnicityInput.value = savedProfile.ethnicity || "Indian";
  if (!ethnicityInput.value) ethnicityInput.value = "Indian";
  heightInput.value = savedProfile.height || "5'11\"";
  weightInput.value = savedProfile.weight || "77";
  applyProfilePreferences();

  activateDay(getInitialDayId());
  refreshLogViews();

  const savedTimerSeconds = storage.get("timerSeconds", 90);
  restSecondsInput.value = Number(savedTimerSeconds) || 90;
  updateTimerDisplay(Number(restSecondsInput.value));
}

initWorkoutProgram();

// ===== Test Exports =====
/* istanbul ignore next */
if (typeof module !== "undefined") {
  module.exports = {
    _test: {
      ...Common,
      ...Log,
      createSvg,
      activateDay,
      getTodayDayId,
      renderDays,
      renderProgress,
      renderHistory,
      refreshLogViews,
      lastPerformanceText,
      dayTitleFor,
      WORKOUT_DATA
    }
  };
}
})();
