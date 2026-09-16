"use strict";

function loadLogModule(stored) {
  jest.resetModules();
  localStorage.clear();
  if (stored !== undefined) {
    localStorage.setItem("workoutLog", typeof stored === "string" ? stored : JSON.stringify(stored));
  }
  return require("./workout-log.js");
}

describe("workout-log.js", () => {
  describe("exerciseKey", () => {
    const log = loadLogModule();
    test("slugs a name", () => expect(log.exerciseKey("Bench Press / Push-ups")).toBe("bench-press-push-ups"));
    test("trims leading and trailing separators", () => expect(log.exerciseKey("  !Zone 2 Cardio!  ")).toBe("zone-2-cardio"));
  });

  describe("exerciseIdentity", () => {
    const log = loadLogModule();
    test("uses the stable id when present", () => {
      expect(log.exerciseIdentity({ id: "goblet-squat", name: "Goblet Squats" })).toBe("goblet-squat");
    });
    test("falls back to a name slug when there is no id", () => {
      expect(log.exerciseIdentity({ name: "Goblet Squats" })).toBe("goblet-squats");
    });
  });

  describe("loadLog", () => {
    test("returns an empty log when nothing is stored", () => {
      expect(loadLogModule().loadLog()).toEqual({});
    });

    test("ignores a non-object payload", () => {
      expect(loadLogModule('"nope"').loadLog()).toEqual({});
    });

    test("ignores an array payload", () => {
      expect(loadLogModule([1, 2]).loadLog()).toEqual({});
    });

    test("ignores unparsable JSON", () => {
      expect(loadLogModule("{oops").loadLog()).toEqual({});
    });

    test("drops keys that are not date keys", () => {
      const api = loadLogModule({ yesterday: { dayId: "mon", entries: { squat: { done: true } } } });
      expect(api.loadLog()).toEqual({});
    });

    test("drops sessions that are not objects", () => {
      expect(loadLogModule({ "2026-09-16": 7 }).loadLog()).toEqual({});
    });

    test("drops sessions whose entries are all empty", () => {
      const api = loadLogModule({ "2026-09-16": { dayId: "wed", entries: { squat: { done: false }, row: "bad" } } });
      expect(api.loadLog()).toEqual({});
    });

    test("drops sessions with no entries object at all", () => {
      expect(loadLogModule({ "2026-09-16": { dayId: "wed" } }).loadLog()).toEqual({});
    });

    test("keeps and normalizes valid sessions", () => {
      const api = loadLogModule({
        "2026-09-16": { dayId: 42, entries: { squat: { done: true, sets: "3", reps: "8", weight: "20.5" } } }
      });
      expect(api.loadLog()).toEqual({
        "2026-09-16": { dayId: "", entries: { squat: { done: true, sets: 3, reps: 8, weight: 20.5 } } }
      });
    });

    test("keeps an entry recorded with numbers but not marked done", () => {
      const api = loadLogModule({ "2026-09-16": { dayId: "wed", entries: { squat: { sets: 3 } } } });
      expect(api.loadLog()["2026-09-16"].entries.squat).toEqual({ done: false, sets: 3, reps: null, weight: null });
    });

    test("drops stored measurements that violate field constraints", () => {
      const api = loadLogModule({
        "2026-09-16": {
          dayId: "wed",
          entries: {
            squat: { done: true, sets: -1, reps: 8, weight: 20.25 },
            row: { sets: 100 }
          }
        }
      });
      expect(api.loadLog()).toEqual({
        "2026-09-16": {
          dayId: "wed",
          entries: { squat: { done: true, sets: null, reps: 8, weight: null } }
        }
      });
    });
  });

  describe("saveLog / getEntry", () => {
    test("round-trips through localStorage", () => {
      const api = loadLogModule();
      api.saveLog({ "2026-09-16": { dayId: "wed", entries: { squat: { done: true, sets: null, reps: null, weight: null } } } });
      expect(api.loadLog()["2026-09-16"].entries.squat.done).toBe(true);
    });

    test("getEntry returns a blank entry for an unlogged exercise", () => {
      const api = loadLogModule();
      expect(api.getEntry({}, "2026-09-16", "squat")).toEqual({ done: false, sets: null, reps: null, weight: null });
    });

    test("getEntry returns a blank entry when the day exists but the exercise does not", () => {
      const api = loadLogModule();
      const log = { "2026-09-16": { dayId: "wed", entries: { row: { done: true } } } };
      expect(api.getEntry(log, "2026-09-16", "squat").done).toBe(false);
    });

    test("getEntry returns a copy, not the stored object", () => {
      const api = loadLogModule();
      const stored = { done: true, sets: 3, reps: 8, weight: 20 };
      const log = { "2026-09-16": { dayId: "wed", entries: { squat: stored } } };
      const entry = api.getEntry(log, "2026-09-16", "squat");
      entry.sets = 99;
      expect(stored.sets).toBe(3);
    });

    test("getEntry falls back to a legacy key when the current key is not found", () => {
      const api = loadLogModule();
      const log = { "2026-09-16": { dayId: "wed", entries: { "goblet-squats": { done: true } } } };
      expect(api.getEntry(log, "2026-09-16", "goblet-squat", "goblet-squats").done).toBe(true);
    });

    test("getEntry ignores the legacy key when it is the same as the current key", () => {
      const api = loadLogModule();
      const log = { "2026-09-16": { dayId: "wed", entries: {} } };
      expect(api.getEntry(log, "2026-09-16", "squat", "squat").done).toBe(false);
    });
  });

  describe("updateEntry", () => {
    test("creates a session and persists it", () => {
      const api = loadLogModule();
      const log = api.updateEntry({}, "2026-09-16", "wed", "squat", { done: true });
      expect(log["2026-09-16"]).toEqual({ dayId: "wed", entries: { squat: { done: true, sets: null, reps: null, weight: null } } });
      expect(api.loadLog()["2026-09-16"].entries.squat.done).toBe(true);
    });

    test("merges into an existing entry", () => {
      const api = loadLogModule();
      let log = api.updateEntry({}, "2026-09-16", "wed", "squat", { done: true });
      log = api.updateEntry(log, "2026-09-16", "wed", "squat", { sets: "3", reps: "8", weight: "20" });
      expect(log["2026-09-16"].entries.squat).toEqual({ done: true, sets: 3, reps: 8, weight: 20 });
    });

    test("keeps other exercises when one is cleared", () => {
      const api = loadLogModule();
      let log = api.updateEntry({}, "2026-09-16", "wed", "squat", { done: true });
      log = api.updateEntry(log, "2026-09-16", "wed", "row", { done: true });
      log = api.updateEntry(log, "2026-09-16", "wed", "row", { done: false });
      expect(Object.keys(log["2026-09-16"].entries)).toEqual(["squat"]);
    });

    test("removes the day once its last entry is cleared", () => {
      const api = loadLogModule();
      let log = api.updateEntry({}, "2026-09-16", "wed", "squat", { done: true });
      log = api.updateEntry(log, "2026-09-16", "wed", "squat", { done: false });
      expect(log).toEqual({});
      expect(api.loadLog()).toEqual({});
    });

    test("an entry with numbers but not done is still kept", () => {
      const api = loadLogModule();
      const log = api.updateEntry({}, "2026-09-16", "wed", "squat", { weight: "20" });
      expect(log["2026-09-16"].entries.squat).toEqual({ done: false, sets: null, reps: null, weight: 20 });
    });

    test("drops invalid existing measurements when updating another field", () => {
      const api = loadLogModule();
      const log = {
        "2026-09-16": {
          dayId: "wed",
          entries: { squat: { done: false, sets: -1, reps: 8, weight: 20.25 } }
        }
      };
      api.updateEntry(log, "2026-09-16", "wed", "squat", { reps: 10 });
      expect(log["2026-09-16"].entries.squat).toEqual({ done: false, sets: null, reps: 10, weight: null });
    });

    test("moves a legacy entry to the stable key when updating it", () => {
      const api = loadLogModule();
      const log = {
        "2026-09-16": {
          dayId: "wed",
          entries: { "goblet-squats": { done: true, sets: 3, reps: 8, weight: 20 } }
        }
      };
      api.updateEntry(log, "2026-09-16", "wed", "goblet-squat", { reps: "10" }, "goblet-squats");
      expect(log["2026-09-16"].entries).toEqual({
        "goblet-squat": { done: true, sets: 3, reps: 10, weight: 20 }
      });
    });

    test("removes a cleared legacy entry without leaving a duplicate", () => {
      const api = loadLogModule();
      const log = {
        "2026-09-16": { dayId: "wed", entries: { "goblet-squats": { done: true } } }
      };
      api.updateEntry(log, "2026-09-16", "wed", "goblet-squat", { done: false }, "goblet-squats");
      expect(log).toEqual({});
    });
  });

  describe("clearSession", () => {
    test("removes the day and persists the change", () => {
      const api = loadLogModule();
      const log = api.updateEntry({}, "2026-09-16", "wed", "squat", { done: true });
      expect(api.clearSession(log, "2026-09-16")).toEqual({});
      expect(api.loadLog()).toEqual({});
    });
  });

  describe("sessionProgress", () => {
    const api = loadLogModule();
    const log = {
      "2026-09-16": {
        dayId: "wed",
        entries: { squat: { done: true }, row: { done: false }, swing: { done: true } }
      }
    };

    test("counts only completed exercises from the day's plan", () => {
      expect(
        api.sessionProgress(log, "2026-09-16", [
          { key: "squat" },
          { key: "row" },
          { key: "press" }
        ])
      ).toEqual({ done: 1, total: 3 });
    });

    test("reports zero for a day with no session", () => {
      expect(api.sessionProgress(log, "2026-09-15", [{ key: "squat" }])).toEqual({ done: 0, total: 1 });
    });

    test("counts a completed entry stored under a legacy alias", () => {
      expect(
        api.sessionProgress(log, "2026-09-16", [
          { key: "goblet-squat", legacyKey: "squat" },
          { key: "press", legacyKey: "overhead-press" }
        ])
      ).toEqual({ done: 1, total: 2 });
    });
  });

  describe("formatPerformance", () => {
    const api = loadLogModule();
    const entry = (patch) => ({ done: true, sets: null, reps: null, weight: null, ...patch });

    test("sets and reps with weight", () => expect(api.formatPerformance(entry({ sets: 3, reps: 8, weight: 20 }))).toBe("3×8 @ 20 kg"));
    test("sets and reps without weight", () => expect(api.formatPerformance(entry({ sets: 3, reps: 8 }))).toBe("3×8"));
    test("sets only", () => expect(api.formatPerformance(entry({ sets: 3 }))).toBe("3 sets"));
    test("reps only", () => expect(api.formatPerformance(entry({ reps: 12 }))).toBe("12 reps"));
    test("weight only", () => expect(api.formatPerformance(entry({ weight: 20 }))).toBe("@ 20 kg"));
    test("nothing recorded", () => expect(api.formatPerformance(entry({}))).toBe(""));
    test("missing entry", () => expect(api.formatPerformance(null)).toBe(""));
  });

  describe("lastPerformance", () => {
    const api = loadLogModule();
    const log = {
      "2026-09-10": { dayId: "wed", entries: { squat: { done: true, sets: 3, reps: 8, weight: 18, } } },
      "2026-09-12": { dayId: "wed", entries: { squat: { done: true, sets: null, reps: null, weight: null } } },
      "2026-09-14": { dayId: "wed", entries: { squat: { done: true, sets: 3, reps: 10, weight: 20 } } },
      "2026-09-16": { dayId: "wed", entries: { squat: { done: true, sets: 4, reps: 10, weight: 22 } } }
    };

    test("returns the most recent day before the given date", () => {
      expect(api.lastPerformance(log, "squat", "2026-09-16")).toEqual({
        dateKey: "2026-09-14",
        entry: { done: true, sets: 3, reps: 10, weight: 20 }
      });
    });

    test("skips days where nothing measurable was recorded", () => {
      expect(api.lastPerformance(log, "squat", "2026-09-14").dateKey).toBe("2026-09-10");
    });

    test("returns null when there is no earlier entry", () => {
      expect(api.lastPerformance(log, "squat", "2026-09-10")).toBeNull();
    });

    test("returns null for an exercise never logged", () => {
      expect(api.lastPerformance(log, "burpee", "2026-09-16")).toBeNull();
    });

    test("falls back to a legacy key when the current key was never logged", () => {
      expect(api.lastPerformance(log, "goblet-squat", "2026-09-16", "squat")).toEqual({
        dateKey: "2026-09-14",
        entry: { done: true, sets: 3, reps: 10, weight: 20 }
      });
    });

    test("ignores the legacy key when it is the same as the current key", () => {
      expect(api.lastPerformance(log, "squat", "2026-09-16", "squat").dateKey).toBe("2026-09-14");
    });
  });

  describe("computeStreak", () => {
    const api = loadLogModule();
    const done = (dayId = "wed") => ({ dayId, entries: { squat: { done: true } } });

    test("no log means no streak", () => expect(api.computeStreak({}, "2026-09-16")).toBe(0));

    test("counts back from today", () => {
      const log = { "2026-09-16": done(), "2026-09-15": done(), "2026-09-14": done() };
      expect(api.computeStreak(log, "2026-09-16")).toBe(3);
    });

    test("an untrained today does not break yesterday's streak", () => {
      const log = { "2026-09-15": done(), "2026-09-14": done() };
      expect(api.computeStreak(log, "2026-09-16")).toBe(2);
    });

    test("a gap ends the streak", () => {
      const log = { "2026-09-16": done(), "2026-09-14": done() };
      expect(api.computeStreak(log, "2026-09-16")).toBe(1);
    });

    test("a day with entries but nothing completed does not count", () => {
      const log = { "2026-09-16": { dayId: "wed", entries: { squat: { done: false, sets: 3 } } } };
      expect(api.computeStreak(log, "2026-09-16")).toBe(0);
    });

    test("defaults to today when no date key is given", () => {
      expect(api.computeStreak({})).toBe(0);
    });
  });

  describe("recentSessions", () => {
    const api = loadLogModule();
    const log = {
      "2026-09-14": { dayId: "mon", entries: { squat: { done: true }, row: { done: false } } },
      "2026-09-16": { dayId: "wed", entries: { swing: { done: true } } }
    };

    test("returns newest first with completion counts", () => {
      expect(api.recentSessions(log)).toEqual([
        { dateKey: "2026-09-16", dayId: "wed", completed: 1, logged: 1 },
        { dateKey: "2026-09-14", dayId: "mon", completed: 1, logged: 2 }
      ]);
    });

    test("respects the limit", () => {
      expect(api.recentSessions(log, 1)).toHaveLength(1);
    });
  });

  describe("logRecords", () => {
    const api = loadLogModule();

    test("maps completed sessions into dashboard records", () => {
      const log = {
        "2026-09-16": { dayId: "wed", entries: { squat: { done: true }, row: { done: true } } },
        "2026-09-15": { dayId: "tue", entries: { squat: { done: false, sets: 3 } } }
      };
      expect(api.logRecords(log)).toEqual([
        {
          date: "2026-09-16",
          steps: null,
          restingHeartRate: null,
          sleepHours: null,
          activeCalories: null,
          vo2Max: null,
          exercisesCompleted: 2
        }
      ]);
    });

    test("an empty log yields no records", () => expect(api.logRecords({})).toEqual([]));
  });
});
