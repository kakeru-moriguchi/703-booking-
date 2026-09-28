/**
 * 環境変数の読み取り（lib/config/env.ts）のテスト
 * ------------------------------------------------------------------
 * ・サービスアカウントの JSON を丸ごと貼る方式
 * ・各連携が「その連携の認証情報が揃っているか」で独立して有効になること
 */
import test from "node:test";
import assert from "node:assert/strict";

const ENV_KEYS = [
  "MOCK_MODE",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "GOOGLE_CLIENT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_CALENDAR_ID",
  "GOOGLE_SPREADSHEET_ID",
  "NEXT_PUBLIC_LIFF_ID",
  "LINE_LOGIN_CHANNEL_ID",
  "LINE_MESSAGING_CHANNEL_ACCESS_TOKEN",
  "ADMIN_PASSWORD_HASH",
];

/** 指定した環境変数だけが入った状態で env.ts を読み込み直します */
function loadEnv(vars: Record<string, string>): typeof import("../lib/config/env") {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, vars);
  const path = require.resolve("../lib/config/env");
  delete require.cache[path];
  return require(path);
}

const KEY = "-----BEGIN PRIVATE KEY-----\\nAAAA\\n-----END PRIVATE KEY-----\\n";
const JSON_TEXT = JSON.stringify({
  type: "service_account",
  private_key_id: "0123456789abcdef0123456789abcdef01234567",
  private_key: KEY.replace(/\\n/g, "\n"),
  client_email: "booking@example-123.iam.gserviceaccount.com",
});

test("JSON を丸ごと貼ると、メールアドレスと秘密鍵の両方が読み取られる", () => {
  const m = loadEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON_TEXT });
  assert.equal(m.env.google.clientEmail, "booking@example-123.iam.gserviceaccount.com");
  assert.ok(m.env.google.privateKey.startsWith("-----BEGIN PRIVATE KEY-----\n"));
  assert.equal(m.env.google.fromJson, true);
  assert.equal(m.env.google.jsonStatus, "ok");
});

test("JSON が途中で切れている・別物のときは種類を見分ける", () => {
  assert.equal(loadEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON_TEXT.slice(0, 50) }).env.google.jsonStatus, "broken");
  assert.equal(
    loadEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ installed: { client_id: "x" } }) }).env
      .google.jsonStatus,
    "not_service_account",
  );
});

test("前後に引用符が付いた秘密鍵・\\n 表記の改行も受け付ける", () => {
  const m = loadEnv({ GOOGLE_PRIVATE_KEY: `"${KEY}"`, GOOGLE_CLIENT_EMAIL: "a@b.c" });
  assert.ok(m.env.google.privateKey.startsWith("-----BEGIN PRIVATE KEY-----\n"));
  assert.ok(!m.env.google.privateKey.includes("\\n"));
});

test("各連携は独立して有効になる（マスタースイッチ不要）", () => {
  const none = loadEnv({});
  assert.equal(none.isGoogleEnabled(), false);
  assert.equal(none.isLineLoginEnabled(), false);
  assert.equal(none.isDevLoginAllowed(), true);

  const googleOnly = loadEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON_TEXT, GOOGLE_CALENDAR_ID: "cal" });
  assert.equal(googleOnly.isGoogleEnabled(), true);
  assert.equal(googleOnly.isSheetsEnabled(), false);
  assert.equal(googleOnly.isLineLoginEnabled(), false);

  const lineOnly = loadEnv({ NEXT_PUBLIC_LIFF_ID: "1234567890-abcdefgh", LINE_LOGIN_CHANNEL_ID: "1234567890" });
  assert.equal(lineOnly.isGoogleEnabled(), false);
  assert.equal(lineOnly.isLineLoginEnabled(), true);
  // LINE ログインが揃うと、開発用の仮ログインは自動で閉じる
  assert.equal(lineOnly.isDevLoginAllowed(), false);

  const forcedOff = loadEnv({ MOCK_MODE: "true", GOOGLE_SERVICE_ACCOUNT_JSON: JSON_TEXT, GOOGLE_CALENDAR_ID: "cal" });
  assert.equal(forcedOff.isGoogleEnabled(), false);
});

test("管理者パスワードのハッシュが無いあいだは「初期パスワードのまま」と判定する", () => {
  assert.equal(loadEnv({}).isUsingDevAdminPassword(), true);
  assert.equal(loadEnv({ ADMIN_PASSWORD_HASH: "scrypt$aa$bb" }).isUsingDevAdminPassword(), false);
});
