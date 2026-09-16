"use strict";

const common = require("./common.js");

describe("common.js", () => {
  beforeEach(() => localStorage.clear());

  describe("storage", () => {
    test("get returns the fallback for a missing key", () => expect(common.storage.get("nope", 7)).toBe(7));

    test("set then get round-trips", () => {
      expect(common.storage.set("k", { a: 1 })).toBe(true);
      expect(common.storage.get("k", null)).toEqual({ a: 1 });
    });

    test("get returns the fallback for unparsable JSON", () => {
      localStorage.setItem("k", "{oops");
      expect(common.storage.get("k", "fallback")).toBe("fallback");
    });

    test("remove deletes the key", () => {
      common.storage.set("k", 1);
      expect(common.storage.remove("k")).toBe(true);
      expect(common.storage.get("k", null)).toBeNull();
    });

    describe("when localStorage throws", () => {
      let original;

      beforeEach(() => {
        original = Object.getOwnPropertyDescriptor(window, "localStorage");
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          value: {
            getItem() {
              throw new Error("blocked");
            },
            setItem() {
              throw new Error("blocked");
            },
            removeItem() {
              throw new Error("blocked");
            }
          }
        });
      });

      afterEach(() => Object.defineProperty(window, "localStorage", original));

      test("get falls back", () => expect(common.storage.get("k", "fallback")).toBe("fallback"));
      test("set reports failure", () => expect(common.storage.set("k", 1)).toBe(false));
      test("remove reports failure", () => expect(common.storage.remove("k")).toBe(false));
    });
  });

  describe("getLocalDateKey", () => {
    test("pads month and day", () => expect(common.getLocalDateKey(new Date(2026, 0, 5))).toBe("2026-01-05"));
    test("defaults to today", () => expect(common.getLocalDateKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });

  describe("shiftDateKey", () => {
    test("goes back a day", () => expect(common.shiftDateKey("2026-09-16", -1)).toBe("2026-09-15"));
    test("crosses a month boundary", () => expect(common.shiftDateKey("2026-03-01", -1)).toBe("2026-02-28"));
    test("goes forward", () => expect(common.shiftDateKey("2026-12-31", 1)).toBe("2027-01-01"));
    test("returns null for an unparsable key", () => expect(common.shiftDateKey("not-a-date", -1)).toBeNull());
  });

  describe("formatSeconds", () => {
    test("pads to mm:ss", () => expect(common.formatSeconds(90)).toBe("01:30"));
    test("clamps negatives to zero", () => expect(common.formatSeconds(-5)).toBe("00:00"));
    test("treats non-numbers as zero", () => expect(common.formatSeconds("abc")).toBe("00:00"));
  });

  describe("round", () => {
    test("rounds to decimals", () => expect(common.round(7.46, 1)).toBe(7.5));
    test("rounds to integers by default", () => expect(common.round(7.6)).toBe(8));
    test("non-numbers become null", () => expect(common.round("7")).toBeNull());
    test("infinity becomes null", () => expect(common.round(Infinity)).toBeNull());
  });

  describe("toNumber", () => {
    test("strips thousands separators", () => expect(common.toNumber("1,200")).toBe(1200));
    test("empty string becomes null", () => expect(common.toNumber("")).toBeNull());
    test("null becomes null", () => expect(common.toNumber(null)).toBeNull());
    test("undefined becomes null", () => expect(common.toNumber(undefined)).toBeNull());
    test("non-numeric text becomes null", () => expect(common.toNumber("abc")).toBeNull());
  });

  describe("formatNumber", () => {
    test("formats with decimals", () => expect(common.formatNumber(7.46, 1)).toBe("7.5"));
    test("null becomes an em dash", () => expect(common.formatNumber(null)).toBe("—"));
    test("NaN becomes an em dash", () => expect(common.formatNumber(NaN)).toBe("—"));
  });

  describe("createElement", () => {
    test("builds a bare element", () => {
      const el = common.createElement("p");
      expect(el.tagName).toBe("P");
      expect(el.className).toBe("");
      expect(el.textContent).toBe("");
    });

    test("applies class, text, attributes and children", () => {
      const child = common.createElement("span", { text: "child" });
      const el = common.createElement("div", {
        className: "box",
        text: "parent",
        attrs: { id: "x", "aria-live": "polite" },
        children: [child]
      });
      expect(el.className).toBe("box");
      expect(el.id).toBe("x");
      expect(el.getAttribute("aria-live")).toBe("polite");
      expect(el.textContent).toBe("parentchild");
      expect(el.firstElementChild).toBe(child);
    });

    test("accepts an empty text string", () => {
      expect(common.createElement("p", { text: "" }).textContent).toBe("");
    });
  });
});
