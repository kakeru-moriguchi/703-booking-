/**
 * 二重予約の防止（lib/domain/booking.ts）のテスト
 * ==================================================================
 * 本物の Google カレンダーの代わりに「偽のカレンダー」を用意し、
 * Vercel で別々のサーバー（インスタンス）が同時に予約を受けた状況を再現します。
 *
 * 別サーバーの再現方法:
 *   booking.ts をキャッシュから外して2回読み込み、
 *   「同一サーバー内のロック」を持たない2つの独立したコピーを作ります。
 *   カレンダー（偽物）と保存先は共有します（本番と同じ）。
 *
 * 確認すること:
 *   ・どんな順番で処理が重なっても、成立する予約は必ず1件だけ
 *   ・負けた方には決められた文言が返る
 *   ・「先に確定した予約」より ID が小さいイベントが後から来ても、後から来た方が負ける
 *     （ID だけで勝敗を決めると両方成立してしまうケース）
 */
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

/* ---------------- Google の設定（偽物）を先に入れておきます ---------------- */
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.GOOGLE_CLIENT_EMAIL = "test@example.iam.gserviceaccount.com";
process.env.GOOGLE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
process.env.GOOGLE_CALENDAR_ID = "salon@example.com";
delete process.env.GOOGLE_SPREADSHEET_ID; // 保存先はメモリ（共有）
delete process.env.MOCK_MODE;

/* ---------------- 偽の Google カレンダー ---------------- */
type FakeEvent = {
  id: string;
  updated: string;
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
  extendedProperties?: { private?: Record<string, string> };
};

const calendar = new Map<string, FakeEvent>();
let idCounter = 0;
/** 後から作られたイベントほど ID が「小さく」なるようにします（ID だけの判定が破れるケース） */
let descendingIds = false;
let clock = Date.parse("2026-01-01T00:00:00.000Z");
/** 各リクエストの前に入れる待ち時間（処理の重なり方を変えるため） */
let jitter = () => 0;
/** イベント作成の直前に呼ばれるフック（順番を固定したいテスト用） */
let beforeInsert: (summary: string) => Promise<void> = async () => undefined;

function nextId(): string {
  idCounter += 1;
  const n = descendingIds ? 1_000_000 - idCounter : idCounter;
  return `evt${String(n).padStart(7, "0")}`;
}

function nextUpdated(): string {
  clock += 1; // 1ミリ秒ずつ進めます（Google の updated と同じくミリ秒精度）
  return new Date(clock).toISOString();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  await sleep(jitter());

  if (url.host === "oauth2.googleapis.com") {
    return Response.json({ access_token: "fake", expires_in: 3600 });
  }
  if (url.host !== "www.googleapis.com") return realFetch(input, init);

  const match = url.pathname.match(/\/calendars\/[^/]+\/events(?:\/([^/]+))?$/);
  assert.ok(match, `想定外の URL: ${url.pathname}`);
  const eventId = match[1] ? decodeURIComponent(match[1]) : null;

  if (method === "GET") {
    const min = Date.parse(url.searchParams.get("timeMin")!);
    const max = Date.parse(url.searchParams.get("timeMax")!);
    const items = [...calendar.values()].filter(
      (e) => Date.parse(e.end.dateTime) > min && Date.parse(e.start.dateTime) < max,
    );
    return Response.json({ items: structuredClone(items) });
  }
  if (method === "POST") {
    const body = JSON.parse(String(init?.body)) as FakeEvent;
    await beforeInsert(body.summary);
    const event = { ...body, id: nextId(), updated: nextUpdated() };
    calendar.set(event.id, event);
    return Response.json(event);
  }
  if (method === "PUT" && eventId) {
    const body = JSON.parse(String(init?.body)) as FakeEvent;
    const event = { ...body, id: eventId, updated: nextUpdated() };
    calendar.set(eventId, event);
    return Response.json(event);
  }
  if (method === "DELETE" && eventId) {
    calendar.delete(eventId);
    return new Response(null, { status: 204 });
  }
  throw new Error(`想定外のリクエスト: ${method} ${url}`);
}) as typeof fetch;

