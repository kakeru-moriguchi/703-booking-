/**
 * 画面の骨格
 * ------------------------------------------------------------------
 * ヘッダー・本文の幅・区切り線など、全ページ共通の見た目です。
 */

import type { ReactNode } from "react";
import { salon } from "@/lib/config/salon";

/** ページ全体の枠（スマートフォンでちょうど良い幅に収めます） */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-paper">
      {children}
    </div>
  );
}

/**
 * 画面上部のロゴ帯
 * 既存ホームページと同じ「703 ＋ BEAUTY SALON」のロゴです。
 */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <header className="border-b border-botanical-700/20 bg-paper/95 px-5 py-4 backdrop-blur-md">
      <a
        href={href}
        className="flex items-end justify-center gap-2.5 leading-none text-botanical-700"
        aria-label={`${salon.name} ご予約トップ`}
      >
        <span className="font-logo text-[1.9rem]">{salon.logoMark}</span>
        <span className="pb-[3px] font-[Arial,sans-serif] text-[0.6rem] tracking-[0.24em]">
          {salon.logoSub}
        </span>
      </a>
    </header>
  );
}

/** 本文の余白 */
export function Content({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <main id="main" className={`flex-1 px-5 py-7 ${className}`}>{children}</main>;
}

/** セクション見出し（英字 + 金の線 + 日本語） */
export function SectionHeading({
  en,
  ja,
  align = "center",
}: {
  en: string;
  ja?: string;
  align?: "center" | "left";
}) {
  const isCenter = align === "center";
  return (
    <div className={isCenter ? "text-center" : "text-left"}>
      <p className="font-display text-[0.66rem] tracking-[0.4em] text-sage-600 uppercase">
        {en}
      </p>
      <div
        className={`accent-rule my-4 h-px w-14 ${isCenter ? "mx-auto" : ""}`}
        aria-hidden="true"
      />
      {ja && (
        <h1 className="text-[1.3rem] tracking-[0.12em] text-botanical-700">{ja}</h1>
      )}
    </div>
  );
}

/** 白いカード */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-sm border border-botanical-700/20 bg-white/70 p-5 ${className}`}
    >
      {children}
    </div>
  );
}

/** 画面下に固定する操作エリア（片手で押しやすい位置） */
export function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-30 mt-auto border-t border-botanical-700/20 bg-paper/95 px-5 pt-4 backdrop-blur-md safe-bottom">
      {children}
    </div>
  );
}
