# AGENTS.md — 作業の引き継ぎメモ（Codex などのAIエージェント向け）

このファイルは、Claude Code で進めてきた作業を別のエージェント（Codex など）が
そのまま続けられるようにするための引き継ぎ資料です。**作業を始める前に必ず全部読んでください。**

---

## 1. このリポジトリは何か

- **ビューティーサロン703**（宮崎市桜町・美容サロン）の **LINE から開く予約Webアプリ**です。
- 本体は **`beautysalon703-booking/`** フォルダ（独立した Next.js プロジェクト）。
  Vercel では Root Directory にこのフォルダを指定して公開します。
- 稼働中の別サロン用システム **`amulea-booking`**（GitHub `kakeru-moriguchi/amulea`、
  ブランチ `claude/amulea-homepage-ylwqxi`）を土台に作りました。
- デザインの参照元はホームページ **`kakeru-moriguchi/703`**（Vercel プロジェクト名 `703`）。
- **amulea リポジトリと 703 ホームページには一切変更を加えないこと**（依頼者の指示）。

## 2. 技術構成（変えないこと）

- TypeScript 5.9 / Next.js 16.3（App Router）/ React 19.1 / Tailwind CSS 4
- **外部ライブラリを追加しない**。Google・LINE 連携は Node 標準の `node:crypto` と `fetch` だけ。
- ウェブフォントも使わない（ホームページと同じく端末の書体）。
- **コード内のコメントは日本語**。利用者向けの文章・手順書も日本語。
- 依頼者はパソコンが得意ではないため、利用者が作業する手順は**クリック単位**で書く。

## 3. コマンド（`beautysalon703-booking/` で実行）

```bash
npm install
npm run dev         # 開発サーバー http://localhost:3000（認証情報なしで全機能が動く）
npm run typecheck   # 型チェック
npm test            # 自動テスト（tsc でビルド → node --test。追加ライブラリなし）
npm run build       # 本番ビルド
```

**変更したら必ず `npm run typecheck && npm test && npm run build` を通すこと。**
現時点で 25 件のテストがすべて成功、ビルド成功、ブラウザでの通し確認（予約→変更→キャンセル→管理画面）も成功しています。

管理画面の開発用ログイン: ID `admin` / パスワード `salon703-dev`（`ADMIN_PASSWORD_HASH` 未設定時のみ）。

## 4. 必ず守る設計（依頼者の必須要件）

### 二重予約の防止
- 判定は必ず**サーバー側**。フロントだけで防がない。
- Google カレンダーに先にイベントを作って枠を確保 → 直後に再照会して衝突を検出。
- 勝敗は `lib/google/calendar.ts` の **`claimPrecedes()`** だけで決める：
  **先に枠を押さえた方（Google の `updated` 時刻）が勝ち、同じ時刻ならイベントIDが小さい方が勝つ**。
  新規予約・予約変更の両方がこれを使う。
  - 「IDが小さい方」だけにすると、先に確定済みの予約と後から来た予約が**両方成立する**穴がある。
    `tests/double-booking.test.ts` がこれを再現しており、ID だけに戻すと3件失敗する。**戻さないこと。**
- 衝突時の文言（変更禁止）:
  「申し訳ありません。この時間は先ほど他のお客様の予約が入りました。別のお時間をお選びください。」

### LINE の誤送信防止
- LINE userId は**サーバー側で** ID トークン検証から取得（`lib/line/verify.ts`）。クライアントから受け取らない。
- 通知先は予約データに保存済みの userId のみ。名前・電話番号から推測しない。予約変更でも userId は変えない。
- 通知直前に予約IDと userId の紐付きを確認。

### 秘密情報・個人情報
- APIキー・秘密鍵は `.env` / Vercel の環境変数のみ。直書き禁止。`.env*` は Git 管理外（`.env.example` だけ登録）。
- `NEXT_PUBLIC_` が付くのは LIFF ID だけ。
- ログに電話番号・自由記載を出さない。エラーメッセージに秘密情報を出さない。
- 個人情報を URL クエリに載せない。他人の予約は 403/404。管理者 API はすべて認証必須。
- カレンダーの予定名は「ビューティーサロン703予約｜メニュー名」だけ（`lib/config/salon.ts` の `calendarEventTitle`）。

