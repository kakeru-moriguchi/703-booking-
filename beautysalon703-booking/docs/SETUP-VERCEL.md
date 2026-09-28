# Vercel 公開の手順

予約システムをインターネットに公開し、スマートフォンから開けるようにします。

- **かかる時間**: 15〜20分ほど
- **費用**: 無料（Hobby プラン）で始められます
- **必要なもの**: GitHub アカウント（`kakeru-moriguchi`）

> **先に読んでください**
> この予約システムは、GitHub の `kakeru-moriguchi/703-booking-` リポジトリの中の
> **`beautysalon703-booking` フォルダ**に入っています。
> Vercel には「このフォルダを公開してね」と教える必要があります（手順3の ★）。
> 既存のホームページ（Vercel の `703` プロジェクト）とは**別のプロジェクト**として作るので、
> ホームページには一切影響しません。

---

## 全体の流れ

```
手順1  Vercel にログインする
手順2  新しいプロジェクトを作り、リポジトリを選ぶ
手順3  ★ Root Directory と Framework Preset を設定する
手順4  公開（Deploy）する
手順5  管理画面にログインして、パスワードを変える
手順6  環境変数を登録して Redeploy する
```

---

## 手順1　Vercel にログインする

1. ブラウザで <https://vercel.com/> を開きます。
2. 右上の **Log In** をクリックします。
3. **Continue with GitHub** をクリックし、GitHub アカウントでログインします。

---

## 手順2　新しいプロジェクトを作る

1. ログイン後の画面（ダッシュボード）で、右上の **Add New...** をクリックします。
2. 出てきたメニューから **Project** をクリックします。
3. 「Import Git Repository」の一覧から **`703-booking-`** を探し、右の **Import** をクリックします。

   > 💡 一覧に出てこない場合は、一覧の下にある
   > **Adjust GitHub App Permissions →** をクリックし、
   > `703-booking-` へのアクセスを許可してから戻ってきてください。

---

## 手順3　★ Root Directory と Framework Preset を設定する

「Configure Project」という画面になります。**ここがいちばん大事です。**

1. **Project Name** を `beautysalon703-booking` にします。
   （既存のホームページ `703` と**違う名前**にしてください）
2. **Root Directory** の右にある **Edit** をクリックします。
3. フォルダの一覧から **`beautysalon703-booking`** を選び、**Continue** をクリックします。
4. **Framework Preset** が **Next.js** になっていることを確認します。
   `Other` になっていたら、クリックして **Next.js** を選び直します。

   > ⚠️ `Other` のままだと、次のエラーで公開に失敗します。
   >
   > ```
   > No Output Directory named "public" found after the Build completed.
   > ```
   >
   > このプロジェクトには `vercel.json` に `"framework": "nextjs"` を書いてあるため、
   > Root Directory を正しく選べば、通常は自動で Next.js になります。

5. **Build and Output Settings** と **Environment Variables** は、いまは触らなくて大丈夫です。

---

## 手順4　公開（Deploy）する

1. **Deploy** をクリックします。
2. 1〜3分待ちます。紙吹雪の画面（Congratulations!）が出たら成功です。
3. **Continue to Dashboard** をクリックします。
4. 画面の **Domains** に表示されている URL
   （例: `beautysalon703-booking.vercel.app`）をメモします。
   これが**予約ページのアドレス**です。

この時点で、Google・LINE の設定がなくても**全機能を試せます**
（予約データは一時保存なので、本番運用はまだ始めないでください）。

---

## 手順5　管理画面にログインして、パスワードを変える

1. `https://（手順4のURL）/admin` を開きます。
2. 次の開発用の情報でログインします。

   ```
   管理者ID  : admin
   パスワード : salon703-dev
   ```

3. 画面上部に赤字で **「開発用の初期パスワードのままです」** と出ています。
   その中の **初期設定の値づくり** をクリックします。
