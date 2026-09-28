/**
 * 空き時間の判定（lib/domain/availability.ts）のテスト
 * ------------------------------------------------------------------
 * 特に「最終受付は開始時刻の上限。ただし閉店を超えるものは不可」を確認します。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { computeAvailability, dayStatus } from "../lib/domain/availability";
import { DEFAULT_SETTINGS } from "../lib/domain/defaults";
import type { Reservation, Settings } from "../lib/domain/types";
import { addDays, todayJst } from "../lib/util/datetime";
import { holidayName } from "../lib/util/holidays";

/** 未来の平日を1つ選びます（祝日・土日を避ける） */
function futureWeekday(): string {
  let d = addDays(todayJst(), 7);
  while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()) || holidayName(d)) {
    d = addDays(d, 1);
  }
  return d;
}

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...structuredClone(DEFAULT_SETTINGS), ...patch };
}

function slot(date: string, duration: number, time: string, s: Settings, reservations: Reservation[] = []) {
  const result = computeAvailability({ date, durationMin: duration, settings: s, reservations });
  return result.slots.find((x) => x.time === time);
}

test("初期の営業時間は 7:00〜21:00（最終受付 20:00）", () => {
  assert.deepEqual(DEFAULT_SETTINGS.weekdayHours, { open: "07:00", lastStart: "20:00", close: "21:00" });
  assert.deepEqual(DEFAULT_SETTINGS.holidayHours, { open: "07:00", lastStart: "20:00", close: "21:00" });
});

test("最終受付 20:00・閉店 23:00 なら 20:00 開始の120分は予約できる（23:00 以内に終わる）", () => {
  const date = futureWeekday();
  const s = settings({ weekdayHours: { open: "07:00", lastStart: "20:00", close: "23:00" } });
  assert.equal(slot(date, 120, "20:00", s)?.available, true);
});

test("閉店 21:00 なら 20:00 開始の120分は予約できない（閉店を超える）", () => {
  const date = futureWeekday();
  const s = settings();
  assert.equal(slot(date, 120, "20:00", s)?.available, false);
  // 60分なら 21:00 ちょうどに終わるので予約できる
  assert.equal(slot(date, 60, "20:00", s)?.available, true);
});

test("最終受付より後の開始時刻は枠として出てこない", () => {
  const date = futureWeekday();
  const s = settings();
  assert.equal(slot(date, 30, "20:30", s), undefined);
  assert.equal(slot(date, 30, "07:00", s)?.available, true);
});

test("準備時間を含めた枠が既存の予約と1分でも重なれば不可、接しているだけなら可", () => {
  const date = futureWeekday();
  const s = settings({ bufferBeforeMin: 0, bufferAfterMin: 15 });
  const existing = {
    id: "r1",
    date,
    status: "confirmed",
    blockStartTime: "10:00",
    blockEndTime: "11:15",
    menuName: "x",
  } as Reservation;
  // 11:15 開始なら接しているだけ → 可
  assert.equal(slot(date, 60, "11:30", s, [existing])?.available, true);
  // 9:00 開始 60分 + 片付け15分 = 10:15 まで → 重なる → 不可
  assert.equal(slot(date, 60, "09:00", s, [existing])?.available, false);
  // 8:30 開始 60分 + 15分 = 9:45 → 可
  assert.equal(slot(date, 60, "08:30", s, [existing])?.available, true);
});

test("定休日・臨時休業日は予約できない", () => {
  const date = futureWeekday();
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  assert.equal(dayStatus(date, settings({ regularClosedWeekdays: [weekday] })).open, false);
  assert.equal(
    dayStatus(date, settings({ closedDates: [{ date, reason: "研修" }] })).reason,
    "研修",
  );
});

test("土日祝は「土日祝」の営業時間が使われる", () => {
  const s = settings({
    weekdayHours: { open: "07:00", lastStart: "20:00", close: "21:00" },
    holidayHours: { open: "09:00", lastStart: "17:00", close: "18:00" },
  });
  // 2026-11-03 文化の日（火曜）
  assert.deepEqual(dayStatus("2026-11-03", s).hours, s.holidayHours);
  // 2026-11-04（水曜・平日）
  assert.deepEqual(dayStatus("2026-11-04", s).hours, s.weekdayHours);
});
