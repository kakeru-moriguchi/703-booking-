/**
 * ボタン
 * ------------------------------------------------------------------
 * 既存ホームページ（703）の四角いボタンと同じ見た目に揃えています。
 *
 * ★ スマートフォン最優先の設計
 *   ・高さを 56px 以上にして、片手でも押しやすくしています
 *   ・文字は 15px 以上（小さくしすぎない）
 *   ・処理中は二重送信を防ぐため自動的に押せなくなります
 */

"use client";

import type { ReactNode } from "react";

type Variant = "primary" | "danger" | "outline" | "quiet";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-none text-center tracking-[0.12em] " +
  "whitespace-nowrap transition-all duration-300 ease-out disabled:cursor-not-allowed " +
  "disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:shadow-none";

const sizes: Record<Size, string> = {
  md: "min-h-[48px] px-6 py-3 text-[0.9rem]",
  lg: "min-h-[56px] px-8 py-4 text-[0.98rem]",
};

const variants: Record<Variant, string> = {
  /* 主要ボタン（ホームページの「LINEで予約・相談」ボタンと同じ深緑） */
  primary: "bg-botanical-700 font-bold text-white hover:bg-botanical-900 hover:-translate-y-0.5",
  /* 取り消しなど、元に戻せない操作 */
  danger: "bg-clay font-bold text-white hover:bg-[#8a4331] hover:-translate-y-0.5",
  outline:
    "border border-botanical-700 bg-paper text-botanical-700 hover:bg-botanical-50",
  quiet: "text-botanical-500 underline underline-offset-4 hover:text-botanical-700",
};

type CommonProps = {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  block?: boolean;
  className?: string;
};

export function Button({
  children,
  variant = "primary",
  size = "lg",
  block = false,
  className = "",
  type = "button",
  loading = false,
  disabled,
  ...rest
}: CommonProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${
        block ? "w-full" : ""
      } ${className}`}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  variant = "primary",
  size = "lg",
  block = false,
  className = "",
  external = false,
}: CommonProps & { href: string; external?: boolean }) {
  const classes = `${base} ${sizes[size]} ${variants[variant]} ${
    block ? "w-full" : ""
  } ${className}`;

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {children}
      </a>
    );
  }
  /*
    サイト内のリンクも、あえて素の <a> にしています。
    理由は lib/client/navigate.ts のコメントを参照してください。
    （LINEアプリ内ブラウザで「押しても何も起きない」のを防ぐため）
  */
  return (
    <a href={href} className={classes}>
      {children}
    </a>
  );
}