4. 新しいパスワード（10文字以上・英字の大小・数字・記号を混ぜる）を2回入力し、
   **登録用の値を作る** をクリックします。
5. `ADMIN_PASSWORD_HASH` と `SESSION_SECRET` の2つの値が表示されます。
   **この画面は開いたまま**にして、次の手順へ進みます。

> 🔐 新しいパスワードは紙などに控えてください。どこにも保存されないため、
> 忘れた場合はこの手順をやり直すことになります（開発者に依頼してください）。

---

## 手順6　環境変数を登録して Redeploy する

1. 別のタブで Vercel のプロジェクト（`beautysalon703-booking`）を開きます。
2. 上部のタブから **Settings** をクリックします。
3. 左側のメニューから **Environment Variables** をクリックします。
4. 次の表の値を、**1つずつ**登録します。
   - **Key** 欄に名前を入力
   - **Value** 欄に値を貼り付け
   - **Environments** は Production・Preview・Development の**すべてにチェック**
   - **Save** をクリック

   | Key | Value |
   | --- | --- |
   | `APP_URL` | 手順4のURL（例: `https://beautysalon703-booking.vercel.app`） |
   | `ADMIN_ID` | お好きな管理者ID（半角英数字。例: `salon703`） |
   | `ADMIN_PASSWORD_HASH` | 手順5で表示された値（`scrypt$` で始まる長い値） |
   | `SESSION_SECRET` | 手順5で表示された値 |

5. 上部のタブの **Deployments** をクリックします。
6. いちばん上の行の右端にある **⋯**（点3つ）→ **Redeploy** をクリックします。
7. 確認の画面で、もう一度 **Redeploy** をクリックします。

   > ⚠️ 環境変数は、登録しただけでは反映されません。**必ず Redeploy してください。**

8. 1〜3分後、`https://（URL）/admin` を開き直し、
   **新しい管理者IDとパスワード**でログインできれば完了です。
   赤字の「開発用の初期パスワードのままです」も消えています。

---

## このあとの作業

| 順番 | 作業 | 手順書 |
| --- | --- | --- |
| 1 | メニュー・料金・営業時間・定休日を登録する | 管理画面 → **設定** |
| 2 | Google カレンダー・スプレッドシートをつなぐ | [SETUP-GOOGLE.md](SETUP-GOOGLE.md) |
| 3 | LINE ログイン・通知をつなぐ | [SETUP-LINE.md](SETUP-LINE.md) |
| 4 | 管理画面の **設定 → 接続を確認する** がすべて ✅ になることを確認 | — |

Google・LINE の値も、上の手順6と同じ画面で登録し、**Redeploy** します。

---

## 独自ドメインを使う場合（任意）

`yoyaku.example.jp` のような独自のアドレスを使いたい場合:

1. プロジェクトの **Settings** → 左メニュー **Domains** を開きます。
2. 使いたいドメインを入力して **Add** をクリックします。
3. 表示された設定（DNS レコード）を、ドメインを買った会社の管理画面に登録します。
4. その後、環境変数 `APP_URL` と、LINE の LIFF エンドポイントURL を
   新しいアドレスに変更し、**Redeploy** します。

---

## うまくいかないとき

| 症状 | 原因と対処 |
| --- | --- |
| `No Output Directory named "public"` で失敗する | Framework Preset が `Other` です。**Settings → Build and Deployment → Framework Preset** を `Next.js` にして Redeploy |
| ホームページ（703）のほうが表示される | Root Directory が空欄です。**Settings → Build and Deployment → Root Directory** を `beautysalon703-booking` にして Redeploy |
| 環境変数を入れたのに変わらない | Redeploy していません。手順6の 5〜7 を行ってください |
| 管理画面にログインできなくなった | `ADMIN_PASSWORD_HASH` の貼り付けミスです。手順5〜6をやり直してください |
| 全員が急にログアウトされた | `SESSION_SECRET` を変更すると全員ログアウトします（異常ではありません） |