/* ---------------- 「別々のサーバー」を2つ用意します ---------------- */
type BookingModule = typeof import("../lib/domain/booking");

function loadInstance(): BookingModule {
  const path = require.resolve("../lib/domain/booking");
  delete require.cache[path];
  return require(path);
}

const serverA = loadInstance();
const serverB = loadInstance();

import { getStore } from "../lib/store";
import { addDays, todayJst } from "../lib/util/datetime";
import { holidayName } from "../lib/util/holidays";

/** 重ならない未来の平日（祝日を除く）を順番に並べたもの。テストごとに別の日を使います */
const DAYS: string[] = [];
for (let d = addDays(todayJst(), 3); DAYS.length < 32; d = addDays(d, 1)) {
  if (![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()) && !holidayName(d)) DAYS.push(d);
}

function input(date: string, menuId: string, startTime: string, user: string) {
  return {
    lineUserId: `U${user.padStart(32, "0")}`,
    customerName: "テスト",
    phone: "09000000000",
    menuId,
    optionIds: [],
    date,
    startTime,
    note: "",
    source: "customer" as const,
  };
}

const CONFLICT =
  "申し訳ありません。この時間は先ほど他のお客様の予約が入りました。\n別のお時間をお選びください。";

async function confirmedOn(date: string) {
  return (await getStore().listReservations({ date })).filter((r) => r.status === "confirmed");
}

test("同時に申し込まれても、成立するのは必ず片方だけ（ランダムな重なり方で100回）", async () => {
  jitter = () => Math.floor(Math.random() * 6);
  for (let i = 0; i < 100; i++) {
    descendingIds = i % 2 === 0;
    // 毎回違う日時の同じ枠を、2人が取り合います
    const date = DAYS[Math.floor(i / 10)];
    const time = `${String(7 + (i % 10)).padStart(2, "0")}:00`;
    const before = (await confirmedOn(date)).length;

    const [a, b] = await Promise.all([
      serverA.createReservation(input(date, "sample-60", time, `a${i}`)),
      serverB.createReservation(input(date, "sample-60", time, `b${i}`)),
    ]);

    const wins = [a, b].filter((r) => r.ok).length;
    assert.equal(wins, 1, `${i}回目: 成立した予約が ${wins} 件`);
    const loser = a.ok ? b : a;
    assert.equal(loser.ok, false);
    if (!loser.ok) {
      assert.equal(loser.error.code, "conflict");
      assert.equal(loser.error.message, CONFLICT);
    }
    assert.equal((await confirmedOn(date)).length, before + 1);
  }
  jitter = () => 0;
});

test("先に確定した予約より ID が小さいイベントが後から来ても、後の方が負ける", async () => {
  descendingIds = true; // 後から作るイベントほど ID が小さい
  const date = DAYS[10];

  /*
    順番を固定します。
      1. A が空き確認を終え、イベント作成に進む（ここで A を止める）
      2. B がイベント作成 → 再確認 → 確定まで終える（A のイベントはまだ無い）
      3. A を再開。A のイベントは B より ID が小さいが、B より後に押さえている
      → A は必ず譲らなければならない
  */
  let releaseA!: () => void;
  const aHeld = new Promise<void>((r) => (releaseA = r));
  let aArrived!: () => void;
  const aAtInsert = new Promise<void>((r) => (aArrived = r));

  beforeInsert = async (summary) => {
    if (summary.includes("テストメニュー120分")) {
      aArrived();
      await aHeld; // B が終わるまで待たせます
    } else {
      await aAtInsert; // A が空き確認を終えるまで B の作成を待たせます
    }
  };

  const pA = serverA.createReservation(input(date, "sample-120", "10:00", "aa"));
  const pB = serverB.createReservation(input(date, "sample-60", "10:30", "bb"));

  const b = await pB;
  assert.equal(b.ok, true, "先に確定した B は成立する");
  releaseA();
  const a = await pA;
  beforeInsert = async () => undefined;

  assert.equal(a.ok, false, "後から押さえた A は、ID が小さくても譲る");
  if (!a.ok) assert.equal(a.error.message, CONFLICT);

  const confirmed = await confirmedOn(date);
  assert.equal(confirmed.length, 1);
  // カレンダーにも B の予定だけが残っています（A のイベントは削除済み）
  const left = [...calendar.values()].filter((e) => e.start.dateTime.startsWith(date));
  assert.equal(left.length, 1);
  assert.ok(left[0].summary.includes("テストメニュー60分"));
});

