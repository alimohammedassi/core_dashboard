/* Locale-aware date/number/currency formatting shared by server and client.
   Arabic uses ar-EG month names with Latin digits (see intlLocale). */

import { intlLocale, type Lang } from "./config.ts";

type DateLike = Date | string | number;

function toDate(value: DateLike): Date {
  return value instanceof Date ? value : new Date(value);
}

export interface Formatters {
  /** "Sep 29, 2026" / "٢٩ سبتمبر ٢٠٢٦"→ Latin digits: "29 سبتمبر 2026" */
  date: (value: DateLike, opts?: Intl.DateTimeFormatOptions) => string;
  dateTime: (value: DateLike) => string;
  time: (value: DateLike) => string;
  /** Weekday + short date, for lists and tables. */
  weekdayDate: (value: DateLike) => string;
  /** Grouped integer: 1,234,567 */
  num: (value: number, opts?: Intl.NumberFormatOptions) => string;
  /** USD dollars from Stripe cents: "$1,234.56" (same shape in Arabic). */
  money: (cents: number) => string;
  /** USD from a whole-dollar number, no decimals: "$1,234" */
  moneyShort: (dollars: number) => string;
  /** Percent from a 0–100 number. */
  percent: (value: number) => string;
}

export function formatters(lang: Lang): Formatters {
  const locale = intlLocale(lang);
  const shortDate: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  };
  return {
    date: (value, opts) =>
      new Intl.DateTimeFormat(locale, opts ?? shortDate).format(toDate(value)),
    dateTime: (value) =>
      new Intl.DateTimeFormat(locale, { ...shortDate, hour: "numeric", minute: "2-digit" }).format(
        toDate(value),
      ),
    time: (value) =>
      new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(toDate(value)),
    weekdayDate: (value) =>
      new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(
        toDate(value),
      ),
    num: (value, opts) => new Intl.NumberFormat(locale, opts).format(value),
    money: (cents) => `$${new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).format(cents / 100)}`,
    moneyShort: (dollars) =>
      `$${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(dollars)}`,
    percent: (value) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value) + "%",
  };
}
