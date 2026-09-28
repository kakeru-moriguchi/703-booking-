import type { Metadata, Viewport } from "next";
import { salon } from "@/lib/config/salon";
import "./globals.css";

/*
  書体は既存ホームページと同じく「端末に入っている書体」を使います
  （app/globals.css の --font-* を参照）。
  ウェブフォントを読み込まないため、ビルド時に外部へ取りに行かず、
  LINEアプリ内ブラウザでも表示が速くなります。
*/

export const metadata: Metadata = {
  title: {
    default: `${salon.name}｜ご予約`,
    template: `%s｜${salon.name} ご予約`,
  },
  description: `${salon.name}のご予約ページです。ご希望のメニューとお日にちをお選びください。`,
  /* 予約ページは検索結果に出す必要がないため、インデックスさせません */
  robots: { index: false, follow: false },
};

/**
 * すべてのページをリクエストのたびに生成します（先読みキャッシュをしない）。
 * ------------------------------------------------------------------
 * 理由は2つあります。
 *
 *  1. 個人情報の保護
 *     予約内容・お名前・電話番号を含む画面を、ビルド時に作り置きしたり
 *     CDN にキャッシュさせたりしないためです。
 *
 *  2. ビルドの安定性
 *     ビルド時にページを先読みレンダリングすると、その工程で
 *     ブラウザ専用の処理につまずいてデプロイが失敗することがあります。
 *     この予約システムは全画面がログイン前提で、先読みしても
 *     得られるものがないため、最初から無効にしています。
 */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: salon.themeColor,
  /*
    スマートフォンでの操作を最優先にしています。
    ただしユーザーによる拡大は禁止しません（アクセシビリティのため）。
  */
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-full focus:bg-botanical-800 focus:px-5 focus:py-3 focus:text-sm focus:text-ivory"
        >
          本文へスキップ
        </a>
        {children}
      </body>
    </html>
  );
}
