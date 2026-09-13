// Unit tests for the enrollment date-generation logic (spec §4.1: pure
// function, unit-tested — do not hand-wave the date math).
// Run: node --test tests/program-dates.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateEnrollmentDates, isoWeekday, nextMonday } from "../src/lib/program-dates.ts";

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
