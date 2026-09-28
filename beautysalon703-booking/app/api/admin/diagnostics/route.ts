/**
 * GET /api/admin/diagnostics
 * ==================================================================
 * Google・LINE 連携がうまくいかないときの「原因の切り分け」をします。
 *
 * どこまで成功して、どこで止まっているのかを順番に確認し、
 * 管理者に分かる日本語で返します。
 *
 * ★ 安全のための配慮
 *   ・管理者としてログインしている場合のみ実行できます
 *   ・秘密鍵やトークンの中身は絶対に返しません
 *   ・設定値は「入っているかどうか」と、末尾のごく一部だけを返します
 *     （取り違えに気づけるようにするため）
 */

import { handle, ok, requireAdmin } from "@/lib/api/http";
import {
  env,
  isGoogleEnabled,
  isLineLoginEnabled,
  isLineMessagingEnabled,
  isSheetsEnabled,
  isUsingDevAdminPassword,
} from "@/lib/config/env";
import { getAccessToken } from "@/lib/google/auth";
import { fetchCalendarBusyForDate } from "@/lib/google/calendar";
import { listSheetTitles } from "@/lib/google/sheets";
import { todayJst } from "@/lib/util/datetime";

export const dynamic = "force-dynamic";

type Check = {
  name: string;
  ok: boolean;
  /** 管理者に見せる説明（秘密情報は含みません） */
  detail: string;
  /** 直し方のヒント */
  hint?: string;
};

/** 設定されているかどうかだけを示します（値は伏せます） */
function present(value: string): string {
  if (!value) return "未設定";
  return `設定あり（${value.length}文字）`;
}

/** 取り違えに気づけるよう、末尾だけ見せます */
function tail(value: string, n = 6): string {
  if (!value) return "未設定";
  return value.length <= n ? value : `…${value.slice(-n)}`;
}

/** エラーから、原因のあたりを付けます */
function hintFor(message: string): string {
  if (message.includes("403")) {
    return "共有の権限が足りません。カレンダーは「予定の変更権限」、スプレッドシートは「編集者」で、サービスアカウントのメールアドレスに共有してください。";
  }
  if (message.includes("404")) {
    return "IDが違うか、共有されていません。カレンダーID／スプレッドシートIDを確認してください。";
  }
  if (message.includes("401")) {
    return "認証に失敗しています。秘密鍵かサービスアカウントのメールアドレスを確認してください。";
  }
  /* Node が秘密鍵を読めなかったときの、専門的なエラー文言を拾います */
  if (
    message.includes("DECODER") ||
    message.includes("PEM") ||
    message.includes("asn1") ||
    message.includes("unsupported")
  ) {
    return "秘密鍵の形が壊れています。JSONファイルの private_key を、-----BEGIN から -----END PRIVATE KEY----- まで貼り直してください（途中の改行 \\n も消さずにそのまま）。";
  }
  if (message.includes("認証")) {
    return "秘密鍵の貼り付けを確認してください。-----BEGIN から -----END PRIVATE KEY----- まで全部入っている必要があります。";
  }
  return "Vercel の Logs タブに詳しい記録が残っています。";
}

