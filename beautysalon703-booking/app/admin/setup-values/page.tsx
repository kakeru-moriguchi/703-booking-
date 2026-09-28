/**
 * 初期設定の値づくり（管理画面）
 * ==================================================================
 * 公開前に Vercel へ登録する2つの値を、この画面で作れます。
 *   ・ADMIN_PASSWORD_HASH … 管理画面のパスワード（を変換したもの）
 *   ・SESSION_SECRET      … ログイン状態の署名鍵
 *
 * パソコンにプログラムを入れたり、ターミナルを開いたりする必要はありません。
 */

"use client";

import { useState } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { apiPost } from "@/lib/client/api";

type Values = { adminPasswordHash: string; sessionSecret: string };

function CopyRow({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5 border border-botanical-700/25 bg-white/70 p-3">
      <p className="text-[0.78rem] text-sage-700">Key（名前）</p>
      <code className="text-[0.9rem] break-all text-botanical-800">{name}</code>
      <p className="mt-1 text-[0.78rem] text-sage-700">Value（値）</p>
      <code className="text-[0.78rem] break-all text-botanical-800">{value}</code>
      <Button
        variant="outline"
        size="md"
        className="mt-1"
        onClick={() =>
          void navigator.clipboard.writeText(value).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
      >
        {copied ? "コピーしました" : "値をコピー"}
      </Button>
    </div>
  );
}

function SetupValues() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [values, setValues] = useState<Values | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  const create = async () => {
    setMessage("");
    if (password !== confirm) {
      setMessage("確認用のパスワードが一致しません。");
      return;
    }
    setWorking(true);
    const result = await apiPost<Values>("/api/admin/setup-values", { password });
    setWorking(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setValues(result.data);
    setPassword("");
    setConfirm("");
  };

  return (
    <div className="flex flex-col gap-5 pb-8">
      <p className="text-[0.88rem] leading-relaxed text-botanical-600">
        公開前に、管理画面のパスワードを「開発用の初期パスワード」から変更します。
        ここで作った値を Vercel に登録すると、新しいパスワードでしかログインできなくなります。
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-[0.85rem] text-botanical-700">新しいパスワード（10文字以上）</span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-[50px] rounded-sm border border-botanical-700/30 bg-white px-4"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[0.85rem] text-botanical-700">もう一度（確認用）</span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="min-h-[50px] rounded-sm border border-botanical-700/30 bg-white px-4"
        />
      </label>
      <p className="text-[0.78rem] leading-relaxed text-botanical-400">
        英字の大文字・小文字・数字・記号を混ぜてください。
        このパスワードはどこにも保存されません。紙などに控えて、大切に保管してください。
      </p>

      {message && <Notice tone="error">{message}</Notice>}

      <Button block loading={working} onClick={() => void create()}>
        登録用の値を作る
      </Button>

      {values && (
        <div className="flex flex-col gap-3">
          <Notice tone="success">
            {"値ができました。README の「STEP 2」の手順で、下の2つを Vercel に登録し、Redeploy してください。\n※ この画面を閉じると値は消えます（作り直せば大丈夫です）。"}
          </Notice>
          <CopyRow name="ADMIN_PASSWORD_HASH" value={values.adminPasswordHash} />
          <CopyRow name="SESSION_SECRET" value={values.sessionSecret} />
        </div>
      )}
    </div>
  );
}

export default function SetupValuesPage() {
  return <AdminShell title="初期設定の値づくり">{() => <SetupValues />}</AdminShell>;
}
