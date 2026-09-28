/**
 * トップページ（公式LINEのリッチメニューから最初に開く画面）
 * ==================================================================
 * ここでは「予約する」か「予約を確認する」かだけを選んでいただきます。
 * 迷わせないよう、導線は2つに絞っています。
 *
 * ★ この画面を SessionGate で包んでいる理由
 *   LINEの認証が終わったあと、LINEは必ず
 *   「LIFFのエンドポイントURL」＝このトップページへ戻します。
 *   つまり、認証の往復を受け止められるのはこの画面だけです。
 *
 *   ここでログインを済ませておけば、次に開く予約画面では
 *   すでにログイン済みの状態になり、往復そのものが起きません。
 *
 * ★ 営業時間の表示は、管理画面で設定した値を読み込んで表示します。
 *   （コードに時刻を書き込んでいないので、設定を変えればここも変わります）
 */

"use client";

import { useEffect, useState } from "react";
import SessionGate from "@/components/SessionGate";
import { ButtonLink } from "@/components/ui/Button";
import { Brand, Content, Screen, SectionHeading } from "@/components/ui/Layout";
import { apiGet } from "@/lib/client/api";
import { salon } from "@/lib/config/salon";

type DayHours = { open: string; lastStart: string; close: string };

type BookingInfo = {
  weekdayHours: DayHours;
  holidayHours: DayHours;
  regularClosedWeekdays: number[];
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "07:00" → "7:00"（ホームページの表記に合わせます） */
function short(time: string): string {
  return time.replace(/^0(\d)/, "$1");
}

function sameHours(a: DayHours, b: DayHours): boolean {
  return a.open === b.open && a.lastStart === b.lastStart && a.close === b.close;
}

function BusinessHours() {
  const [info, setInfo] = useState<BookingInfo | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await apiGet<{ booking: BookingInfo }>("/api/menus");
      if (result.ok) setInfo(result.data.booking);
    })();
  }, []);

  /* 読み込めなかった場合は、営業時間の欄ごと表示しません（誤った時刻を出さないため） */
  if (!info) return null;

  const { weekdayHours: wd, holidayHours: hd } = info;
  const rows: Array<[string, DayHours]> = sameHours(wd, hd)
    ? [["営業時間", wd]]
    : [
        ["月 - 金", wd],
        ["土・日・祝", hd],
      ];
  const lastStarts = [...new Set([wd.lastStart, hd.lastStart])].map(short).join(" / ");
  const closed = info.regularClosedWeekdays
    .slice()
    .sort()
    .map((d) => WEEKDAYS[d])
    .join("・");

  return (
    <div className="fade-up border-t border-b border-botanical-700/20 py-5">
      <p className="font-display text-[0.66rem] text-sage-600">OPEN HOURS</p>
      <div className="mt-3 flex flex-col gap-1.5 text-[0.9rem] text-botanical-800">
        {rows.map(([label, h]) => (
          <p key={label} className="flex justify-between">
            <span className="text-sage-700">{label}</span>
            <span>
              {short(h.open)} - {short(h.close)}
            </span>
          </p>
        ))}
        <p className="mt-2 text-[0.78rem] leading-relaxed text-botanical-400">
          最終ご予約受付は{lastStarts}です。
          <br />
          {closed ? `定休日：${closed}曜日` : "ご予約可能な日はカレンダーでご確認いただけます。"}
        </p>
      </div>
    </div>
  );
}

function Home() {
  return (
    <Screen>
      <Brand />
      <Content className="flex flex-col justify-center gap-10">
        <div className="fade-up flex flex-col gap-5 text-center">
          <SectionHeading en="Reservation" ja="ご予約" />
          <p className="text-[0.92rem] leading-loose text-botanical-600">
            {salon.tagline}
            <br />
            ご希望のメニューとお日にちをお選びください。
          </p>
        </div>

        <div className="fade-up flex flex-col gap-3">
          <ButtonLink href="/booking" block>
            新しく予約する
          </ButtonLink>
          <ButtonLink href="/my-reservations" variant="outline" block>
            ご予約の確認・変更・キャンセル
          </ButtonLink>
        </div>

        <BusinessHours />

        <p className="text-center text-[0.78rem] leading-relaxed text-botanical-400">
          お電話でのご相談：
          <a href={salon.phoneHref} className="underline underline-offset-4">
            {salon.phone}
          </a>
        </p>
      </Content>
    </Screen>
  );
}

export default function HomePage() {
  return <SessionGate>{() => <Home />}</SessionGate>;
}
