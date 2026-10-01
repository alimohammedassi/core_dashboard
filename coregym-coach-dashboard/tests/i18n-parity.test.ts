import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dictionary, tFor } from "../src/lib/i18n/dictionary.ts";

import { formatters } from "../src/lib/i18n/format.ts";
import { interpolate } from "../src/lib/i18n/translate.ts";

/* Collects every dot-path leaf (string) in a dictionary domain. Arrays are not
   addressable by t() and must not exist in dictionaries. */
function flatten(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  if (obj === null || typeof obj !== "object") {
    throw new Error(`Dictionary leaf at "${prefix}" is not a string`);
  }
  if (Array.isArray(obj)) {
    throw new Error(`Dictionary contains an array at "${prefix}" — t() cannot address arrays`);
  }
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    keys.push(...flatten(value, prefix ? `${prefix}.${key}` : key));
  }
  return keys;
}

function diff(a: string[], b: string[]): { onlyInA: string[]; onlyInB: string[] } {
  const setB = new Set(b);
  const setA = new Set(a);
  return {
    onlyInA: a.filter((k) => !setB.has(k)),
    onlyInB: b.filter((k) => !setA.has(k)),
  };
}

describe("i18n dictionary", () => {
  it("every domain has identical en/ar key paths", () => {
    const problems: string[] = [];
    for (const [name, domain] of Object.entries(dictionary)) {
      const { onlyInA, onlyInB } = diff(
        flatten(domain.en),
        flatten((domain as { ar: unknown }).ar),
      );
      if (onlyInA.length) problems.push(`${name}: missing in ar → ${onlyInA.join(", ")}`);
      if (onlyInB.length) problems.push(`${name}: missing in en → ${onlyInB.join(", ")}`);
    }
    assert.equal(problems.length, 0, problems.join("\n"));
  });

  it("t() resolves every key in both languages without falling back", () => {
    for (const [name, domain] of Object.entries(dictionary)) {
      for (const key of flatten(domain.en)) {
        const fullKey = `${name}.${key}`;
        for (const lang of ["en", "ar"] as const) {
          const t = tFor(lang);
          const resolved = t(fullKey as Parameters<typeof t>[0]);
          assert.notEqual(resolved, fullKey, `key ${fullKey} did not resolve for ${lang}`);
          assert.ok(resolved.trim().length > 0, `key ${fullKey} is empty for ${lang}`);
        }
      }
    }
  });

  it("arabic blocks are actually translated (not copied English)", () => {
    // Most UI copy must contain Arabic script. A minority of keys are
    // deliberately language-neutral (email placeholders, "{date}: {volume} kg"
    // tooltip templates, "W{n}" axis labels, punctuation fragments), so this is
    // a proportion check: it catches a wholesale untranslated ar block — the
    // actual failure mode — without whack-a-mole allowlists per neutral token.
    const arabic = /[\u0600-\u06FF]/;
    for (const [name, domain] of Object.entries(dictionary)) {
      const ar = (domain as { ar: Record<string, unknown> }).ar;
      const keys = flatten(ar);
      const withArabic = keys.filter((key) => {
        const value = key.split(".").reduce<unknown>(
          (acc, part) => (acc as Record<string, unknown>)?.[part],
          ar,
        );
        return arabic.test(String(value));
      });
      assert.ok(
        withArabic.length >= keys.length * 0.5 && withArabic.length >= 5,
        `domain "${name}": only ${withArabic.length}/${keys.length} arabic strings contain Arabic script — the ar block looks untranslated`,
      );
    }
  });

  it("interpolation replaces known vars and keeps unknown ones", () => {
    assert.equal(interpolate("Hi {name}, {n} of {total}", { name: "Ali", n: 3 }), "Hi Ali, 3 of {total}");
  });

  it("formatters keep latin digits in arabic", () => {
    const fmtAr = formatters("ar");
    assert.match(fmtAr.num(1234567), /^1,234,567$/);
    assert.match(fmtAr.money(123456), /^\$1,234\.56$/);
    assert.equal(fmtAr.date(new Date("2026-09-29T12:00:00Z")).length > 0, true);
  });
});
