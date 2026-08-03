// ===== Data =====
const WORKOUT_DATA = [
  {
    id: "mon",
    label: "Mon",
    title: "Monday: Upper Body Push & Pull",
    description: "Upper body strength and joint stability.",
    estimatedMinutes: 45,
    exercises: [
      {
        name: "Bench Press / Push-ups",
        stats: "3 Sets • 8–12 Reps • 90s Rest",
        notes: "Retract shoulder blades; elbows tucked at 45°.",
        difficulty: "Moderate",
        restSeconds: 90,
        illustration: "press"
      },
      {
        name: "Lat Pulldowns / Pull-ups",
        stats: "3 Sets • 8–10 Reps • 90s Rest",
        notes: "Drive with elbows down smoothly to upper chest.",
        difficulty: "Moderate",
        restSeconds: 90,
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
        name: "Goblet Squats",
        stats: "3 Sets • 10–12 Reps • 90s Rest",
        notes: "Upright chest, sit between hips, knees out.",
        difficulty: "Moderate",
        restSeconds: 90,
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
        name: "Zone 2 Cardio",
        stats: "30 Mins • HR 105–120 BPM",
        notes: "Brisk walk, light cycling, or light rowing.",
        difficulty: "Easy",
        restSeconds: 30,
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
        name: "Single-Arm DB Rows",
        stats: "3 Sets • 10 Reps/side • 60s Rest",
        notes: "Pull dumbbell to hip, keeping elbow close.",
        difficulty: "Moderate",
        restSeconds: 60,
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
        name: "Bulgarian Split Squats",
        stats: "3 Sets • 8 Reps/leg • 90s Rest",
        notes: "Keep front foot flat; controls hip stability.",
        difficulty: "Hard",
        restSeconds: 90,
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
        name: "Kettlebell Swings",
        stats: "3 Rounds • 12–15 Reps",
        notes: "Explode from the hips; power comes from glutes.",
        difficulty: "Moderate",
        restSeconds: 45,
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
        name: "Foam Rolling & Walk",
        stats: "15–20 Mins • Light Pressure",
        notes: "Focus on upper back, quads, and calves.",
        difficulty: "Easy",
        restSeconds: 30,
        illustration: "recovery"
      }
    ]
  }
];

// ===== Utilities =====
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
  }
};

const DAY_IDS_BY_INDEX = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function getTodayDayId(date = new Date()) {
  return DAY_IDS_BY_INDEX[date.getDay()] || WORKOUT_DATA[0].id;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function formatSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
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
      add("line", { x1: 28, y1: 37, x2: 65, y2: 37, stroke: "#38bdf8", "stroke-width": 4 });
      add("line", { x1: 45, y1: 15, x2: 45, y2: 35, stroke: "#cbd5e1", "stroke-width": 3 });
      break;
    case "pull":
      add("line", { x1: 20, y1: 10, x2: 80, y2: 10, stroke: "#cbd5e1", "stroke-width": 3 });
      add("circle", { cx: 50, cy: 28, r: 5, fill: "#38bdf8" });
      add("line", { x1: 50, y1: 33, x2: 50, y2: 52, stroke: "#38bdf8", "stroke-width": 4 });
      add("path", { d: "M 50 35 L 30 20 M 50 35 L 70 20", stroke: "#38bdf8", "stroke-width": 3, fill: "none" });
      break;
    case "squat":
      add("circle", { cx: 40, cy: 20, r: 5, fill: "#38bdf8" });
      add("path", { d: "M 40 25 L 40 38 L 25 45 L 25 58", stroke: "#38bdf8", "stroke-width": 4, fill: "none" });
      add("circle", { cx: 48, cy: 28, r: 4, fill: "#cbd5e1" });
      break;
    case "cardio":
      add("path", { d: "M 10 30 Q 30 10 50 30 T 90 30", fill: "none", stroke: "#38bdf8", "stroke-width": 3 });
      add("circle", { cx: 50, cy: 30, r: 4, fill: "#f8fafc" });
      break;
    case "row":
      add("rect", { x: 20, y: 38, width: 45, height: 4, fill: "#475569" });
      add("circle", { cx: 30, cy: 20, r: 5, fill: "#38bdf8" });
      add("path", { d: "M 45 28 L 45 42", stroke: "#38bdf8", "stroke-width": 3 });
      break;
    case "split":
      add("rect", { x: 70, y: 38, width: 20, height: 4, fill: "#475569" });
      add("circle", { cx: 42, cy: 18, r: 5, fill: "#38bdf8" });
      add("path", { d: "M 42 23 L 42 40 L 35 58", stroke: "#38bdf8", "stroke-width": 4, fill: "none" });
      break;
    case "swing":
      add("circle", { cx: 50, cy: 18, r: 5, fill: "#38bdf8" });
      add("path", { d: "M 40 48 Q 55 48 70 28", stroke: "#f8fafc", "stroke-width": 2, "stroke-dasharray": "2,2", fill: "none" });
      add("circle", { cx: 70, cy: 28, r: 4, fill: "#38bdf8" });
      break;
    case "recovery":
      add("rect", { x: 25, y: 38, width: 50, height: 12, rx: 6, fill: "#475569" });
      add("circle", { cx: 50, cy: 28, r: 5, fill: "#38bdf8" });
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
const notesToggle = document.getElementById("toggle-notes");
const difficultyToggle = document.getElementById("toggle-difficulty");
const nameInput = document.getElementById("name-input");
const ageInput = document.getElementById("age-input");
const ethnicityInput = document.getElementById("ethnicity-input");
const heightInput = document.getElementById("height-input");
const weightInput = document.getElementById("weight-input");
const copyAnnouncement = document.getElementById("copy-announcement");

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
  const fragment = document.createDocumentFragment();

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

    header.append(title, desc, eta);

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

      info.append(exerciseTitle, stats, difficulty, notes, copyButton);
      card.append(svgContainer, info);
      grid.appendChild(card);
    });

    section.append(header, grid);
    fragment.appendChild(section);
  });

  workoutContent.replaceChildren(fragment);
}

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
  let nextIndex = currentIndex;

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
      fallbackInput.select();
      document.execCommand("copy");
      fallbackInput.remove();
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

function applyVisibilityPreferences() {
  workoutContent.classList.toggle("hidden-notes", !notesToggle.checked);
  workoutContent.classList.toggle("hidden-difficulty", !difficultyToggle.checked);
  storage.set("prefs", {
    showNotes: notesToggle.checked,
    showDifficulty: difficultyToggle.checked
  });
}

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
notesToggle.addEventListener("change", applyVisibilityPreferences);
difficultyToggle.addEventListener("change", applyVisibilityPreferences);

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

  const savedPrefs = storage.get("prefs", { showNotes: true, showDifficulty: true });
  notesToggle.checked = Boolean(savedPrefs.showNotes);
  difficultyToggle.checked = Boolean(savedPrefs.showDifficulty);
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

  const savedTimerSeconds = storage.get("timerSeconds", 90);
  restSecondsInput.value = Number(savedTimerSeconds) || 90;
  updateTimerDisplay(Number(restSecondsInput.value));
}

initWorkoutProgram();

// ===== Test Exports =====
/* istanbul ignore next */
if (typeof module !== "undefined") {
  module.exports = { _test: { formatSeconds, storage, createSvg, activateDay, getTodayDayId, getLocalDateKey } };
}
