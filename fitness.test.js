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
  window.history.replaceState({}, "", "/fitness.html");
  if (storageData) {
    Object.entries(storageData).forEach(([key, value]) =>
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value))
    );
  }
  document.body.innerHTML = domBody;
  return require("./fitness.js");
}

const dispatchChange = (el) => el.dispatchEvent(new Event("change", { bubbles: true }));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(payload) };
}

function googleBucket(date = "2026-08-20") {
  return {
    startTimeMillis: String(new Date(`${date}T12:00:00`).getTime()),
    dataset: [
      { point: [{ value: [{ intVal: 4000 }] }, { value: [{ intVal: 5000 }] }] },
      { point: [{ value: [{ fpVal: 620.4 }] }] },
      { point: [{ value: [{ fpVal: 61 }, { fpVal: 130 }, { fpVal: 52 }] }] },
      {
        point: [
          { value: [{ intVal: 4 }], startTimeNanos: "0", endTimeNanos: "21600000000000" },
          { value: [{ intVal: 5 }], startTimeNanos: "21600000000000", endTimeNanos: "25200000000000" }
        ]
      }
    ]
  };
}

describe("fitness.js", () => {
  let api;

  beforeAll(() => {
    global.TextEncoder = require("util").TextEncoder;
    Object.defineProperty(window, "crypto", {
      configurable: true,
      value: {
        getRandomValues: (bytes) => {
          for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 256;
          return bytes;
        },
        subtle: {
          digest: async (_algorithm, data) => new Uint8Array(data).slice(0, 32).buffer
        }
      }
    });
  });

  afterEach(() => {
    delete global.fetch;
  });

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

    test("handles quoted newlines", () => {
      const rows = api.parseCsv('Date,Note\r\n2026-08-20,"line one\nline two"\r\n');
      expect(rows).toEqual([{ Date: "2026-08-20", Note: "line one\nline two" }]);
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

    test("uses the local calendar day, not the UTC day", () => {
      // Simulate a timezone where the UTC day differs from the local day: the
      // sample week must follow the local calendar, so toISOString() must not
      // be used to derive the date key.
      const isoSpy = jest
        .spyOn(Date.prototype, "toISOString")
        .mockReturnValue("2999-12-31T00:00:00.000Z");
      try {
        const records = api.buildSampleRecords("google", new Date(2026, 7, 20, 23, 30));
        expect(records[0].date).toBe("2026-08-20");
        expect(records[6].date).toBe("2026-08-14");
      } finally {
        isoSpy.mockRestore();
      }
    });
  });

  describe("toLocalDateKey", () => {
    test("formats from local date parts with zero padding", () => {
      expect(api.toLocalDateKey(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
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


  // =========================================================================
  // Live API connections
  // =========================================================================
  describe("API helpers", () => {
    describe("round", () => {
      test("rounds to decimals", () => expect(api.round(7.4567, 2)).toBe(7.46));
      test("integers by default", () => expect(api.round(7.6)).toBe(8));
      test("non-numeric → null", () => expect(api.round(null)).toBeNull());
      test("infinite → null", () => expect(api.round(Infinity)).toBeNull());
    });

    describe("mergeByDate", () => {
      test("fills gaps from later records and keeps existing values", () => {
        expect(
          api.mergeByDate([
            { date: "2026-08-20", steps: 100, vo2Max: null, sleepHours: null },
            { date: "2026-08-20", steps: 999, vo2Max: 46, sleepHours: null },
            { date: "2026-08-19", steps: 50, vo2Max: null, sleepHours: 7 }
          ])
        ).toEqual([
          { date: "2026-08-20", steps: 100, vo2Max: 46, sleepHours: null },
          { date: "2026-08-19", steps: 50, vo2Max: null, sleepHours: 7 }
        ]);
      });

      test("fills fields that are absent on the first record", () => {
        expect(api.mergeByDate([{ date: "2026-08-20" }, { date: "2026-08-20", steps: 12 }])).toEqual([
          { date: "2026-08-20", steps: 12 }
        ]);
      });
    });

    describe("settings", () => {
      test("defaults to empty overrides", () => {
        expect(api.loadApiSettings()).toEqual({
          google: { clientId: "", clientSecret: "", tokenUrl: "", apiBase: "" },
          garmin: { clientId: "", clientSecret: "", tokenUrl: "", apiBase: "" }
        });
      });

      test("restores and trims saved overrides, ignoring bad shapes", () => {
        const module = resetAndLoad({
          fitnessApiSettings: {
            google: { clientId: "  abc  ", tokenUrl: 5 },
            garmin: "broken"
          }
        })._test;
        expect(module.loadApiSettings().google).toEqual({ clientId: "abc", clientSecret: "", tokenUrl: "", apiBase: "" });
        expect(module.loadApiSettings().garmin.clientId).toBe("");
      });

      test("ignores a non-object payload", () => {
        expect(resetAndLoad({ fitnessApiSettings: "broken" })._test.loadApiSettings().google.clientId).toBe("");
      });

      test("saveApiSetting persists and providerConfig applies overrides", () => {
        api.saveApiSetting("garmin", "clientId", " gid ");
        api.saveApiSetting("garmin", "clientSecret", " secret ");
        api.saveApiSetting("garmin", "apiBase", "https://proxy.example/api");
        api.saveApiSetting("garmin", "tokenUrl", undefined);

        const config = api.providerConfig("garmin");
        expect(config.clientId).toBe("gid");
        expect(config.clientSecret).toBe("secret");
        expect(config.apiBase).toBe("https://proxy.example/api");
        expect(config.tokenUrl).toContain("garmin.com");
        expect(JSON.parse(localStorage.getItem(api.API_SETTINGS_KEY)).garmin.clientId).toBe("gid");
      });

      test("ignores a saved client secret for Google", () => {
        api.saveApiSetting("google", "clientSecret", "secret");
        expect(api.providerConfig("google").clientSecret).toBe("");
      });
    });

    describe("tokens", () => {
      test("defaults to no tokens", () => expect(api.loadTokens()).toEqual({ google: null, garmin: null }));

      test("restores saved tokens and ignores incomplete ones", () => {
        const module = resetAndLoad({
          fitnessAuthTokens: {
            google: { accessToken: "at", refreshToken: "rt", expiresAt: 123 },
            garmin: { refreshToken: "rt" }
          }
        })._test;
        expect(module.loadTokens().google).toEqual({ accessToken: "at", refreshToken: "rt", expiresAt: 123 });
        expect(module.loadTokens().garmin).toBeNull();
      });

      test("normalizes missing refresh token and expiry", () => {
        const module = resetAndLoad({ fitnessAuthTokens: { google: { accessToken: "at" } } })._test;
        expect(module.loadTokens().google).toEqual({ accessToken: "at", refreshToken: null, expiresAt: 0 });
      });

      test("ignores a non-object payload", () => {
        expect(resetAndLoad({ fitnessAuthTokens: "broken" })._test.loadTokens().google).toBeNull();
      });

      test("save and clear round-trip through localStorage", () => {
        api.saveTokens("google", { accessToken: "at", refreshToken: null, expiresAt: 1 });
        expect(JSON.parse(localStorage.getItem(api.AUTH_TOKENS_KEY)).google.accessToken).toBe("at");
        api.clearTokens("google");
        expect(JSON.parse(localStorage.getItem(api.AUTH_TOKENS_KEY)).google).toBeNull();
      });
    });

    describe("buildAuthUrl", () => {
      test("includes PKCE, scope and Google specific params", () => {
        api.saveApiSetting("google", "clientId", "gid");
        const url = new URL(
          api.buildAuthUrl("google", { codeChallenge: "chal", state: "st", redirectUri: "https://app/fitness.html" })
        );
        expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
        expect(url.searchParams.get("client_id")).toBe("gid");
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        expect(url.searchParams.get("code_challenge")).toBe("chal");
        expect(url.searchParams.get("redirect_uri")).toBe("https://app/fitness.html");
        expect(url.searchParams.get("scope")).toContain("fitness.activity.read");
        expect(url.searchParams.get("access_type")).toBe("offline");
      });

      test("omits scope for Garmin", () => {
        const url = new URL(api.buildAuthUrl("garmin", { codeChallenge: "c", state: "s", redirectUri: "https://app/" }));
        expect(url.searchParams.get("scope")).toBeNull();
        expect(url.origin).toBe("https://connect.garmin.com");
      });
    });

    describe("startAuth", () => {
      test("rejects without a client ID", async () => {
        await expect(api.startAuth("google")).rejects.toThrow("client ID");
      });

      test("stores the PKCE state and navigates to the provider", async () => {
        api.saveApiSetting("google", "clientId", "gid");
        const go = jest.spyOn(api.navigation, "go").mockImplementation(() => {});

        await api.startAuth("google");

        const [pending] = JSON.parse(localStorage.getItem(api.PENDING_AUTH_KEY_PREFIX + "google"));
        expect(pending.providerId).toBe("google");
        expect(pending.state).toMatch(/^google:/);
        expect(pending.verifier).toEqual(expect.any(String));
        expect(pending.createdAt).toEqual(expect.any(Number));
        expect(go).toHaveBeenCalledWith(expect.stringContaining("code_challenge="));
        go.mockRestore();
      });

      test("keeps earlier attempts instead of overwriting them", async () => {
        api.saveApiSetting("google", "clientId", "gid");
        const go = jest.spyOn(api.navigation, "go").mockImplementation(() => {});

        await api.startAuth("google");
        await api.startAuth("google");

        const entries = api.readPendingAuth("google");
        expect(entries).toHaveLength(2);
        expect(entries[0].createdAt).toBeLessThanOrEqual(entries[1].createdAt);
        go.mockRestore();
      });

      test("keeps only the most recent attempts", async () => {
        api.saveApiSetting("google", "clientId", "gid");
        const go = jest.spyOn(api.navigation, "go").mockImplementation(() => {});

        for (let index = 0; index <= api.MAX_PENDING_AUTH; index += 1) await api.startAuth("google");

        expect(api.readPendingAuth("google")).toHaveLength(api.MAX_PENDING_AUTH);
        go.mockRestore();
      });

      test("throws when the pending state cannot be stored", async () => {
        api.saveApiSetting("google", "clientId", "gid");
        const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
          throw new Error("blocked");
        });

        await expect(api.startAuth("google")).rejects.toThrow("local storage");

        setItem.mockRestore();
      });
    });

    describe("pending auth storage", () => {
      test("ignores a legacy non-array value", () => {
        localStorage.setItem(api.PENDING_AUTH_KEY_PREFIX + "google", JSON.stringify({ state: "google:st" }));
        expect(api.readPendingAuth("google")).toEqual([]);
      });

      test("drops expired and empty entries", () => {
        localStorage.setItem(
          api.PENDING_AUTH_KEY_PREFIX + "google",
          JSON.stringify([null, { state: "google:old", createdAt: Date.now() - api.PENDING_AUTH_TTL_MS - 1 }])
        );
        expect(api.readPendingAuth("google")).toEqual([]);
      });

      test("removes the key once the last attempt is taken", () => {
        api.addPendingAuth("google", { providerId: "google", state: "google:st", verifier: "v", redirectUri: "u" });

        expect(api.takePendingAuth("google", "google:st").pending.verifier).toBe("v");
        expect(localStorage.getItem(api.PENDING_AUTH_KEY_PREFIX + "google")).toBeNull();
      });
    });

    describe("token requests", () => {
      test("exchanges an authorization code", async () => {
        api.saveApiSetting("google", "clientId", "gid");
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 100 }));

        const tokens = await api.exchangeCode("google", "code", "verifier", "https://app/");

        expect(tokens.accessToken).toBe("at");
        expect(tokens.refreshToken).toBe("rt");
        expect(tokens.expiresAt).toBeGreaterThan(Date.now());
        const [url, options] = global.fetch.mock.calls[0];
        expect(url).toBe("https://oauth2.googleapis.com/token");
        expect(options.body).toContain("grant_type=authorization_code");
        expect(options.body).toContain("code_verifier=verifier");
      });

      test("sends Garmin client authentication when a client secret is saved", async () => {
        api.saveApiSetting("garmin", "clientId", "gid");
        api.saveApiSetting("garmin", "clientSecret", "secret");
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ access_token: "at", expires_in: 100 }));

        await api.exchangeCode("garmin", "code", "verifier", "https://app/");

        const [, options] = global.fetch.mock.calls[0];
        expect(options.headers.Authorization).toBe("Basic Z2lkOnNlY3JldA==");
        expect(options.body).not.toContain("client_id=gid");
      });

      test("defaults the lifetime and refresh token when absent", async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ access_token: "at", expires_in: "nope" }));
        const tokens = await api.exchangeCode("google", "c", "v", "https://app/");
        expect(tokens.refreshToken).toBeNull();
        expect(tokens.expiresAt).toBeGreaterThan(Date.now() + 3500000);
      });

      test("surfaces the provider error description", async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ error_description: "bad code" }, 400));
        await expect(api.exchangeCode("google", "c", "v", "https://app/")).rejects.toThrow("bad code");
      });

      test("falls back to the HTTP status when the body is unreadable", async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.reject(new Error("nope")) });
        await expect(api.exchangeCode("google", "c", "v", "https://app/")).rejects.toThrow("HTTP 503");
      });

      test("rejects a success response without an access token", async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ token_type: "Bearer" }));
        await expect(api.exchangeCode("google", "c", "v", "https://app/")).rejects.toThrow("rejected");
      });
    });

    describe("ensureAccessToken", () => {
      test("throws when the provider is not connected", async () => {
        await expect(api.ensureAccessToken("google")).rejects.toThrow("connect the API first");
      });

      test("returns a valid token unchanged", async () => {
        api.saveTokens("google", { accessToken: "at", refreshToken: null, expiresAt: Date.now() + 600000 });
        await expect(api.ensureAccessToken("google")).resolves.toBe("at");
      });

      test("throws when expired without a refresh token", async () => {
        api.saveTokens("google", { accessToken: "at", refreshToken: null, expiresAt: 0 });
        await expect(api.ensureAccessToken("google")).rejects.toThrow("expired");
      });

      test("refreshes an expired token and keeps the old refresh token", async () => {
        api.saveTokens("google", { accessToken: "old", refreshToken: "rt", expiresAt: 0 });
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ access_token: "new", expires_in: 3600 }));

        await expect(api.ensureAccessToken("google")).resolves.toBe("new");
        expect(JSON.parse(localStorage.getItem(api.AUTH_TOKENS_KEY)).google.refreshToken).toBe("rt");
        expect(global.fetch.mock.calls[0][1].body).toContain("grant_type=refresh_token");
      });

      test("stores a rotated refresh token", async () => {
        api.saveTokens("garmin", { accessToken: "old", refreshToken: "rt", expiresAt: 0 });
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ access_token: "new", refresh_token: "rt2", expires_in: 3600 }));

        await api.ensureAccessToken("garmin");
        expect(JSON.parse(localStorage.getItem(api.AUTH_TOKENS_KEY)).garmin.refreshToken).toBe("rt2");
      });
    });

    describe("apiFetch", () => {
      test("sends the bearer token and returns the payload", async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ ok: true }));
        await expect(api.apiFetch("https://api/x", "at")).resolves.toEqual({ ok: true });
        expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer " + "at");
      });

      test("keeps caller supplied headers", async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse([]));
        await api.apiFetch("https://api/x", "at", { headers: { "Content-Type": "application/json" } });
        expect(global.fetch.mock.calls[0][1].headers["Content-Type"]).toBe("application/json");
      });

      test("throws on an HTTP error", async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, 401));
        await expect(api.apiFetch("https://api/x", "at")).rejects.toThrow("HTTP 401");
      });

      test("throws when the body is not JSON", async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.reject(new Error("no")) });
        await expect(api.apiFetch("https://api/x", "at")).rejects.toThrow("could not be read");
      });
    });

    describe("googleBucketToRecord", () => {
      test("maps steps, calories, resting HR and sleep", () => {
        expect(api.googleBucketToRecord(googleBucket())).toEqual({
          date: "2026-08-20",
          steps: 9000,
          restingHeartRate: 52,
          sleepHours: 7,
          activeCalories: 620,
          vo2Max: null
        });
      });

      test("skips buckets without a usable date", () => {
        expect(api.googleBucketToRecord({ startTimeMillis: "nope", dataset: [] })).toBeNull();
      });

      test("returns nulls when datasets are missing or empty", () => {
        expect(api.googleBucketToRecord({ startTimeMillis: String(Date.UTC(2026, 7, 20, 12)) })).toEqual({
          date: expect.any(String),
          steps: null,
          restingHeartRate: null,
          sleepHours: null,
          activeCalories: null,
          vo2Max: null
        });
      });

      test("ignores points without usable values", () => {
        const bucket = googleBucket();
        bucket.dataset[0].point = [{ value: [{}] }, { value: [] }, { notValue: 1 }];
        bucket.dataset[2].point = [{ value: [{ fpVal: 60 }] }];
        expect(api.googleBucketToRecord(bucket)).toMatchObject({ steps: null, restingHeartRate: null });
      });

      test("ignores awake segments and malformed sleep spans", () => {
        const bucket = googleBucket();
        bucket.dataset[3].point = [
          { value: [{ intVal: 1 }], startTimeNanos: "0", endTimeNanos: "3600000000000" },
          { value: [{}], startTimeNanos: "0", endTimeNanos: "3600000000000" },
          { value: [{ intVal: 2 }], startTimeNanos: "bad", endTimeNanos: "1" },
          { value: [{ intVal: 2 }], startTimeNanos: "10", endTimeNanos: "10" }
        ];
        expect(api.googleBucketToRecord(bucket).sleepHours).toBeNull();
      });

      test("handles a dataset without a point array", () => {
        const bucket = googleBucket();
        bucket.dataset[0] = {};
        expect(api.googleBucketToRecord(bucket).steps).toBeNull();
      });
    });

    describe("fetchGoogleRecords", () => {
      test("aggregates daily buckets newest first", async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ bucket: [googleBucket(), googleBucket("2026-08-21")] }));

        const records = await api.fetchGoogleRecords("at", Date.UTC(2026, 7, 21, 12));

        expect(records.map((record) => record.date)).toEqual(["2026-08-21", "2026-08-20"]);
        const [url, options] = global.fetch.mock.calls[0];
        expect(url).toBe("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate");
        expect(JSON.parse(options.body).aggregateBy).toHaveLength(4);
      });

      test("tolerates a response without buckets", async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({}));
        await expect(api.fetchGoogleRecords("at")).resolves.toEqual([]);
      });
    });

    describe("fetchGarminRecords", () => {
      test("merges dailies, sleeps and user metrics by date", async () => {
        global.fetch = jest.fn().mockImplementation((url) => {
          if (url.includes("dailies")) {
            return Promise.resolve(jsonResponse([{ calendarDate: "2026-08-20", steps: 11000, restingHeartRateInBeatsPerMinute: 52, activeKilocalories: 700 }]));
          }
          if (url.includes("sleeps")) {
            return Promise.resolve(jsonResponse([{ calendarDate: "2026-08-20", sleepTimeInSeconds: 27000 }]));
          }
          return Promise.resolve(jsonResponse({ metrics: [{ calendarDate: "2026-08-20", vo2Max: 47 }] }));
        });

        const records = await api.fetchGarminRecords("at", Date.UTC(2026, 7, 20, 12));

        expect(records).toEqual([
          { date: "2026-08-20", steps: 11000, restingHeartRate: 52, sleepHours: 7.5, activeCalories: 700, vo2Max: 47 }
        ]);
        expect(global.fetch).toHaveBeenCalledTimes(21);
        expect(global.fetch.mock.calls[0][0]).toContain("uploadStartTimeInSeconds=");
      });

      test("uses the configured API base override", async () => {
        api.saveApiSetting("garmin", "apiBase", "https://proxy.example");
        global.fetch = jest.fn().mockResolvedValue(jsonResponse([]));
        await api.fetchGarminRecords("at");
        expect(global.fetch.mock.calls[0][0]).toContain("https://proxy.example/wellness-api/rest/");
      });
    });

    describe("syncProvider", () => {
      test("stores fetched records against the provider", async () => {
        api.saveTokens("google", { accessToken: "at", refreshToken: null, expiresAt: Date.now() + 600000 });
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ bucket: [googleBucket()] }));

        await api.syncProvider("google");

        expect(api.mergedRecords()[0]).toMatchObject({ date: "2026-08-20", source: "Google Health" });
        expect(document.getElementById("google-status").textContent).toBe("Not connected.");
      });

      test("throws when the API has no records", async () => {
        api.saveTokens("garmin", { accessToken: "at", refreshToken: null, expiresAt: Date.now() + 600000 });
        global.fetch = jest.fn().mockResolvedValue(jsonResponse([]));
        await expect(api.syncProvider("garmin")).rejects.toThrow("no daily records");
      });

      test("rejects an unsupported provider name", async () => {
        api.saveTokens("toString", { accessToken: "at", refreshToken: null, expiresAt: Date.now() + 600000 });
        await expect(api.syncProvider("toString")).rejects.toThrow("unsupported fitness provider");
      });
    });

    describe("handleAuthRedirect", () => {
      function setPending(...pendings) {
        const [{ providerId }] = pendings;
        localStorage.setItem(
          api.PENDING_AUTH_KEY_PREFIX + providerId,
          JSON.stringify(pendings.map((pending) => ({ createdAt: Date.now(), ...pending })))
        );
      }

      test("does nothing without OAuth parameters", async () => {
        await expect(api.handleAuthRedirect()).resolves.toBe(false);
      });

      test("ignores a redirect without stored state", async () => {
        window.history.replaceState({}, "", "/fitness.html?code=abc&state=google:st");
        await expect(api.handleAuthRedirect()).resolves.toBe(false);
        expect(window.location.search).toBe("");
      });

      test("ignores a redirect with a malformed state", async () => {
        window.history.replaceState({}, "", "/fitness.html?code=abc&state=st");
        await expect(api.handleAuthRedirect()).resolves.toBe(false);
        expect(window.location.search).toBe("");
      });

      test("ignores a redirect for an unknown provider", async () => {
        window.history.replaceState({}, "", "/fitness.html?code=abc&state=fitbit:st");
        setPending({ providerId: "fitbit", state: "fitbit:st", verifier: "v", redirectUri: "https://app/" });
        await expect(api.handleAuthRedirect()).resolves.toBe(false);
      });

      test("reports a provider error", async () => {
        window.history.replaceState({}, "", "/fitness.html?error=access_denied&state=google:st");
        setPending({ providerId: "google", state: "google:st", verifier: "v", redirectUri: "https://app/" });

        await expect(api.handleAuthRedirect()).resolves.toBe(false);

        expect(document.getElementById("google-status").textContent).toContain("access_denied");
        expect(localStorage.getItem(api.PENDING_AUTH_KEY_PREFIX + "google")).toBeNull();
      });

      test("rejects a mismatched state", async () => {
        window.history.replaceState({}, "", "/fitness.html?code=abc&state=google:other");
        setPending({ providerId: "google", state: "google:st", verifier: "v", redirectUri: "https://app/" });

        await expect(api.handleAuthRedirect()).resolves.toBe(false);
        expect(document.getElementById("google-status").textContent).toContain("state did not match");
      });

      test("exchanges the code, syncs and renders", async () => {
        window.history.replaceState({}, "", "/fitness.html?code=abc&state=google:st");
        setPending({ providerId: "google", state: "google:st", verifier: "v", redirectUri: "https://app/" });
        global.fetch = jest
          .fn()
          .mockResolvedValueOnce(jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }))
          .mockResolvedValueOnce(jsonResponse({ bucket: [googleBucket()] }));

        await expect(api.handleAuthRedirect()).resolves.toBe(true);

        expect(document.getElementById("google-status").textContent).toContain("Google Health API");
        expect(document.getElementById("records-body").children).toHaveLength(1);
      });

      test("reports a failed exchange", async () => {
        window.history.replaceState({}, "", "/fitness.html?code=abc&state=garmin:st");
        setPending({ providerId: "garmin", state: "garmin:st", verifier: "v", redirectUri: "https://app/" });
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ error_description: "nope" }, 400));

        await expect(api.handleAuthRedirect()).resolves.toBe(true);
        expect(document.getElementById("garmin-status").textContent).toContain("Connection failed");
      });

      test("accepts an earlier attempt after a second connect attempt", async () => {
        window.history.replaceState({}, "", "/fitness.html?code=abc&state=google:first");
        setPending(
          { providerId: "google", state: "google:first", verifier: "v1", redirectUri: "https://app/" },
          { providerId: "google", state: "google:second", verifier: "v2", redirectUri: "https://app/" }
        );
        global.fetch = jest
          .fn()
          .mockResolvedValueOnce(jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }))
          .mockResolvedValueOnce(jsonResponse({ bucket: [googleBucket()] }));

        await expect(api.handleAuthRedirect()).resolves.toBe(true);

        expect(document.getElementById("google-status").textContent).toContain("Google Health API");
        const [, options] = global.fetch.mock.calls[0];
        expect(options.body).toContain("code_verifier=v1");
        expect(api.readPendingAuth("google").map((entry) => entry.state)).toEqual(["google:second"]);
      });

      test("ignores an expired attempt", async () => {
        window.history.replaceState({}, "", "/fitness.html?code=abc&state=google:st");
        setPending({
          providerId: "google",
          state: "google:st",
          verifier: "v",
          redirectUri: "https://app/",
          createdAt: Date.now() - api.PENDING_AUTH_TTL_MS - 1
        });

        await expect(api.handleAuthRedirect()).resolves.toBe(false);
        expect(document.getElementById("google-status").textContent).not.toContain("state did not match");
      });
    });

    describe("API controls", () => {
      test("connect without a client ID shows an error", async () => {
        document.getElementById("google-connect").click();
        await flush();
        const status = document.getElementById("google-status");
        expect(status.textContent).toContain("client ID");
        expect(status.classList.contains("error")).toBe(true);
      });

      test("connect redirects once a client ID is saved", async () => {
        const input = document.getElementById("garmin-client-id");
        input.value = "gid";
        dispatchChange(input);
        const go = jest.spyOn(api.navigation, "go").mockImplementation(() => {});

        document.getElementById("garmin-connect").click();
        await flush();

        expect(go).toHaveBeenCalledWith(expect.stringContaining("client_id=gid"));
        expect(JSON.parse(localStorage.getItem(api.API_SETTINGS_KEY)).garmin.clientId).toBe("gid");
        go.mockRestore();
      });

      test("sync now fetches and renders records", async () => {
        api.saveTokens("google", { accessToken: "at", refreshToken: null, expiresAt: Date.now() + 600000 });
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ bucket: [googleBucket()] }));

        document.getElementById("google-sync").click();
        await flush();

        expect(document.getElementById("google-status").textContent).toContain("Google Health API");
        expect(document.getElementById("records-body").children).toHaveLength(1);
      });

      test("sync failure is reported", async () => {
        document.getElementById("garmin-sync").click();
        await flush();
        expect(document.getElementById("garmin-status").textContent).toContain("Sync failed");
      });

      test("disconnect clears the stored tokens", () => {
        api.saveTokens("google", { accessToken: "at", refreshToken: null, expiresAt: Date.now() + 1000 });
        document.getElementById("google-disconnect").click();
        expect(JSON.parse(localStorage.getItem(api.AUTH_TOKENS_KEY)).google).toBeNull();
      });

      test("saved settings are shown in the inputs on load", () => {
        resetAndLoad({ fitnessApiSettings: { google: { clientId: "saved-id", apiBase: "https://proxy" } } });
        expect(document.getElementById("google-client-id").value).toBe("saved-id");
        expect(document.getElementById("google-api-base").value).toBe("https://proxy");
        expect(document.getElementById("google-token-url").value).toBe("");
      });
    });
  });

  describe("storage removal failures", () => {
    test("blocked removeItem is swallowed", async () => {
      window.history.replaceState({}, "", "/fitness.html?error=access_denied&state=google:st");
      const removeItem = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("blocked");
      });

      await expect(api.handleAuthRedirect()).resolves.toBe(false);

      removeItem.mockRestore();
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
