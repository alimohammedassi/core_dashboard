// Pure date-generation logic for Coach Weekly Programs enrollments.
// This mirrors the SQL in create_program_enrollment_atomic /
// regenerate_remaining_enrollment_assignments exactly — the database is
// authoritative for generation, this module exists for UI display (progress
// grids, expected-assignment counts) and is unit-tested to prove the
// week-1 edge case behaves identically.

// ISO weekday: 1 = Monday ... 7 = Sunday (same convention as coach_program_days.day_of_week
// and Postgres `extract(isodow from date)`).
export function isoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = d.getUTCDay(); // JS: 0 = Sunday .. 6 = Saturday
  return dow === 0 ? 7 : dow;
}

export type GeneratedSlot = {
  week: number; // 1-indexed, relative to the enrollment start date
  dayOfWeek: number; // ISO 1..7
  date: string; // YYYY-MM-DD, date-only (UTC-safe)
};

// All (week, weekday) occurrences of the given training days across the
// enrollment. Week-1 edge case from the spec: a weekday earlier in the ISO
// week than start_date's own weekday has already passed relative to
// start_date, so its first generated occurrence is in week 2.
export function generateEnrollmentDates(
  startDate: string,
  durationWeeks: number,
  daysOfWeek: number[]
): GeneratedSlot[] {
  const isoStart = isoWeekday(startDate);
  const slots: GeneratedSlot[] = [];
  const days = [...daysOfWeek].sort((a, b) => a - b);

  for (let week = 1; week <= durationWeeks; week++) {
    for (const dayOfWeek of days) {
      if (week === 1 && dayOfWeek < isoStart) continue;
      const d = new Date(`${startDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + (week - 1) * 7 + (dayOfWeek - isoStart));
      slots.push({ week, dayOfWeek, date: d.toISOString().slice(0, 10) });
    }
  }
  return slots;
}

// The next Monday on or after the given date — used as the natural default
// for "start date" in the enroll dialog.
export function nextMonday(from: string): string {
  const iso = isoWeekday(from);
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((8 - iso) % 7));
  return d.toISOString().slice(0, 10);
}

// F-14: which enrollment week (1-indexed) does `today` fall in, using the SQL
// convention as the source of truth? Both create_*_enrollment_atomic RPCs
// schedule each day at `start_date + (w - 1) * 7 + (day_of_week - isodow(start))`,
// so week w spans the offsets [(w-1)*7 - (isoStart-1), w*7 - isoStart] — with a
// mid-week start, week 1 is the partial week ending the Sunday after start.
// Solving for w gives floor((offset + isoStart - 1) / 7) + 1, which this helper
// implements; plain floor(offset / 7) + 1 drifts a full week behind for every
// Monday/Tuesday after a mid-week start. Days before start_date report week 1
// (nothing is scheduled yet); the result is clamped to [1, durationWeeks].
export function enrollmentWeekOf(startDate: string, today: string, durationWeeks: number): number {
  const diff = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000
  );
  if (!Number.isFinite(diff) || diff <= 0) return 1;
  const week = Math.floor((diff + isoWeekday(startDate) - 1) / 7) + 1;
  return Math.min(Math.max(week, 1), Math.max(1, Math.trunc(durationWeeks) || 1));
}
