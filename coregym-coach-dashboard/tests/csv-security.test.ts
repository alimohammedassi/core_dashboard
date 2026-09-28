import { test } from "node:test";
import assert from "node:assert/strict";
import { csvSafeField } from "../src/lib/csv.ts";

// API-02: exported CSV fields are user-controlled (client names/emails) and
// open in Excel/LibreOffice under the COACH's context — leading formula
// characters must be neutralized, structure characters must be quoted.

/** Unwraps one level of CSV quoting so guards can be asserted consistently. */
function parsed(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/""/g, '"');
  }
  return value;
}

test("csvSafeField passes through plain values untouched", () => {
  assert.equal(csvSafeField("Ahmed Ali"), "Ahmed Ali");
  assert.equal(csvSafeField(42), "42");
  assert.equal(csvSafeField(null), "");
  assert.equal(csvSafeField(undefined), "");
  assert.equal(csvSafeField(""), "");
});

test("csvSafeField quotes fields containing structural characters", () => {
  assert.equal(csvSafeField('He said "hi"'), '"He said ""hi"""');
  assert.equal(csvSafeField("a,b"), '"a,b"');
  assert.equal(csvSafeField("line1\nline2"), '"line1\nline2"');
});

test("csvSafeField neutralizes formula-injection leading characters", () => {
  for (const malicious of ['=HYPERLINK("http://evil","win")', "=cmd|'/c calc'!A1", "+1+1", "-2+3", "@SUM(1)", "\tTAB-Lead"]) {
    const out = csvSafeField(malicious);
    const unwrapped = parsed(out);
    assert.ok(
      unwrapped.startsWith("'"),
      `expected apostrophe guard after parse for: ${malicious} (serialized: ${out})`
    );
    assert.ok(!out.includes("\r"));
  }
});

test("csvSafeField strips bare carriage returns (row-splitting)", () => {
  assert.equal(csvSafeField("bad\rrow"), "badrow");
});

test("csvSafeField keeps guard and quoting orthogonal", () => {
  // Needs BOTH: a structural comma and a leading formula character.
  const out = csvSafeField("=1,2");
  assert.equal(out, "\"'=1,2\"");
  assert.equal(parsed(out), "'=1,2");
});
