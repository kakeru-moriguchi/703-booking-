/**
 * 管理画面の枠組み
 * ==================================================================
 * ★ 管理画面のすべてのページをこの部品で包みます。
 *   ログインしていない場合は、中身を一切表示せずログイン画面へ送ります。
 *
 * ★ ただし「本当の防御」はこの画面ではなく、サーバー側の API です。
 *   画面を迂回して API を直接叩かれても、
 *   管理者セッションが無ければ 401 を返します。
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { salon } from "@/lib/config/salon";
import { usePathname, useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/client/api";
import { Loading } from "@/components/ui/Notice";

const NAV = [
  { href: "/admin", label: "ホーム" },
  { href: "/admin/reservations", label: "予約一覧" },
  { href: "/admin/calendar", label: "カレンダー" },
  { href: "/admin/settings", label: "設定" },
] as const;

export type Integrations = {
  googleCalendar: boolean;
  lineMessaging: boolean;
  lineLogin: boolean;
  /** スプレッドシートに保存しているか（false ならサーバーのメモリに一時保存） */
  sheets: boolean;
};

type SessionInfo = {
  loggedIn: boolean;
  mockMode: boolean;
  integrations: Integrations;
  /** まだ誰でも仮ログインできる状態か（LINE未設定のあいだ true） */
  devLoginOpen: boolean;
  /** 管理画面が開発用の初期パスワードのままか */
  usingDevPassword: boolean;
  /** お客様に表示しているメニューの件数（取得できなければ null） */
  visibleMenuCount: number | null;
};

export default function AdminShell({
  title,
  children,
}: {
  title: string;
  children: (info: SessionInfo) => React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void (async () => {
      const result = await apiGet<SessionInfo>("/api/admin/session");
      if (!result.ok || !result.data.loggedIn) {
        router.replace("/admin/login");
        return;
      }
      setInfo(result.data);
      setChecking(false);
    })();
  }, [router]);

  const logout = useCallback(async () => {
    await apiPost("/api/admin/logout");
    router.replace("/admin/login");
  }, [router]);

  if (checking || !info) {
    return (
      <div className="min-h-dvh bg-ivory">
        <Loading label="確認しています" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-ivory">
      {/* ヘッダー */}
      <header className="sticky top-0 z-40 border-b border-botanical-700/25 bg-ivory/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="flex flex-col leading-none">
            <span className="flex items-end gap-2 text-botanical-700">
              <span className="font-logo text-[1.45rem]">{salon.logoMark}</span>
              <span className="pb-[2px] font-[Arial,sans-serif] text-[0.55rem] tracking-[0.24em]">
                {salon.logoSub}
              </span>
            </span>
            <span className="mt-1 text-[0.55rem] tracking-[0.3em] text-sage-700">
              ADMIN
            </span>
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            className="min-h-[40px] rounded-none border border-botanical-200 px-4 text-[0.78rem] text-botanical-500"
          >
            ログアウト
          </button>
        </div>

        {/* ナビゲーション（横スクロールできます） */}
        <nav className="mx-auto max-w-3xl overflow-x-auto px-4 pb-2">
          <ul className="flex gap-2">
            {NAV.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-[38px] items-center rounded-full px-4 text-[0.82rem] tracking-[0.08em] whitespace-nowrap transition-colors ${
                      active
                        ? "bg-botanical-700 text-white"
                        : "border border-botanical-700/30 text-botanical-600"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      {/*
        ★ 最重要の警告：開発用の初期パスワードのまま
        この状態で公開すると、パスワードを知っている人は誰でも
        お客様の個人情報を見られてしまいます。
      */}
      {info.usingDevPassword && (
        <div role="alert" className="border-b border-clay/40 bg-clay-light px-4 py-3">
          <p className="mx-auto max-w-3xl text-[0.8rem] leading-relaxed text-clay">
            <strong>
              管理画面のパスワードが、開発用の初期パスワードのままです。
            </strong>
            <br />
            このまま公開しないでください。
            <Link href="/admin/setup-values" className="mx-1 underline underline-offset-4">
              初期設定の値づくり
            </Link>
            で新しいパスワードの値を作り、Vercel に登録すると、この警告は消えます。
          </p>
        </div>
      )}

      {info.visibleMenuCount === 0 && (
        <div role="alert" className="border-b border-clay/40 bg-clay-light px-4 py-3">
          <p className="mx-auto max-w-3xl text-[0.8rem] leading-relaxed text-clay">
            お客様の画面に表示されているメニューが1件もありません（この状態ではご予約いただけません）。
            <Link href="/admin/settings#menus" className="ml-1 underline underline-offset-4">
              設定 → メニューと料金
            </Link>
            から登録してください。
          </p>
        </div>
      )}

      {/* 準備状況のお知らせ（設定が完了すると自動的に消えます） */}
      {(info.mockMode ||
        !info.integrations.sheets ||
        info.devLoginOpen ||
        !info.integrations.googleCalendar ||
        !info.integrations.lineMessaging) && (
        <div className="border-b border-botanical-700/25 bg-sage-50 px-4 py-3">
          <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
            <p className="text-[0.72rem] tracking-[0.14em] text-sage-700">
              準備中の項目
            </p>
            <ul className="flex flex-col gap-1 text-[0.76rem] leading-relaxed text-botanical-600">
              {info.mockMode && (
                <li>
                  ・MOCK_MODE が有効です。Google・LINE への連携はすべて停止しています。
                </li>
              )}
              {info.devLoginOpen && (
                <li className="text-clay">
                  ・
                  <strong className="font-normal">
                    どなたでも仮のお客様としてログインできる状態です
                  </strong>
                  （LINEログインが未設定のため）。本番のお客様をお迎えする前に、
                  LINE連携を完了してください。
                </li>
              )}
              {!info.integrations.sheets && (
                <li className="text-clay">
                  ・予約データは<strong className="font-normal">サーバーのメモリに一時保存</strong>
                  されています（Google スプレッドシート未連携）。サーバーが再起動すると消えるため、
                  本番運用の前にスプレッドシート連携を完了してください。
                </li>
              )}
              {!info.integrations.googleCalendar && (
                <li>
                  ・Google カレンダー未連携。予約データのみで空き時間を判定しています
                  （カレンダーの私用予定は反映されません）。
                </li>
              )}
              {!info.integrations.lineMessaging && (
                <li>・LINE通知が未設定です。お客様・管理者への通知は送信されません。</li>
              )}
            </ul>

            {/* うまくつながらないときの入口 */}
            <Link
              href="/admin/settings"
              className="mt-1 self-start text-[0.76rem] text-sage-700 underline underline-offset-4"
            >
              接続を確認する
            </Link>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-5 text-[1.15rem] tracking-[0.12em] text-botanical-800">{title}</h1>
        {children(info)}
      </main>
    </div>
  );
}
