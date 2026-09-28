/** 日本の祝日の自動判定（lib/util/holidays.ts）のテスト */
import test from "node:test";
import assert from "node:assert/strict";
import { holidayName } from "../lib/util/holidays";

test("固定の祝日・ハッピーマンデー", () => {
  assert.equal(holidayName("2026-01-01"), "元日");
  assert.equal(holidayName("2026-01-12"), "成人の日");
  assert.equal(holidayName("2026-07-20"), "海の日");
  assert.equal(holidayName("2026-10-12"), "スポーツの日");
});

test("春分の日・秋分の日（計算で求める祝日）", () => {
  assert.equal(holidayName("2026-03-20"), "春分の日");
  assert.equal(holidayName("2026-09-23"), "秋分の日");
});

test("振替休日（2026年5月3日が日曜 → 5月6日が振替休日）", () => {
  assert.equal(holidayName("2026-05-03"), "憲法記念日");
  assert.equal(holidayName("2026-05-06"), "振替休日");
});

test("国民の休日（2026年9月22日は敬老の日と秋分の日に挟まれる）", () => {
  assert.equal(holidayName("2026-09-21"), "敬老の日");
  assert.equal(holidayName("2026-09-22"), "国民の休日");
});

test("平日は null", () => {
  assert.equal(holidayName("2026-09-24"), null);
});
