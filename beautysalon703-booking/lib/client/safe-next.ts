/**
 * ?next= の値を、安全な「このサイト内のページ」だけに限定します。
 * ==================================================================
 * LINE の認証はトップページへ戻ってくるため、もともと開こうとしていた
 * ページを ?next= で持ち回ることがあります（components/SessionGate.tsx）。
 *
 * ★ 外部サイトのアドレスを入れられると、
 *   LINEから戻ったお客様を偽サイトへ飛ばせてしまいます（フィッシング）。
 *   そのため、先頭が「/」で、かつ「//」で始まらないものだけを許可します。
 *   （「//evil.example」はブラウザが外部サイトとして解釈するため）
 *   あわせて「/\evil.example」のようにバックスラッシュで
 *   ブラウザに「//」と読み替えさせる手口と、改行などの制御文字も拒否します。
 */
export function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  return raw;
}
