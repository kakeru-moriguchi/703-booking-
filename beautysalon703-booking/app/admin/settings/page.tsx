/**
 * 設定（管理画面）
 * ==================================================================
 * 営業時間・準備時間・休業日・受付停止・LINE通知の設定を行います。
 * メニュー・オプション（追加・編集・並べ替え・削除）もここから行えます。
 *
 * ★ 保存した内容はスプレッドシートに記録されます。
 *   コードを書き換える必要はありません。
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/Button";
import { Loading, Notice } from "@/components/ui/Notice";
import { apiGet, apiPut } from "@/lib/client/api";
import { formatDateShortJa, todayJst } from "@/lib/util/datetime";
import { MENU_CATEGORY_LABELS } from "@/lib/domain/defaults";

type DayHours = { open: string; lastStart: string; close: string };
type ClosedDate = { date: string; reason: string };
type BlockedSlot = { id: string; date: string; start: string; end: string; reason: string };

type Settings = {
  weekdayHours: DayHours;
  holidayHours: DayHours;
  slotIntervalMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  regularClosedWeekdays: number[];
  closedDates: ClosedDate[];
  specialHours: Array<DayHours & { date: string; label: string }>;
  blockedSlots: BlockedSlot[];
  acceptingReservations: boolean;
  suspendedMessage: string;
  maxAdvanceDays: number;
  minAdvanceHours: number;
  changeDeadlineHours: number;
  notify: {
    customerOnCreate: boolean;
    customerOnChange: boolean;
    customerOnCancel: boolean;
    adminOnCreate: boolean;
    adminOnChange: boolean;
    adminOnCancel: boolean;
  };
};

type Menu = {
  id: string;
  name: string;
  description: string;
  category: "course" | "partial" | "secret";
  durationMin: number;
  price: number;
  order: number;
  visible: boolean;
};

type Option = {
  id: string;
  name: string;
  description: string;
  price: number;
  extraDurationMin: number;
  order: number;
  visible: boolean;
};

const CATEGORY_OPTIONS: Array<[string, string]> = (
  Object.entries(MENU_CATEGORY_LABELS) as Array<[Menu["category"], string]>
).map(([value, label]) => [value, label]);

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const BUFFERS = [0, 15, 30, 45, 60];

function SettingsForm({ lineEnabled }: { lineEnabled: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error">("success");

  const [newClosedDate, setNewClosedDate] = useState(todayJst());
  const [newClosedReason, setNewClosedReason] = useState("");

  const [newBlock, setNewBlock] = useState({
    date: todayJst(),
    start: "10:00",
    end: "12:00",
    reason: "",
  });

  useEffect(() => {
    void (async () => {
      const s = await apiGet<{ settings: Settings }>("/api/admin/settings");
      if (s.ok) setSettings(s.data.settings);
      setLoading(false);
    })();
  }, []);

  const patch = useCallback((update: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...update } : s));
  }, []);

  const saveSettings = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setMessage("");

    const result = await apiPut<{ settings: Settings }>("/api/admin/settings", settings);
    if (!result.ok) {
      setTone("error");
      setMessage(result.error.message);
    } else {
      setSettings(result.data.settings);
      setTone("success");
      setMessage("設定を保存しました。");
    }
    setSaving(false);
  }, [settings]);

  if (loading) return <Loading />;

  /*
    設定が読めなかった場合。
    ★ ここでも必ず接続診断を表示します。
      原因を調べたいのはまさにこの状況だからです。
  */
  if (!settings) {
    return (
      <div className="flex flex-col gap-6">
        <Notice tone="error">
          {"設定を読み込めませんでした。\n下の「接続を確認する」を押すと、どこで止まっているか分かります。"}
        </Notice>
        <Diagnostics />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-6">
      {message && <Notice tone={tone}>{message}</Notice>}

      <Diagnostics />

      {/* ============ 予約の受付 ============ */}
      <Section title="予約の受付" description="一時的に新規予約を止めたいときに使います。">
        <Toggle
          label="新規予約を受け付ける"
          checked={settings.acceptingReservations}
          onChange={(v) => patch({ acceptingReservations: v })}
        />
        {!settings.acceptingReservations && (
          <Textarea
            label="受付停止中にお客様へ表示する文章"
            value={settings.suspendedMessage}
            onChange={(v) => patch({ suspendedMessage: v })}
          />
        )}
      </Section>

      {/* ============ 営業時間 ============ */}
      <Section
        title="営業時間"
        description="最終受付は「施術を始められる最後の時刻」です。ただし閉店時刻を超えるメニューは受け付けません。例：最終受付 20:00・閉店 23:00 なら、20:00 開始の 120 分メニュー（22:00 終了）は予約できます。閉店 21:00 なら予約できません。"
      >
        <HoursEditor
          label="平日（月〜金）"
          value={settings.weekdayHours}
          onChange={(v) => patch({ weekdayHours: v })}
        />
        <HoursEditor
          label="土・日・祝"
          value={settings.holidayHours}
          onChange={(v) => patch({ holidayHours: v })}
        />
        <p className="text-[0.78rem] leading-relaxed text-botanical-400">
          日本の祝日は自動で判定されます（振替休日・国民の休日を含みます）。
        </p>
      </Section>

      {/* ============ 予約枠 ============ */}
      <Section
        title="予約枠と準備時間"
        description="施術の前後に確保する時間です。設定するとその分だけ予約枠が長くなります。"
      >
        <Select
          label="予約枠の刻み"
          value={String(settings.slotIntervalMin)}
          options={[10, 15, 20, 30, 60].map((n) => [String(n), `${n}分ごと`])}
          onChange={(v) => patch({ slotIntervalMin: Number(v) })}
        />
        <Select
          label="施術前の準備時間"
          value={String(settings.bufferBeforeMin)}
          options={BUFFERS.map((n) => [String(n), `${n}分`])}
          onChange={(v) => patch({ bufferBeforeMin: Number(v) })}
        />
        <Select
          label="施術後の片付け時間"
          value={String(settings.bufferAfterMin)}
          options={BUFFERS.map((n) => [String(n), `${n}分`])}
          onChange={(v) => patch({ bufferAfterMin: Number(v) })}
        />
      </Section>

      {/* ============ 受付期間 ============ */}
      <Section title="受付期間">
        <NumberField
          label="何日先まで予約を受け付けるか"
          value={settings.maxAdvanceDays}
          onChange={(v) => patch({ maxAdvanceDays: v })}
          suffix="日先まで"
          min={1}
          max={365}
        />
        <NumberField
          label="何時間後から予約を受け付けるか"
          value={settings.minAdvanceHours}
          onChange={(v) => patch({ minAdvanceHours: v })}
          suffix="時間後から"
          min={0}
          max={168}
        />
        <NumberField
          label="変更・キャンセルの締切"
          value={settings.changeDeadlineHours}
          onChange={(v) => patch({ changeDeadlineHours: v })}
          suffix="時間前まで"
          min={0}
          max={168}
        />
      </Section>

      {/* ============ 定休日 ============ */}
      <Section
        title="定休日"
        description="毎週決まった休みがある場合に選びます。不定休の場合は選択不要です。"
      >
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((label, index) => {
            const on = settings.regularClosedWeekdays.includes(index);
            return (
              <button
                key={label}
                type="button"
                onClick={() =>
                  patch({
                    regularClosedWeekdays: on
                      ? settings.regularClosedWeekdays.filter((d) => d !== index)
                      : [...settings.regularClosedWeekdays, index],
                  })
                }
                className={`h-12 w-12 rounded-full border text-[0.9rem] transition-colors ${
                  on
                    ? "border-botanical-700 bg-botanical-700 text-white"
                    : "border-botanical-700/30 bg-white text-botanical-600"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* ============ 臨時休業 ============ */}
      <Section
        title="臨時休業日"
        description="Google カレンダーに終日予定を入れても、その日は自動で休業になります。"
      >
        <div className="flex flex-col gap-2">
          {settings.closedDates.length === 0 && (
            <p className="text-[0.85rem] text-botanical-400">登録されていません。</p>
          )}
          {settings.closedDates
            .slice()
            .sort((a, b) => (a.date < b.date ? -1 : 1))
            .map((c) => (
              <div
                key={c.date}
                className="flex items-center gap-3 rounded-sm border border-botanical-700/25 bg-white/70 px-4 py-3"
              >
                <span className="text-[0.9rem] text-botanical-800">
                  {formatDateShortJa(c.date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.82rem] text-botanical-500">
                  {c.reason}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      closedDates: settings.closedDates.filter((x) => x.date !== c.date),
                    })
                  }
                  className="shrink-0 text-[0.8rem] text-clay underline underline-offset-4"
                >
                  削除
                </button>
              </div>
            ))}
        </div>

        <div className="flex flex-col gap-2 rounded-sm border border-dashed border-botanical-700/40 p-4">
          <input
            type="date"
            value={newClosedDate}
            onChange={(e) => setNewClosedDate(e.target.value)}
            aria-label="休業日"
            className="min-h-[48px] rounded-sm border border-botanical-700/30 bg-white px-4 text-botanical-800"
          />
          <input
            value={newClosedReason}
            onChange={(e) => setNewClosedReason(e.target.value)}
            placeholder="理由（お客様に表示されます）"
            maxLength={60}
            aria-label="休業の理由"
            className="min-h-[48px] rounded-sm border border-botanical-700/30 bg-white px-4 text-botanical-800"
          />
          <Button
            variant="outline"
            size="md"
            onClick={() => {
              if (!newClosedDate) return;
              if (settings.closedDates.some((c) => c.date === newClosedDate)) return;
              patch({
                closedDates: [
                  ...settings.closedDates,
                  {
                    date: newClosedDate,
                    reason: newClosedReason || "お休みをいただいております。",
                  },
                ],
              });
              setNewClosedReason("");
            }}
          >
            休業日を追加
          </Button>
        </div>
      </Section>

      {/* ============ 受付停止時間 ============ */}
      <Section
        title="予約受付を止める時間帯"
        description="その日の一部の時間だけ予約を止めたいときに使います（用事・私用など）。"
      >
        <div className="flex flex-col gap-2">
          {settings.blockedSlots.length === 0 && (
            <p className="text-[0.85rem] text-botanical-400">登録されていません。</p>
          )}
          {settings.blockedSlots
            .slice()
            .sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1))
            .map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-sm border border-botanical-700/25 bg-white/70 px-4 py-3"
              >
                <span className="text-[0.85rem] text-botanical-800">
                  {formatDateShortJa(b.date)} {b.start}〜{b.end}
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.8rem] text-botanical-500">
                  {b.reason}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      blockedSlots: settings.blockedSlots.filter((x) => x.id !== b.id),
                    })
                  }
                  className="shrink-0 text-[0.8rem] text-clay underline underline-offset-4"
                >
                  削除
                </button>
              </div>
            ))}
        </div>

        <div className="flex flex-col gap-2 rounded-sm border border-dashed border-botanical-700/40 p-4">
          <input
            type="date"
            value={newBlock.date}
            onChange={(e) => setNewBlock({ ...newBlock, date: e.target.value })}
            aria-label="受付停止の日付"
            className="min-h-[48px] rounded-sm border border-botanical-700/30 bg-white px-4 text-botanical-800"
          />
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={newBlock.start}
              onChange={(e) => setNewBlock({ ...newBlock, start: e.target.value })}
              aria-label="開始時刻"
              className="min-h-[48px] flex-1 rounded-sm border border-botanical-700/30 bg-white px-3 text-botanical-800"
            />
            <span className="text-botanical-400">〜</span>
            <input
              type="time"
              value={newBlock.end}
              onChange={(e) => setNewBlock({ ...newBlock, end: e.target.value })}
              aria-label="終了時刻"
              className="min-h-[48px] flex-1 rounded-sm border border-botanical-700/30 bg-white px-3 text-botanical-800"
            />
          </div>
          <input
            value={newBlock.reason}
            onChange={(e) => setNewBlock({ ...newBlock, reason: e.target.value })}
            placeholder="メモ（管理者のみ表示）"
            maxLength={60}
            aria-label="受付停止のメモ"
            className="min-h-[48px] rounded-sm border border-botanical-700/30 bg-white px-4 text-botanical-800"
          />
          <Button
            variant="outline"
            size="md"
            onClick={() => {
              if (!newBlock.date || newBlock.start >= newBlock.end) return;
              patch({
                blockedSlots: [
                  ...settings.blockedSlots,
                  { ...newBlock, id: `block-${Date.now()}` },
                ],
              });
              setNewBlock({ ...newBlock, reason: "" });
            }}
          >
            受付停止を追加
          </Button>
        </div>
      </Section>

      {/* ============ LINE 通知 ============ */}
      <Section
        title="LINE通知"
        description={
          lineEnabled
            ? "送信する通知を選べます。"
            : "LINE Messaging API が未設定のため、通知は送信されません（設定だけ保存できます）。"
        }
      >
        <p className="text-[0.78rem] tracking-[0.16em] text-sage-700">お客様へ</p>
        <Toggle
          label="予約完了時"
          checked={settings.notify.customerOnCreate}
          onChange={(v) => patch({ notify: { ...settings.notify, customerOnCreate: v } })}
        />
        <Toggle
          label="予約変更時"
          checked={settings.notify.customerOnChange}
          onChange={(v) => patch({ notify: { ...settings.notify, customerOnChange: v } })}
        />
        <Toggle
          label="キャンセル時"
          checked={settings.notify.customerOnCancel}
          onChange={(v) => patch({ notify: { ...settings.notify, customerOnCancel: v } })}
        />

        <p className="mt-3 text-[0.78rem] tracking-[0.16em] text-sage-700">
          管理者へ
        </p>
        <Toggle
          label="新規予約が入ったとき"
          checked={settings.notify.adminOnCreate}
          onChange={(v) => patch({ notify: { ...settings.notify, adminOnCreate: v } })}
        />
        <Toggle
          label="予約が変更されたとき"
          checked={settings.notify.adminOnChange}
          onChange={(v) => patch({ notify: { ...settings.notify, adminOnChange: v } })}
        />
        <Toggle
          label="キャンセルされたとき"
          checked={settings.notify.adminOnCancel}
          onChange={(v) => patch({ notify: { ...settings.notify, adminOnCancel: v } })}
        />
      </Section>

      <Button block loading={saving} onClick={() => void saveSettings()}>
        設定を保存する
      </Button>

      {/* ============ メニュー・オプション ============ */}
      <MenuEditor />
      <OptionEditor />
    </div>
  );
}

/* ==================================================================
   メニューの編集
   ------------------------------------------------------------------
   追加・編集・並べ替え・非表示・削除ができます。
   ★ 過去の予約は「予約した時点のメニュー名・料金・時間」を
     予約データ側に保存しているため、ここで変更・削除しても
     過去の予約の内容は変わりません。
   ================================================================== */

/** 新しいメニュー・オプションの ID（英数字とハイフンのみ・推測不要） */
function newItemId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 配列の i 番目を上下に動かし、表示順（order）を振り直します */
function move<T extends { order: number }>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((item, i) => ({ ...item, order: (i + 1) * 10 }));
}

function MenuEditor() {
  const [menus, setMenus] = useState<Menu[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error">("success");

  useEffect(() => {
    void (async () => {
      const result = await apiGet<{ menus: Menu[] }>("/api/admin/menus");
      if (result.ok) setMenus(result.data.menus);
      else {
        setTone("error");
        setMessage(result.error.message);
      }
    })();
  }, []);

  const edit = useCallback((index: number, patch: Partial<Menu>) => {
    setMenus((list) => {
      if (!list) return list;
      const next = [...list];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    if (!menus) return;
    setSaving(true);
    setMessage("");
    const result = await apiPut<{ menus: Menu[] }>("/api/admin/menus", { menus });
    if (!result.ok) {
      setTone("error");
      setMessage(result.error.message);
    } else {
      setMenus(result.data.menus);
      setTone("success");
      setMessage("メニューを保存しました。お客様の画面にすぐ反映されます。");
    }
    setSaving(false);
  }, [menus]);

  return (
    <Section
      id="menus"
      title="メニューと料金"
      description="「保存する」を押すまで反映されません。非表示にすると、お客様の予約画面には出なくなります（過去の予約はそのまま残ります）。"
    >
      {menus === null && !message && <Loading />}

      {menus && menus.length === 0 && (
        <p className="text-[0.85rem] text-botanical-400">
          まだメニューがありません。下の「メニューを追加」から登録してください。
        </p>
      )}

      {menus && (
        <div className="flex flex-col gap-3">
          {menus.map((menu, index) => (
            <div
              key={menu.id}
              className="flex flex-col gap-2 rounded-sm border border-botanical-700/25 bg-white/70 p-4"
            >
              <TextInput
                label="メニュー名"
                value={menu.name}
                maxLength={60}
                onChange={(v) => edit(index, { name: v })}
              />
              <TextInput
                label="説明文（1〜2行）"
                value={menu.description}
                maxLength={200}
                onChange={(v) => edit(index, { description: v })}
              />
              <div className="flex gap-2">
                <UnitInput
                  label="所要時間"
                  unit="分"
                  value={menu.durationMin}
                  min={5}
                  max={600}
                  step={5}
                  onChange={(v) => edit(index, { durationMin: v })}
                />
                <UnitInput
                  label="料金（税込）"
                  unit="円"
                  value={menu.price}
                  min={0}
                  step={100}
                  onChange={(v) => edit(index, { price: v })}
                />
              </div>
              <Select
                label="分類"
                value={menu.category}
                options={CATEGORY_OPTIONS}
                onChange={(v) => edit(index, { category: v as Menu["category"] })}
              />
              <Toggle
                label="お客様の画面に表示する"
                checked={menu.visible}
                onChange={(v) => edit(index, { visible: v })}
              />
              <ItemActions
                onUp={index > 0 ? () => setMenus(move(menus, index, -1)) : undefined}
                onDown={
                  index < menus.length - 1 ? () => setMenus(move(menus, index, 1)) : undefined
                }
                onDelete={() => {
                  if (!window.confirm(`「${menu.name || "名称未設定"}」を削除しますか？`)) return;
                  setMenus(menus.filter((m) => m.id !== menu.id));
                }}
              />
            </div>
          ))}
        </div>
      )}

      {menus && (
        <>
          <Button
            variant="outline"
            size="md"
            onClick={() =>
              setMenus([
                ...menus,
                {
                  id: newItemId("menu"),
                  name: "",
                  description: "",
                  category: "course",
                  durationMin: 60,
                  price: 0,
                  order: (menus.length + 1) * 10,
                  visible: true,
                },
              ])
            }
          >
            ＋ メニューを追加
          </Button>

          {message && <Notice tone={tone}>{message}</Notice>}

          <Button block loading={saving} onClick={() => void save()}>
            メニューを保存する
          </Button>
        </>
      )}
    </Section>
  );
}

/* ==================================================================
   オプションの編集
   ------------------------------------------------------------------
   「追加時間」を入れると、そのオプションを選んだ予約は
   その分だけ枠が長くなります（0分ならメニューの時間内で行う扱い）。
   オプションが1件も無い場合、予約画面のオプション選択は自動で省略されます。
   ================================================================== */

function OptionEditor() {
  const [options, setOptions] = useState<Option[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error">("success");

  useEffect(() => {
    void (async () => {
      const result = await apiGet<{ options: Option[] }>("/api/admin/options");
      if (result.ok) setOptions(result.data.options);
      else {
        setTone("error");
        setMessage(result.error.message);
      }
    })();
  }, []);

  const edit = useCallback((index: number, patch: Partial<Option>) => {
    setOptions((list) => {
      if (!list) return list;
      const next = [...list];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    if (!options) return;
    setSaving(true);
    setMessage("");
    const result = await apiPut<{ options: Option[] }>("/api/admin/options", { options });
    if (!result.ok) {
      setTone("error");
      setMessage(result.error.message);
    } else {
      setOptions(result.data.options);
      setTone("success");
      setMessage("オプションを保存しました。");
    }
    setSaving(false);
  }, [options]);

  return (
    <Section
      id="options"
      title="オプション"
      description="メニューに追加できるものです。無い場合は空のままで構いません（予約画面のオプション選択が省略されます）。"
    >
      {options === null && !message && <Loading />}

      {options && options.length === 0 && (
        <p className="text-[0.85rem] text-botanical-400">オプションは登録されていません。</p>
      )}

      {options && (
        <div className="flex flex-col gap-3">
          {options.map((option, index) => (
            <div
              key={option.id}
              className="flex flex-col gap-2 rounded-sm border border-botanical-700/25 bg-white/70 p-4"
            >
              <TextInput
                label="オプション名"
                value={option.name}
                maxLength={60}
                onChange={(v) => edit(index, { name: v })}
              />
              <TextInput
                label="説明文"
                value={option.description}
                maxLength={200}
                onChange={(v) => edit(index, { description: v })}
              />
              <div className="flex gap-2">
                <UnitInput
                  label="追加時間"
                  unit="分"
                  value={option.extraDurationMin}
                  min={0}
                  max={240}
                  step={5}
                  onChange={(v) => edit(index, { extraDurationMin: v })}
                />
                <UnitInput
                  label="料金（税込）"
                  unit="円"
                  value={option.price}
                  min={0}
                  step={100}
                  onChange={(v) => edit(index, { price: v })}
                />
              </div>
              <Toggle
                label="お客様の画面に表示する"
                checked={option.visible}
                onChange={(v) => edit(index, { visible: v })}
              />
              <ItemActions
                onUp={index > 0 ? () => setOptions(move(options, index, -1)) : undefined}
                onDown={
                  index < options.length - 1
                    ? () => setOptions(move(options, index, 1))
                    : undefined
                }
                onDelete={() => {
                  if (!window.confirm(`「${option.name || "名称未設定"}」を削除しますか？`))
                    return;
                  setOptions(options.filter((o) => o.id !== option.id));
                }}
              />
            </div>
          ))}
        </div>
      )}

      {options && (
        <>
          <Button
            variant="outline"
            size="md"
            onClick={() =>
              setOptions([
                ...options,
                {
                  id: newItemId("opt"),
                  name: "",
                  description: "",
                  price: 0,
                  extraDurationMin: 0,
                  order: (options.length + 1) * 10,
                  visible: true,
                },
              ])
            }
          >
            ＋ オプションを追加
          </Button>

          {message && <Notice tone={tone}>{message}</Notice>}

          <Button block loading={saving} onClick={() => void save()}>
            オプションを保存する
          </Button>
        </>
      )}
    </Section>
  );
}

/** 並べ替え・削除のボタン */
function ItemActions({
  onUp,
  onDown,
  onDelete,
}: {
  onUp?: () => void;
  onDown?: () => void;
  onDelete: () => void;
}) {
  const small =
    "min-h-[40px] border border-botanical-700/30 px-3 text-[0.8rem] text-botanical-600 disabled:opacity-30";
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={small} onClick={onUp} disabled={!onUp}>
        ↑ 上へ
      </button>
      <button type="button" className={small} onClick={onDown} disabled={!onDown}>
        ↓ 下へ
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="ml-auto min-h-[40px] px-2 text-[0.8rem] text-clay underline underline-offset-4"
      >
        削除
      </button>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.72rem] text-botanical-400">{label}</span>
      <input
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[46px] rounded-sm border border-botanical-700/30 bg-white px-3 text-botanical-800"
      />
    </label>
  );
}

function UnitInput({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max?: number;
  step: number;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-[0.72rem] text-botanical-400">{label}</span>
      <span className="flex items-center gap-2 rounded-sm border border-botanical-700/30 bg-white px-3">
        <input
          type="number"
          inputMode="numeric"
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="min-h-[46px] w-full bg-transparent text-botanical-800 focus:outline-none"
        />
        <span className="shrink-0 text-[0.8rem] text-botanical-400">{unit}</span>
      </span>
    </label>
  );
}

/* ==================================================================
   小さな部品
   ================================================================== */

function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-32 flex-col gap-3">
      <div>
        <h2 className="text-[0.95rem] tracking-[0.12em] text-botanical-800">{title}</h2>
        {description && (
          <p className="mt-1 text-[0.78rem] leading-relaxed text-botanical-400">
            {description}
          </p>
        )}
      </div>
      <div className="accent-rule" aria-hidden="true" />
      {children}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-[48px] cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[#24483a]"
      />
      <span className="text-[0.9rem] text-botanical-700">{label}</span>
    </label>
  );
}

function HoursEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DayHours;
  onChange: (value: DayHours) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-sm border border-botanical-700/25 bg-white/70 p-4">
      <p className="text-[0.85rem] text-botanical-700">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["open", "開店"],
            ["lastStart", "最終受付"],
            ["close", "閉店"],
          ] as const
        ).map(([key, text]) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-[0.7rem] text-botanical-400">{text}</span>
            <input
              type="time"
              value={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              className="min-h-[46px] rounded-sm border border-botanical-700/30 bg-white px-2 text-center text-botanical-800"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[0.9rem] text-botanical-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[48px] min-w-[7.5rem] rounded-sm border border-botanical-700/30 bg-white px-3 text-botanical-800"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix: string;
  min: number;
  max: number;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="flex-1 text-[0.9rem] text-botanical-700">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="min-h-[48px] w-20 rounded-sm border border-botanical-700/30 bg-white px-3 text-center text-botanical-800"
        />
        <span className="shrink-0 text-[0.78rem] text-botanical-400">{suffix}</span>
      </span>
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.85rem] text-botanical-700">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={200}
        className="rounded-sm border border-botanical-700/30 bg-white px-4 py-3 text-botanical-800"
      />
    </label>
  );
}

/* ==================================================================
   接続診断
   ------------------------------------------------------------------
   Google 連携がうまくいかないときに、どこで止まっているかを
   その場で確認できるようにします。
   ================================================================== */

type Check = { name: string; ok: boolean; detail: string; hint?: string };

function Diagnostics() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async () => {
    setRunning(true);
    setError("");
    const result = await apiGet<{ checks: Check[] }>("/api/admin/diagnostics");
    if (result.ok) setChecks(result.data.checks);
    else setError(result.error.message);
    setRunning(false);
  }, []);

  return (
    <Section
      title="接続診断"
      description="Google カレンダー・スプレッドシート・LINE に正しくつながっているかを順番に確認し、止まっている場所と直し方を表示します。うまく動かないときにお使いください。"
    >
      <Button variant="outline" size="md" loading={running} onClick={() => void run()}>
        接続を確認する
      </Button>

      {error && <Notice tone="error">{error}</Notice>}

      {checks && (
        <ul className="flex flex-col gap-2">
          {checks.map((c) => (
            <li
              key={c.name}
              className={`rounded-sm border p-3 ${
                c.ok
                  ? "border-forest/25 bg-forest-light"
                  : "border-clay/30 bg-clay-light"
              }`}
            >
              <p className="flex items-center gap-2 text-[0.88rem] text-botanical-800">
                <span aria-hidden="true">{c.ok ? "✅" : "❌"}</span>
                {c.name}
              </p>
              <p className="mt-1 text-[0.78rem] leading-relaxed break-all text-botanical-600">
                {c.detail}
              </p>
              {!c.ok && c.hint && (
                <p className="mt-1.5 text-[0.78rem] leading-relaxed text-clay">
                  → {c.hint}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export default function AdminSettingsPage() {
  return (
    <AdminShell title="設定">
      {(info) => <SettingsForm lineEnabled={info.integrations.lineMessaging} />}
    </AdminShell>
  );
}