export async function GET(): Promise<Response> {
  return handle("admin.diagnostics", async () => {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const checks: Check[] = [];

    /* ---- 0. 基本の設定 ---- */
    checks.push({
      name: "【基本】ログイン状態の署名鍵（SESSION_SECRET）",
      ok: env.sessionSecret.length >= 32,
      detail:
        env.sessionSecret.length >= 32
          ? present(env.sessionSecret)
          : env.sessionSecret
            ? `短すぎます（${env.sessionSecret.length}文字）。32文字以上が必要です。`
            : "未設定です。一時的な鍵で動いているため、サーバーが入れ替わるたびに全員ログアウトします。",
      hint:
        env.sessionSecret.length >= 32
          ? undefined
          : "管理画面の「初期設定の値づくり」（/admin/setup-values）で作った SESSION_SECRET を、Vercel の環境変数に登録してください。",
    });

    checks.push({
      name: "【基本】管理画面のパスワード",
      ok: !isUsingDevAdminPassword(),
      detail: isUsingDevAdminPassword()
        ? "開発用の初期パスワードのままです。"
        : "ADMIN_PASSWORD_HASH が設定されています。",
      hint: isUsingDevAdminPassword()
        ? "このまま公開しないでください。管理画面の「初期設定の値づくり」（/admin/setup-values）で値を作り、Vercel に ADMIN_PASSWORD_HASH を登録してください。"
        : undefined,
    });

    if (env.mockMode) {
      checks.push({
        name: "【基本】MOCK_MODE",
        ok: false,
        detail: "MOCK_MODE=true のため、Google・LINE への接続をすべて止めています。",
        hint: "本番では Vercel の環境変数から MOCK_MODE を削除するか false にしてください。",
      });
    }

    /* ---- 1. 環境変数が入っているか ---- */
    /*
      手順書に載せている「記入例」をそのまま貼ってしまうことがあるため、
      例と一致していないかを確認します。
    */
    const SAMPLE_EMAIL = "beautysalon703-booking@beautysalon703-booking-123456.iam.gserviceaccount.com";
    const isSample = env.google.clientEmail === SAMPLE_EMAIL;

    /*
      GOOGLE_SERVICE_ACCOUNT_JSON に「別のもの」を貼ってしまった場合を名指しします。
    */
    const jsonProblem: Record<string, { detail: string; hint: string } | undefined> = {
      broken: {
        detail: "GOOGLE_SERVICE_ACCOUNT_JSON を JSON として読み取れませんでした（途中で切れているか、一部だけが貼られています）。",
        hint: "ダウンロードした JSON ファイルをメモ帳で開き、Ctrl+A（全選択）→ Ctrl+C でコピーして、「{」から「}」まで丸ごと貼り直してください。",
      },
      not_service_account: {
        detail: "GOOGLE_SERVICE_ACCOUNT_JSON に、サービスアカウント以外の JSON（OAuth クライアントの JSON など）が貼られています。",
        hint: "Google Cloud の「IAM と管理 → サービス アカウント → 鍵」で作成した JSON（中に \"type\": \"service_account\" と書かれたもの）を貼ってください。",
      },
      no_private_key: {
        detail: "JSON の中に private_key が入っていません。",
        hint: "サービスアカウントの「鍵を追加 → 新しい鍵を作成 → JSON」でダウンロードし直したファイルを貼ってください。",
      },
    };
    const problem = jsonProblem[env.google.jsonStatus];
    if (problem) {
      checks.push({ name: "【Google】JSON の貼り付け", ok: false, ...problem });
    }

    if (env.google.fromJson) {
      checks.push({
        name: "【Google】設定方法",
        ok: true,
        detail:
          "サービスアカウントの JSON を丸ごと読み込んでいます（GOOGLE_SERVICE_ACCOUNT_JSON）。メールアドレスと秘密鍵は JSON の中身が使われます。",
      });
    }

    checks.push({
      name: "【Google】サービスアカウントのメールアドレス",
      ok: Boolean(env.google.clientEmail) && !isSample,
      detail: !env.google.clientEmail
        ? "未設定（GOOGLE_CLIENT_EMAIL）"
        : isSample
          ? `${env.google.clientEmail}\n※ これは手順書の「記入例」と同じ値です。`
          : env.google.clientEmail,
      hint: !env.google.clientEmail
        ? "Vercel の環境変数に GOOGLE_CLIENT_EMAIL を追加してください。"
        : isSample
          ? "手順書の例ではなく、ご自身の JSON ファイルの client_email の値を貼ってください。"
          : undefined,
    });

    const keyLooksValid =
      env.google.privateKey.includes("BEGIN") && env.google.privateKey.includes("END");

    /*
      よくある取り違え。
      JSON ファイルをメモ帳で開いて「private_key」を検索すると、
      1つ手前にある "private_key_id" のほうが先に見つかります。
      その値（16進数40文字ほど）をコピーしてしまう事故が多いため、
      形から見分けて名指しします。
    */
    const looksLikeKeyId =
      !keyLooksValid && /^[0-9a-f]{20,64}$/i.test(env.google.privateKey.trim());
    checks.push({
      name: "【Google】秘密鍵の形",
      ok: keyLooksValid,
      detail: keyLooksValid
        ? `${present(env.google.privateKey)}・BEGIN と END を確認`
        : env.google.privateKey
          ? /*
               形が違うときだけ、先頭の数文字を見せます。
               正しい鍵の先頭は "-----BEGIN PRIV..." という公開された決まり文句なので、
               ここを見せても秘密は漏れません。
               逆に「何を貼ってしまったか」がすぐ分かります。
            */
            looksLikeKeyId
              ? `「private_key」ではなく「private_key_id」の値が入っています（先頭「${env.google.privateKey.slice(0, 12)}…」）`
              : `形が正しくありません。先頭が「${env.google.privateKey.slice(0, 15)}」で始まっています（正しくは「-----BEGIN PRIV」）`
          : "未設定（GOOGLE_PRIVATE_KEY）",
      hint: keyLooksValid
        ? undefined
        : looksLikeKeyId
          ? "JSONを検索すると、1つ手前にある private_key_id が先に見つかります。その次にある「private_key」（-----BEGIN PRIVATE KEY----- で始まる長い値）を使ってください。JSONを丸ごと GOOGLE_SERVICE_ACCOUNT_JSON に貼るのが確実です。"
          : "-----BEGIN PRIVATE KEY----- から -----END PRIVATE KEY----- まで、途中で切れずに貼れているか確認してください。",
    });

    checks.push({
      name: "【Google】カレンダーID",
      ok: Boolean(env.google.calendarId),
      detail: env.google.calendarId || "未設定（GOOGLE_CALENDAR_ID）",
    });

    checks.push({
      name: "【Google】スプレッドシートID",
      ok: Boolean(env.google.spreadsheetId),
      detail: env.google.spreadsheetId
        ? `${present(env.google.spreadsheetId)}・末尾 ${tail(env.google.spreadsheetId)}`
        : "未設定（GOOGLE_SPREADSHEET_ID）",
    });

    /* ---- 2. Google にログインできるか ---- */
    let authOk = false;
    if (isGoogleEnabled() || isSheetsEnabled()) {
      try {
        await getAccessToken();
        authOk = true;
        checks.push({
          name: "【Google】Google への接続（認証）",
          ok: true,
          detail: "成功しました。",
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        checks.push({
          name: "【Google】Google への接続（認証）",
          ok: false,
          /* 専門的なエラー文言はそのまま見せず、意味の分かる説明にします */
          detail:
            message.includes("DECODER") || message.includes("unsupported")
              ? "秘密鍵を読み取れませんでした。"
              : message,
          hint: hintFor(message),
        });
      }
    } else {
      checks.push({
        name: "【Google】Google への接続（認証）",
        ok: false,
        detail: env.mockMode
          ? "MOCK_MODE が有効なため、接続を行いません。"
          : "必要な設定が揃っていないため、まだ接続していません。",
      });
    }

    /* ---- 3. カレンダーを読めるか ---- */
    if (authOk && isGoogleEnabled()) {
      try {
        const day = await fetchCalendarBusyForDate(todayJst());
        checks.push({
          name: "【Google】カレンダーの読み取り",
          ok: true,
          detail: `成功しました（本日の予定 ${day.intervals.length} 件）。`,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        checks.push({
          name: "【Google】カレンダーの読み取り",
          ok: false,
          detail: message,
          hint: hintFor(message),
        });
      }
    }

    /* ---- 4. スプレッドシートを読めるか ---- */
    if (authOk && isSheetsEnabled()) {
      try {
        const titles = await listSheetTitles();
        checks.push({
          name: "【Google】スプレッドシートの読み取り",
          ok: true,
          detail: `成功しました（シート: ${titles.join(" / ") || "なし"}）。`,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        checks.push({
          name: "【Google】スプレッドシートの読み取り",
          ok: false,
          detail: message,
          hint: hintFor(message),
        });
      }
    }

    /* ---- 5. LINE の設定 ---- */
    await checkLine(checks);

    return ok({
      checks,
      allOk: checks.every((c) => c.ok),
      mockMode: env.mockMode,
    });
  });
}

/* ==================================================================
   LINE の確認
   ================================================================== */

/**
 * LINE 連携の設定を確認します。
 *
 * ★ よくある取り違え
 *   LINE には「LINEログイン」と「Messaging API」の2つのチャネルがあり、
 *   それぞれにチャネルIDがあります。LIFF ID の先頭の数字は
 *   「LINEログイン」チャネルのIDと必ず一致するため、ここで照合します。
 */
async function checkLine(checks: Check[]): Promise<void> {
  const liffId = env.line.liffId;
  const channelId = env.line.loginChannelId;

  const liffFormatOk = /^\d{6,}-[A-Za-z0-9]{4,}$/.test(liffId);
  checks.push({
    name: "【LINE】LIFF ID",
    ok: liffFormatOk,
    detail: !liffId
      ? "未設定（NEXT_PUBLIC_LIFF_ID）"
      : liffFormatOk
        ? liffId
        : `形が正しくありません（${liffId.slice(0, 20)}）。正しくは「1234567890-AbCdEfGh」のような形です。`,
    hint: liffFormatOk
      ? undefined
      : "LINE Developers → LINEログインのチャネル → 「LIFF」タブに表示される LIFF ID を貼ってください（URL ではなく ID だけ）。",
  });

  const channelFormatOk = /^\d{6,}$/.test(channelId);
  const liffPrefix = liffId.split("-")[0] ?? "";
  const matches = liffFormatOk && channelFormatOk && liffPrefix === channelId;
  checks.push({
    name: "【LINE】LINEログインのチャネルID",
    ok: channelFormatOk && (!liffFormatOk || matches),
    detail: !channelId
      ? "未設定（LINE_LOGIN_CHANNEL_ID）"
      : !channelFormatOk
        ? "数字だけの値ではありません。"
        : liffFormatOk && !matches
          ? `LIFF ID の先頭（${liffPrefix}）と一致しません。別のチャネル（Messaging API など）のIDが入っている可能性があります。`
          : `${channelId}${matches ? "（LIFF ID と一致）" : ""}`,
    hint:
      channelFormatOk && (!liffFormatOk || matches)
        ? undefined
        : "LINE Developers →「LINEログイン」チャネル →「チャネル基本設定」のチャネルID（数字10桁）を貼ってください。Messaging API チャネルのIDではありません。",
  });

  checks.push({
    name: "【LINE】LINEログイン（本人確認）",
    ok: isLineLoginEnabled(),
    detail: isLineLoginEnabled()
      ? "有効です。開発用の仮ログインは自動的に閉じています。"
      : "未設定のため、どなたでも仮のお客様としてログインできる状態です。",
    hint: isLineLoginEnabled()
      ? "LINEアプリで開いて「400 Bad Request」や「This channel is now developing status」と出る場合は、LINEログインチャネルを「公開済み」に切り替えてください（docs/SETUP-LINE.md）。"
      : undefined,
  });

  /* Messaging API のトークンが有効かどうかを、LINE に問い合わせて確かめます */
  if (!env.line.messagingAccessToken) {
    checks.push({
      name: "【LINE】通知用トークン（Messaging API）",
      ok: false,
      detail: "未設定（LINE_MESSAGING_CHANNEL_ACCESS_TOKEN）。LINE通知は送信されません。",
    });
  } else if (!isLineMessagingEnabled()) {
    checks.push({
      name: "【LINE】通知用トークン（Messaging API）",
      ok: false,
      detail: "MOCK_MODE が有効なため、確認を行いません。",
    });
  } else {
    try {
      const response = await fetch("https://api.line.me/v2/bot/info", {
        headers: { authorization: `Bearer ${env.line.messagingAccessToken}` },
        cache: "no-store",
      });
      if (response.ok) {
        const bot = (await response.json()) as { displayName?: string };
        checks.push({
          name: "【LINE】通知用トークン（Messaging API）",
          ok: true,
          detail: `有効です（公式アカウント名: ${bot.displayName ?? "不明"}）。`,
        });
      } else {
        checks.push({
          name: "【LINE】通知用トークン（Messaging API）",
          ok: false,
          detail: `LINE に拒否されました（HTTP ${response.status}）。`,
          hint: "Messaging API チャネルの「チャネルアクセストークン（長期）」を発行し直して、前後の空白を入れずに貼ってください。",
        });
      }
    } catch {
      checks.push({
        name: "【LINE】通知用トークン（Messaging API）",
        ok: false,
        detail: "LINE へ接続できませんでした。",
        hint: "時間をおいて再度お試しください。",
      });
    }
  }

  const ids = env.line.adminUserIds;
  const badIds = ids.filter((id) => !/^U[0-9a-f]{32}$/i.test(id));
  checks.push({
    name: "【LINE】管理者の通知先（LINE_ADMIN_USER_IDS）",
    ok: ids.length > 0 && badIds.length === 0,
    detail:
      ids.length === 0
        ? "未設定。新規予約などの通知は管理者へ届きません。"
        : badIds.length > 0
          ? `${badIds.length}件の値が userId の形（U から始まる33文字）になっていません。`
          : `${ids.length}件 設定済み`,
    hint:
      ids.length > 0 && badIds.length === 0
        ? undefined
        : "docs/SETUP-LINE.md の「管理者の userId を調べる」の手順で取得した値を貼ってください（LINE ID や表示名ではありません）。",
  });
}
