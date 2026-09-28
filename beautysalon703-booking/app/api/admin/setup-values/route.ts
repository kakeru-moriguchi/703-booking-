/**
 * POST /api/admin/setup-values
 * ==================================================================
 * Vercel に登録する「SESSION_SECRET」と「ADMIN_PASSWORD_HASH」を、
 * ターミナルを使わずに画面から作るための API です。
 * （scripts/generate-secret.mjs・scripts/hash-password.mjs と同じ形式）
 *
 * ★ 安全のための配慮
 *   ・管理者としてログインしている人だけが使えます
 *   ・CSRF・レート制限の確認を通します
 *   ・入力されたパスワードは保存もログ出力もしません
 *     （ハッシュを計算して返すだけです。元のパスワードは戻せません）
 */

import { randomBytes, scryptSync } from "node:crypto";
import { error, guardMutation, handle, ok, requireAdmin } from "@/lib/api/http";
import { readJson } from "@/lib/security/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handle("admin.setup-values", async () => {
    const guard = guardMutation(request, "admin");
    if (guard) return guard;

    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const body = await readJson(request);
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 10 || password.length > 200) {
      return error(400, "パスワードは10文字以上にしてください。", "invalid");
    }

    // lib/auth/admin.ts の検証と同じ形式（scrypt・64バイト）です
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);

    return ok({
      adminPasswordHash: `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`,
      sessionSecret: randomBytes(48).toString("base64url"),
    });
  });
}
