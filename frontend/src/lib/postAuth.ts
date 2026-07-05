// QRコード経由の交流トークン（?exchangeToken=...）をログイン導線をまたいで保持するヘルパー。
// バックエンドが発行するQR URLは `/?exchangeToken=...` 形式で、未ログイン時は
// `/` → `/signin` → ログイン完了と複数ページを遷移するため、クエリだけでは失われる。
// sessionStorage はタブ内で生存し、Google の signInWithRedirect 往復（同一タブ）にも耐える。

const PENDING_EXCHANGE_TOKEN_KEY = 'pending-exchange-token';

export function stashPendingExchangeToken(token: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PENDING_EXCHANGE_TOKEN_KEY, token);
  } catch {
    // sessionStorage が使えない環境ではURLパラメータ経由のフォールバックに任せる。
  }
}

// 現在URLのパラメータもフォールバックとして見る（/exchange?exchangeToken=... 直リンク対応）。
export function peekPendingExchangeToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stashed = window.sessionStorage.getItem(PENDING_EXCHANGE_TOKEN_KEY);
    if (stashed) return stashed;
  } catch {
    // ignore
  }
  return new URLSearchParams(window.location.search).get('exchangeToken');
}

export function consumePendingExchangeToken(): string | null {
  const token = peekPendingExchangeToken();
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(PENDING_EXCHANGE_TOKEN_KEY);
    } catch {
      // ignore
    }
  }
  return token;
}

// ログイン完了後（または既ログインでの再訪時）に進むべきパス。
// 保留中の交流トークンがあれば交流画面へ、なければホームへ。
export function resolvePostAuthPath(): string {
  const token = consumePendingExchangeToken();
  return token ? `/exchange?exchangeToken=${encodeURIComponent(token)}` : '/home';
}
