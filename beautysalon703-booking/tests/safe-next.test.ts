/** LIFF 認証後の戻り先（?next=）の安全確認のテスト */
import test from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../lib/client/safe-next";

test("サイト内のページは許可する", () => {
  assert.equal(safeNextPath("/booking"), "/booking");
  assert.equal(safeNextPath("/reservation/abc/change?x=1"), "/reservation/abc/change?x=1");
});

test("外部サイトへの誘導は拒否する", () => {
  assert.equal(safeNextPath("https://evil.example"), null);
  assert.equal(safeNextPath("//evil.example"), null);
  assert.equal(safeNextPath("/\\evil.example"), null);
  assert.equal(safeNextPath("javascript:alert(1)"), null);
  assert.equal(safeNextPath("/%0a//evil"), "/%0a//evil"); // 文字列のまま（改行そのものではない）なのでサイト内扱い
  assert.equal(safeNextPath("/\n//evil.example"), null);
  assert.equal(safeNextPath(""), null);
  assert.equal(safeNextPath(null), null);
});
