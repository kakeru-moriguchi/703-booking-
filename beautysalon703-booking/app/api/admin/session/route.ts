/**
 * GET /api/admin/session
 * ------------------------------------------------------------------
 * 管理者としてログインしているかどうかと、
 * 管理画面の上部に出す「準備中の項目」の判定材料を返します。
 *
 * ★ ログインしていない人には loggedIn:false だけを返します。
 *   （連携状況などの内部情報を外部へ見せないため）
 */

import { getAdminSession } from "@/lib/auth/session";
import { handle, ok } from "@/lib/api/http";
import { integrationStatus } from "@/lib/domain/booking";
import {
  env,
  isDevLoginAllowed,
  isLineLoginEnabled,
  isSheetsEnabled,
  isUsingDevAdminPassword,
} from "@/lib/config/env";
import { getStore } from "@/lib/store";
import { log } from "@/lib/security/logger";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handle("admin.session", async () => {
    const session = await getAdminSession();
    if (!session) return ok({ loggedIn: false });

    /* 表示中のメニュー件数（0件ならお客様は予約できないため警告します） */
    let visibleMenuCount: number | null = null;
    try {
      const menus = await getStore().listMenus();
      visibleMenuCount = menus.filter((m) => m.visible).length;
    } catch (error) {
      log.error("メニュー件数の取得に失敗", error);
    }

    return ok({
      loggedIn: true,
      mockMode: env.mockMode,
      integrations: {
        ...integrationStatus(),
        lineLogin: isLineLoginEnabled(),
        sheets: isSheetsEnabled(),
      },
      /* まだ誰でも仮ログインできる状態かどうか（管理画面に警告を出すため） */
      devLoginOpen: isDevLoginAllowed(),
      /* 開発用の初期パスワードのままかどうか（公開前に必ず変更してもらうため） */
      usingDevPassword: isUsingDevAdminPassword(),
      visibleMenuCount,
    });
  });
}
