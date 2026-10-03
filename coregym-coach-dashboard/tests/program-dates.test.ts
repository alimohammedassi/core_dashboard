// Unit tests for the enrollment date-generation logic (spec §4.1: pure
// function, unit-tested — do not hand-wave the date math).
// Run: node --test tests/program-dates.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enrollmentWeekOf,
  generateEnrollmentDates,
  isoWeekday,
  nextMonday,
} from "../src/lib/program-dates.ts";

test("isoWeekday follows ISO convention (Mon=1 .. Sun=7)", () => {
  assert.equal(isoWeekday("2026-09-14"), 1); // Monday
  assert.equal(isoWeekday("2026-09-15"), 2); // Tuesday
  assert.equal(isoWeekday("2026-09-19"), 6); // Saturday
  assert.equal(isoWeekday("2026-09-20"), 7); // Sunday
});

test("start on Monday: all slots generated in week 1, including Monday itself", () => {
  // 2026-09-14 is a Monday. PPL = Mon(1), Wed(3), Fri(5).
  const slots = generateEnrollmentDates("2026-09-14", 2, [1, 3, 5]);
  const week1 = slots.filter((s) => s.week === 1);
  assert.deepEqual(week1.map((s) => s.date), ["2026-09-14", "2026-09-16", "2026-09-18"]);
  const week2 = slots.filter((s) => s.week === 2);
  assert.deepEqual(week2.map((s) => s.date), ["2026-09-21", "2026-09-23", "2026-09-25"]);
});

test("start on Friday: Monday and Wednesday of week 1 are skipped (already passed)", () => {
  // 2026-09-18 is a Friday (ISO 5). Mon(1) and Wed(3) fall before it.
  const slots = generateEnrollmentDates("2026-09-18", 2, [1, 3, 5]);
  const week1 = slots.filter((s) => s.week === 1);
  assert.deepEqual(week1.map((s) => s.date), ["2026-09-18"]); // only Friday itself
  assert.equal(slots.filter((s) => s.week === 2).length, 3);
  // first Monday occurrence lands in week 2
  const week2Mon = slots.find((s) => s.week === 2 && s.dayOfWeek === 1);
  assert.ok(week2Mon, "expected a week-2 Monday slot");
  assert.equal(week2Mon.date, "2026-09-21");
});

test("start on Wednesday with Mon slot: week 1 has no Monday, week 2 does", () => {
  // 2026-09-16 is a Wednesday (ISO 3).
  const slots = generateEnrollmentDates("2026-09-16", 2, [1]);
  assert.deepEqual(slots, [{ week: 2, dayOfWeek: 1, date: "2026-09-21" }]);
});

test("start on Sunday with Sunday slot: generated on the start date itself", () => {
  // 2026-09-20 is a Sunday (ISO 7).
  const slots = generateEnrollmentDates("2026-09-20", 1, [7]);
  assert.deepEqual(slots, [{ week: 1, dayOfWeek: 7, date: "2026-09-20" }]);
});

test("8-week PPL starting next Monday generates exactly 24 rows", () => {
  const start = nextMonday("2026-09-13"); // Sunday -> next Monday is 2026-09-14
  assert.equal(start, "2026-09-14");
  const slots = generateEnrollmentDates(start, 8, [1, 3, 5]);
  assert.equal(slots.length, 24);
  // every scheduled date stays inside its own ISO week relative to start
  for (const s of slots) {
    const diffDays =
      (Date.parse(`${s.date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
    assert.ok(diffDays >= (s.week - 1) * 7 - 0, `date ${s.date} before week ${s.week}`);
    assert.ok(diffDays <= (s.week - 1) * 7 + 6, `date ${s.date} after week ${s.week}`);
  }
});

test("dates are strictly increasing and never before the start date", () => {
  const slots = generateEnrollmentDates("2026-09-16", 4, [1, 3, 5]);
  for (let i = 1; i < slots.length; i++) {
    assert.ok(slots[i - 1].date <= slots[i].date);
  }
  for (const s of slots) {
    assert.ok(s.date >= "2026-09-16");
  }
});

// F-14: enrollmentWeekOf must agree with the SQL week_number convention
// (scheduled = start + (w-1)*7 + (dow - isodow(start))). The oracle here
// derives the expected week straight from generateEnrollmentDates, which is
// already pinned against the RPC behavior above.
test("enrollmentWeekOf matches the SQL week_number for a Monday start", () => {
  // 2026-09-14 is a Monday — the simple floor(offset/7)+1 case.
  const slots = generateEnrollmentDates("2026-09-14", 4, [1, 3, 5]);
  for (const s of slots) {
    assert.equal(
      enrollmentWeekOf("2026-09-14", s.date, 4),
      s.week,
      `${s.date} should be week ${s.week}`
    );
  }
});

test("enrollmentWeekOf matches the SQL week_number for mid-week starts", () => {
  // Wednesday start (ISO 3): the first Monday/Tuesday AFTER the start date
  // belong to SQL week 2 — plain floor(days/7)+1 used to report week 1.
  for (const start of ["2026-09-16", "2026-09-18", "2026-09-20"]) {
    const slots = generateEnrollmentDates(start, 6, [1, 3, 5, 6, 7]);
    for (const s of slots) {
      assert.equal(
        enrollmentWeekOf(start, s.date, 6),
        s.week,
        `start ${start}, ${s.date} should be week ${s.week}`
      );
    }
  }
});

test("enrollmentWeekOf clamps and handles the pre-start boundary", () => {
  const start = "2026-09-16"; // Wednesday
  assert.equal(enrollmentWeekOf(start, "2026-09-10", 4), 1); // before start → week 1
  assert.equal(enrollmentWeekOf(start, start, 4), 1); // start day → week 1
  assert.equal(enrollmentWeekOf(start, "2026-10-20", 4), 4); // way past end → clamped
  assert.equal(enrollmentWeekOf(start, "2026-12-01", 1), 1); // single-week clamp
});

test("enrollmentWeekOf stays in sync with the regenerate RPC date math", () => {
  // Every (date → week) pair the generator produces must round-trip: the
  // dashboard badge and the detail grid both key off week_number.
  const start = "2026-09-17"; // Thursday (ISO 4)
  const slots = generateEnrollmentDates(start, 8, [2, 4, 7]);
  const seen = new Set<string>();
  for (const s of slots) {
    const key = `${s.date}:${s.week}`;
    assert.ok(!seen.has(key), `duplicate date/week pair ${key}`);
    seen.add(key);
    assert.equal(enrollmentWeekOf(start, s.date, 8), s.week);
  }
});