test("カレンダーの予定名は「サロン名予約｜メニュー名」だけ（個人情報を入れない）", async () => {
  const date = DAYS[11];
  const r = await serverA.createReservation({
    ...input(date, "sample-30", "15:00", "cc"),
    customerName: "山田花子",
    phone: "09011112222",
    note: "秘密のメモ",
  });
  assert.equal(r.ok, true);
  const event = [...calendar.values()].find((e) => e.start.dateTime.startsWith(`${date}T15:00`));
  assert.ok(event);
  assert.equal(event.summary, "ビューティーサロン703予約｜【動作確認用】テストメニュー30分");
  const whole = JSON.stringify(event);
  for (const secret of ["山田花子", "09011112222", "秘密のメモ"]) {
    assert.ok(!whole.includes(secret), `カレンダーに ${secret} が含まれています`);
  }
});

test("予約変更どうしが同じ枠に同時に動いても、成立するのは片方だけ", async () => {
  jitter = () => Math.floor(Math.random() * 6);
  for (let i = 0; i < 15; i++) {
    const date = DAYS[12 + i];
    const x = await serverA.createReservation(input(date, "sample-60", "07:00", `x${i}`));
    const y = await serverA.createReservation(input(date, "sample-60", "09:00", `y${i}`));
    assert.ok(x.ok && y.ok);
    if (!x.ok || !y.ok) return;

    // 2人が同時に 12:00 へ変更しようとします
    const [cx, cy] = await Promise.all([
      serverA.changeReservation(x.value.id, { date, startTime: "12:00" }, x.value.lineUserId),
      serverB.changeReservation(y.value.id, { date, startTime: "12:00" }, y.value.lineUserId),
    ]);
    const wins = [cx, cy].filter((r) => r.ok).length;
    assert.ok(wins <= 1, `${i}回目: 変更が ${wins} 件とも成立しました`);
    const at12 = (await confirmedOn(date)).filter((r) => r.startTime === "12:00");
    assert.ok(at12.length <= 1);
  }
  jitter = () => 0;
});

test("他人の予約は変更もキャンセルもできない（403 相当）", async () => {
  const date = DAYS[28];
  const mine = await serverA.createReservation(input(date, "sample-30", "11:00", "owner"));
  assert.ok(mine.ok);
  if (!mine.ok) return;
  const other = `U${"other".padStart(32, "0")}`;
  const change = await serverA.changeReservation(mine.value.id, { date, startTime: "13:00" }, other);
  assert.equal(change.ok, false);
  if (!change.ok) assert.equal(change.error.code, "forbidden");
  const cancel = await serverA.cancelReservation(mine.value.id, other);
  assert.equal(cancel.ok, false);
  if (!cancel.ok) assert.equal(cancel.error.code, "forbidden");
  // 本人ならキャンセルでき、カレンダーの予定も消える
  const own = await serverA.cancelReservation(mine.value.id, mine.value.lineUserId);
  assert.equal(own.ok, true);
  assert.ok(![...calendar.values()].some((e) => e.id === mine.value.googleCalendarEventId));
});

test("予約変更で LINE userId は変わらない", async () => {
  const date = DAYS[29];
  const r = await serverA.createReservation(input(date, "sample-30", "08:00", "keep"));
  assert.ok(r.ok);
  if (!r.ok) return;
  const changed = await serverA.changeReservation(r.value.id, { date, startTime: "16:00" }, r.value.lineUserId);
  assert.ok(changed.ok);
  if (changed.ok) assert.equal(changed.value.after.lineUserId, r.value.lineUserId);
});
