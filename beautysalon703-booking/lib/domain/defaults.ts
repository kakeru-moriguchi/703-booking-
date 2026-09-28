/**
 * 初期データ（メニュー・オプション・営業設定）
 * ==================================================================
 * ★ メニュー・オプションの初期値は「空」です。
 *   ビューティーサロン703 の正式なメニューと料金は未確定のため、
 *   架空のメニューをお客様に見せないよう、あえて何も入れていません。
 *   公開前に管理画面（/admin/settings）から登録してください。
 *
 *   （お試し用のメモリ保存のときだけ、動作確認用のテストメニューを
 *     自動で入れています → SAMPLE_MENUS / lib/store/memory.ts）
 *
 * ★ 営業時間・休業日なども、ここは「初期値」です。
 *   公開後の変更は管理画面から行えます。
 *   変更内容は保存先（スプレッドシート）に記録され、
 *   このファイルを編集し直す必要はありません。
 */

import type { Menu, MenuCategory, Option, Settings } from "./types";

/** メニューの初期値（正式メニュー未確定のため空） */
export const DEFAULT_MENUS: Menu[] = [];

/** オプションの初期値（同上） */
export const DEFAULT_OPTIONS: Option[] = [];

/** メニュー分類の表示名（予約画面・管理画面で共通） */
export const MENU_CATEGORY_LABELS: Record<MenuCategory, string> = {
  course: "メインメニュー",
  partial: "セット・部分メニュー",
  secret: "その他",
};

/**
 * 動作確認用のテストメニュー
 * ------------------------------------------------------------------
 * Google スプレッドシート未接続（メモリ保存）のときだけ使います。
 * 名前に【動作確認用】と付けて、本物のメニューと取り違えないようにしています。
 */
export const SAMPLE_MENUS: Menu[] = [
  {
    id: "sample-60",
    name: "【動作確認用】テストメニュー60分",
    description: "動作確認のための仮メニューです。管理画面から本番のメニューに置き換えてください。",
    category: "course",
    durationMin: 60,
    price: 5000,
    order: 10,
    visible: true,
  },
  {
    id: "sample-120",
    name: "【動作確認用】テストメニュー120分",
    description: "最終受付・閉店時刻の判定を試すための長めの仮メニューです。",
    category: "course",
    durationMin: 120,
    price: 10000,
    order: 20,
    visible: true,
  },
  {
    id: "sample-30",
    name: "【動作確認用】テストメニュー30分",
    description: "短時間メニューの表示確認用です。",
    category: "partial",
    durationMin: 30,
    price: 3000,
    order: 30,
    visible: true,
  },
];

/** 動作確認用のテストオプション */
export const SAMPLE_OPTIONS: Option[] = [
  {
    id: "sample-opt-15",
    name: "【動作確認用】テストオプション",
    description: "選ぶと予約枠が15分長くなることを確認できます。",
    price: 1000,
    extraDurationMin: 15,
    order: 10,
    visible: true,
  },
];

/** 営業設定の初期値 */
export const DEFAULT_SETTINGS: Settings = {
  /*
    営業時間 7:00〜21:00（ホームページ記載の時間）
    最終受付は仮に 20:00 としています。管理画面から変更してください。
    ※ 最終受付は「開始時刻の上限」です。20:00 開始でも、
      閉店 21:00 を超えるメニュー（例: 120分）は受け付けません。
  */
  weekdayHours: { open: "07:00", lastStart: "20:00", close: "21:00" },
  holidayHours: { open: "07:00", lastStart: "20:00", close: "21:00" },

  /* 予約枠は 30 分刻み */
  slotIntervalMin: 30,

  /* 準備時間の初期値は 0 分（管理画面から 15/30/45/60 分に変更できます） */
  bufferBeforeMin: 0,
  bufferAfterMin: 0,

  /* 定休日は未定のため、初期値は「なし」（管理画面で曜日を選べます） */
  regularClosedWeekdays: [],
  closedDates: [],
  specialHours: [],
  blockedSlots: [],

  acceptingReservations: true,
  suspendedMessage:
    "ただいまWeb予約の受付を停止しております。恐れ入りますが、お電話または公式LINEよりお問い合わせください。",

  maxAdvanceDays: 60,
  /* 直前予約の防止（3時間後以降のみ受付） */
  minAdvanceHours: 3,
  /* 施術開始の 24 時間前まで変更・キャンセル可能 */
  changeDeadlineHours: 24,

  notify: {
    customerOnCreate: true,
    customerOnChange: true,
    customerOnCancel: true,
    adminOnCreate: true,
    adminOnChange: true,
    adminOnCancel: true,
  },
};

/**
 * 保存されている設定に、後から追加された項目が無い場合でも
 * 落ちないように初期値で補完します。
 */
export function withSettingsDefaults(partial: Partial<Settings> | null): Settings {
  if (!partial) return structuredClone(DEFAULT_SETTINGS);
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...partial,
    weekdayHours: { ...DEFAULT_SETTINGS.weekdayHours, ...partial.weekdayHours },
    holidayHours: { ...DEFAULT_SETTINGS.holidayHours, ...partial.holidayHours },
    notify: { ...DEFAULT_SETTINGS.notify, ...partial.notify },
  };
}