### その他
- 予約データの読み書きは **DataStore**（`lib/store/types.ts`）経由のみ。保存先はメモリ / スプレッドシート。
- 各連携は「その連携の認証情報が揃っているか」で**独立して**有効になる（`lib/config/env.ts`）。マスタースイッチにしない。
- スプレッドシートの**設定値**の読み取り失敗は初期値で継続してよい（失敗時はキャッシュしない）が、
  **予約データ**の読み取り失敗は握りつぶさない（空き枠に見えて二重予約になる）。
- ルートレイアウトの `export const dynamic = "force-dynamic"` を消さない。
- `vercel.json` の `{"framework": "nextjs"}` を消さない。
- お客様側の画面遷移は素の `<a>` とページ全体の読み込み（`lib/client/navigate.ts`）。
  LINE アプリ内ブラウザで App Router の画面差し替えが失敗するため。`next/link` はお客様側で使わない（管理画面は可）。
- LIFF の認証はトップページで済ませる。サブページからは `?next=` で持ち回り、
  値は `lib/client/safe-next.ts` で「/ で始まり // で始まらない」等に限定。
- 管理画面には、初期パスワードのまま・メモリ保存のまま・メニュー0件の警告を出す（`components/admin/AdminShell.tsx`）。

## 5. 主要ファイル

| 内容 | 場所 |
| --- | --- |
| サロン名・電話・ロゴ文字・予定名 | `lib/config/salon.ts` |
| 環境変数（唯一の入口） | `lib/config/env.ts` |
| 配色（Botanical/Sage/Mustard/Ivory） | `app/globals.css` |
| 空き時間の計算 | `lib/domain/availability.ts` |
| 予約・変更・キャンセル | `lib/domain/booking.ts` |
| 初期値（営業時間 7:00〜21:00、メニューは空） | `lib/domain/defaults.ts` |
| 管理者向け接続診断 | `app/api/admin/diagnostics/route.ts` |
| お客様向け診断 | `app/check/page.tsx` |
| パスワード値の作成画面（ターミナル不要） | `app/admin/setup-values/` |
| 設計書・手順書 | `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/SETUP-VERCEL.md`, `docs/SETUP-GOOGLE.md`, `docs/SETUP-LINE.md` |

## 6. 進捗

| 段階 | 状態 |
| --- | --- |
| 1. モックデータで全機能 | ✅ 完了・ブラウザで通し確認済み |
| 2. Google カレンダー連携 | ✅ 実装済み（偽カレンダーでテスト済み。本物は認証情報待ち） |
| 3. スプレッドシート連携 | ✅ 実装済み（認証情報待ち） |
| 4. LINE（LIFF ログイン＋通知） | ✅ 実装済み（LINE 側の設定待ち） |
| 5. 本番公開 | ⏳ 依頼者が Vercel で公開する段階（`docs/SETUP-VERCEL.md`） |

## 7. 未決定事項（依頼者の回答待ち。勝手に決めない）

- 正式なメニュー・料金・オプション（**架空のメニューを入れないこと**。管理画面から依頼者が登録する）
- 最終受付（現在 20:00 は仮）・定休日・施術前後の準備時間
- 予約フォームの項目（現在は Amulea と同じ：お名前・電話番号が必須、ご要望が任意）
- ホームページの公開URL（`lib/config/salon.ts` の `homepageUrl` が空。もらった URL は Vercel の管理画面のものだった）
- Google アカウント・LINE 公式アカウント（まだ無い）
- ブランチ運用：現在は `claude/wizardly-euler-2d7wr7` のみ（リポジトリが空だったため唯一のブランチ）。`main` にするかは未確認

## 8. 依頼者に伝え済みの注意

- 稼働中の **amulea-booking にも「IDが小さい方が勝つ」だけの判定による二重予約の穴**がある。
  依頼者の指示で amulea は触っていない。直すかどうかは依頼者の判断待ち。

## 9. Git

- 作業ブランチ: `claude/wizardly-euler-2d7wr7`
- コミットメッセージは日本語で、何を・なぜ変えたかを書く。
- `node_modules/`, `.next/`, `.test-build/`, `.env*`（`.env.example` 以外）はコミットしない。
