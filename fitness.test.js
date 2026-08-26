"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// DOM bootstrap — reuse the real fitness.html body so the module finds the
// elements it queries at import time.
// ---------------------------------------------------------------------------
const htmlPath = path.join(__dirname, "fitness.html");
const htmlContent = fs.readFileSync(htmlPath, "utf8");
const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
const domBody = bodyMatch ? bodyMatch[1] : "";

function resetAndLoad(storageData) {
  jest.resetModules();
  localStorage.clear();
  if (storageData) {
    Object.entries(storageData).forEach(([key, value]) =>
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value))
    );
  }
  document.body.innerHTML = domBody;
  return require("./fitness.js");
}

const dispatchChange = (el) => el.dispatchEvent(new Event("change", { bubbles: true }));

describe("fitness.js", () => {
  let api;

  beforeEach(() => {
    api = resetAndLoad()._test;
  });

  // =========================================================================
  // Parsing helpers
  // =========================================================================
  describe("toDateKey", () => {
    test("ISO timestamp → date key", () => expect(api.toDateKey("2026-08-20T10:00:00Z")).toBe("2026-08-20"));
    test("plain date string", () => expect(api.toDateKey("Aug 20, 2026")).toBe("2026-08-20"));
    test("epoch milliseconds", () => expect(api.toDateKey(String(new Date(2026, 7, 20).getTime()))).toBe("2026-08-20"));
    test("empty → null", () => expect(api.toDateKey("")).toBeNull());
    test("null → null", () => expect(api.toDateKey(null)).toBeNull());
    test("unparseable → null", () => expect(api.toDateKey("not-a-date")).toBeNull());
  });

  describe("toNumber", () => {
    test("numeric string with comma", () => expect(api.toNumber("12,345")).toBe(12345));
    test("number passthrough", () => expect(api.toNumber(42)).toBe(42));
    test("blank → null", () => expect(api.toNumber("")).toBeNull());
    test("undefined → null", () => expect(api.toNumber(undefined)).toBeNull());
    test("non-numeric → null", () => expect(api.toNumber("abc")).toBeNull());
  });

  describe("normalizeRecord", () => {
    test("maps Garmin-style keys", () => {
      expect(
        api.normalizeRecord({
          calendarDate: "2026-08-20",
          totalSteps: "10,500",
          restingHeartRate: 52,
          sleepDurationInSeconds: 27000,
          activeKilocalories: 700,
          vo2Max: 47
        })
      ).toEqual({
        date: "2026-08-20",
        steps: 10500,
        restingHeartRate: 52,
        sleepHours: 7.5,
        activeCalories: 700,
        vo2Max: 47
      });
    });

    test("converts sleep minutes to hours", () => {
      expect(api.normalizeRecord({ date: "2026-08-20", sleepMinutes: 450 }).sleepHours).toBe(7.5);
    });

    test("uses sleep hours directly", () => {
      expect(api.normalizeRecord({ date: "2026-08-20", sleepHours: 6.25 }).sleepHours).toBe(6.3);
    });

    test("missing metrics become null", () => {
      expect(api.normalizeRecord({ date: "2026-08-20" })).toEqual({
        date: "2026-08-20",
        steps: null,
        restingHeartRate: null,
        sleepHours: null,
        activeCalories: null,
        vo2Max: null
      });
    });

    test("record without a date → null", () => expect(api.normalizeRecord({ steps: 10 })).toBeNull());
    test("non-object → null", () => expect(api.normalizeRecord("nope")).toBeNull());
    test("array → null", () => expect(api.normalizeRecord([1, 2])).toBeNull());
    test("null → null", () => expect(api.normalizeRecord(null)).toBeNull());
  });

  describe("parseCsv", () => {
    test("parses headers and quoted cells", () => {
      const rows = api.parseCsv('Date,Steps,Note\n2026-08-20,9000,"walk, long"\n');
      expect(rows).toEqual([{ Date: "2026-08-20", Steps: "9000", Note: "walk, long" }]);
    });

    test("handles escaped quotes and missing trailing cells", () => {
      const rows = api.parseCsv('Date,Note\n2026-08-20,"a ""b"""\n2026-08-21');
      expect(rows[0].Note).toBe('a "b"');
      expect(rows[1].Note).toBe("");
    });

    test("header only → empty", () => expect(api.parseCsv("Date,Steps")).toEqual([]));
  });

  describe("parseFitnessData", () => {
    test("parses a JSON array", () => {
      const records = api.parseFitnessData('[{"date":"2026-08-19","steps":100},{"date":"2026-08-20","steps":200}]');
      expect(records.map((r) => r.date)).toEqual(["2026-08-20", "2026-08-19"]);
    });

    test("parses a wrapped JSON object", () => {
      const records = api.parseFitnessData('{"summary":{},"dailySummaries":[{"date":"2026-08-20","steps":1}]}');
      expect(records).toHaveLength(1);
    });

    test("parses CSV", () => {
      const records = api.parseFitnessData("Date,Steps,Resting Heart Rate\n2026-08-20,8000,55");
      expect(records[0]).toMatchObject({ date: "2026-08-20", steps: 8000, restingHeartRate: 55 });
    });

    test("empty file throws", () => expect(() => api.parseFitnessData("  ")).toThrow("empty"));
    test("null input throws", () => expect(() => api.parseFitnessData(null)).toThrow("empty"));
    test("invalid JSON throws", () => expect(() => api.parseFitnessData("{bad json")).toThrow("JSON"));
    test("JSON without arrays throws", () => expect(() => api.parseFitnessData('{"a":1}')).toThrow("No dated"));
    test("JSON null throws", () => expect(() => api.parseFitnessData("null")).toThrow("No dated"));
    test("undated rows throw", () => expect(() => api.parseFitnessData('[{"steps":1}]')).toThrow("No dated"));
  });

  describe("sortRecords", () => {
    test("sorts newest first and keeps equal dates stable", () => {
      const sorted = api.sortRecords([
        { date: "2026-08-19" },
        { date: "2026-08-21" },
        { date: "2026-08-21" }
      ]);
      expect(sorted.map((r) => r.date)).toEqual(["2026-08-21", "2026-08-21", "2026-08-19"]);
    });
  });

  // =========================================================================
  // Summary helpers
  // =========================================================================
  describe("summarize", () => {
    test("aggregates metrics", () => {
      const summary = api.summarize([
        { date: "2026-08-20", steps: 10000, restingHeartRate: 50, sleepHours: 8, activeCalories: 600, vo2Max: 47 },
        { date: "2026-08-19", steps: 8000, restingHeartRate: 54, sleepHours: 7, activeCalories: 400, vo2Max: 46 }
      ]);
      expect(summary).toEqual({
        days: 2,
        avgSteps: 9000,
        avgRestingHeartRate: 52,
        avgSleepHours: 7.5,
        totalActiveCalories: 1000,
        latestVo2Max: 47
      });
    });

    test("empty input yields null averages", () => {
      expect(api.summarize([])).toEqual({
        days: 0,
        avgSteps: null,
        avgRestingHeartRate: null,
        avgSleepHours: null,
        totalActiveCalories: 0,
        latestVo2Max: null
      });
    });
  });

  describe("formatNumber", () => {
    test("rounds to requested decimals", () => expect(api.formatNumber(7.46, 1)).toBe("7.5"));
    test("null → em dash", () => expect(api.formatNumber(null)).toBe("—"));
    test("NaN → em dash", () => expect(api.formatNumber(NaN)).toBe("—"));
  });

  describe("buildSampleRecords", () => {
    test("google sample has 7 days without VO2 max", () => {
      const records = api.buildSampleRecords("google", new Date("2026-08-20T12:00:00Z"));
      expect(records).toHaveLength(7);
      expect(records[0].date).toBe("2026-08-20");
      expect(records[0].vo2Max).toBeNull();
    });

    test("garmin sample includes VO2 max", () => {
      const records = api.buildSampleRecords("garmin", new Date("2026-08-20T12:00:00Z"));
      expect(records[0].vo2Max).toBe(46);
    });
  });

  // =========================================================================
  // State
  // =========================================================================
  describe("loadState", () => {
    test("defaults when nothing stored", () => {
      expect(api.loadState()).toEqual({
        google: { connected: false, lastSyncedAt: null, sourceLabel: null, records: [] },
        garmin: { connected: false, lastSyncedAt: null, sourceLabel: null, records: [] }
      });
    });

    test("restores saved providers", () => {
      const restored = resetAndLoad({
        fitnessSources: {
          google: { connected: true, lastSyncedAt: "2026-08-20T10:00:00.000Z", sourceLabel: "g.json", records: [{ date: "2026-08-20", steps: 5 }] },
          garmin: "corrupt"
        }
      })._test.loadState();
      expect(restored.google.connected).toBe(true);
      expect(restored.google.records).toHaveLength(1);
      expect(restored.garmin.connected).toBe(false);
    });

    test("ignores non-array records and missing metadata", () => {
      const restored = resetAndLoad({
        fitnessSources: { google: { connected: true, records: "nope" } }
      })._test.loadState();
      expect(restored.google.records).toEqual([]);
      expect(restored.google.lastSyncedAt).toBeNull();
      expect(restored.google.sourceLabel).toBeNull();
    });

    test("ignores non-object stored payloads", () => {
      expect(resetAndLoad({ fitnessSources: "broken" })._test.loadState().google.connected).toBe(false);
    });
  });

  describe("connect / disconnect", () => {
    test("connect stores records and disconnect clears them", () => {
      api.connectProvider("google", [{ date: "2026-08-20", steps: 100 }], "takeout.json");
      expect(api.mergedRecords()[0]).toMatchObject({ steps: 100, source: "Google Health" });
      expect(JSON.parse(localStorage.getItem(api.FITNESS_STORAGE_KEY)).google.connected).toBe(true);

      api.disconnectProvider("google");
      expect(api.mergedRecords()).toEqual([]);
    });

    test("merges both providers newest first", () => {
      api.connectProvider("google", [{ date: "2026-08-19", steps: 1 }], "g.json");
      api.connectProvider("garmin", [{ date: "2026-08-20", steps: 2 }], "garmin.csv");
      expect(api.mergedRecords().map((r) => r.source)).toEqual(["Garmin", "Google Health"]);
    });
  });

  // =========================================================================
  // Rendering & interactions
  // =========================================================================
  describe("rendering", () => {
    test("empty state is shown before any import", () => {
      expect(document.getElementById("records-empty").hidden).toBe(false);
      expect(document.getElementById("records-body").children).toHaveLength(0);
      expect(document.getElementById("summary-grid").children).toHaveLength(6);
      expect(document.getElementById("google-status").textContent).toBe("Not connected.");
    });

    test("sample button connects and renders rows", () => {
      document.getElementById("garmin-sample").click();
      expect(document.getElementById("records-body").children).toHaveLength(7);
      expect(document.getElementById("records-empty").hidden).toBe(true);
      expect(document.getElementById("garmin-status").textContent).toContain("Connected");
      expect(document.getElementById("garmin-status").classList.contains("connected")).toBe(true);
    });

    test("only the 30 most recent rows are rendered", () => {
      const many = Array.from({ length: 40 }, (_, index) => ({
        date: `2026-07-${String(index + 1).padStart(2, "0")}`,
        steps: index
      }));
      api.connectProvider("google", many, "big.json");
      api.render();
      expect(document.getElementById("records-body").children).toHaveLength(30);
    });

    test("invalid lastSyncedAt falls back to 'just now'", () => {
      api.connectProvider("google", [{ date: "2026-08-20" }], null);
      JSON.parse(localStorage.getItem(api.FITNESS_STORAGE_KEY));
      const state = api.loadState();
      expect(state.google.sourceLabel).toBeNull();

      const module = resetAndLoad({
        fitnessSources: {
          google: { connected: true, lastSyncedAt: "bogus", sourceLabel: null, records: [{ date: "2026-08-20" }] }
        }
      });
      module._test.render();
      expect(document.getElementById("google-status").textContent).toContain("just now");
    });

    test("disconnect button restores the empty state", () => {
      document.getElementById("google-sample").click();
      document.getElementById("google-disconnect").click();
      expect(document.getElementById("google-status").textContent).toBe("Not connected.");
      expect(document.getElementById("records-empty").hidden).toBe(false);
    });
  });

  describe("file import", () => {
    function importFile(inputId, content, name = "export.json") {
      const input = document.getElementById(inputId);
      const file = new File([content], name, { type: "application/json" });
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      dispatchChange(input);
      return waitForStatusChange(inputId.replace("-file", "-status"));
    }

    async function waitForStatusChange(statusId) {
      const status = document.getElementById(statusId);
      for (let attempt = 0; attempt < 50 && status.textContent === "Not connected."; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }

    test("valid file connects the provider", async () => {
      await importFile("google-file", '[{"date":"2026-08-20","steps":9000,"restingHeartRate":55}]', "takeout.json");
      expect(document.getElementById("google-status").textContent).toContain("takeout.json");
      expect(document.getElementById("records-body").children).toHaveLength(1);
    });

    test("invalid file shows an error", async () => {
      await importFile("garmin-file", "{bad json", "garmin.json");
      const status = document.getElementById("garmin-status");
      expect(status.textContent).toContain("Import failed");
      expect(status.classList.contains("error")).toBe(true);
    });

    test("no selected file is ignored", () => {
      const input = document.getElementById("google-file");
      Object.defineProperty(input, "files", { value: [], configurable: true });
      dispatchChange(input);
      expect(document.getElementById("google-status").textContent).toBe("Not connected.");
    });

    test("unreadable file shows an error", async () => {
      const originalReadAsText = FileReader.prototype.readAsText;
      FileReader.prototype.readAsText = function readAsText() {
        setTimeout(() => this.onerror(new Event("error")), 0);
      };
      await importFile("google-file", "irrelevant", "broken.json");
      expect(document.getElementById("google-status").textContent).toContain("could not be read");
      FileReader.prototype.readAsText = originalReadAsText;
    });
  });

  describe("storage failures", () => {
    test("unavailable localStorage falls back to defaults", () => {
      const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });

      const module = resetAndLoad()._test;
      expect(module.loadState().google.connected).toBe(false);
      expect(() => module.connectProvider("google", [{ date: "2026-08-20" }], "x.json")).not.toThrow();

      getItem.mockRestore();
      setItem.mockRestore();
    });
  });
});
