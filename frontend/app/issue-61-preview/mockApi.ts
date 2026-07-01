// issue-61-preview 専用の /api/* モック。
// 本物の api.ts は fetch('/api/...') を叩くだけなので、window.fetch を被せて
// それらしいレスポンスを返せば、バックエンドなしで <App /> を完全再現できる。
// 本番コードには一切手を入れない（このモジュールはプレビュールートからのみ読み込まれる）。
import type {
  PetResponse,
  MemoryClassifyResult,
  ChatResponse,
  PublicMemoryResponse,
  ReviewItem,
  ExchangeTokenResponse,
  SessionResponse,
  ExchangeAnalysisResponse,
  ReportResponse,
  ReportCard,
} from '../../src/types';

const now = () => new Date().toISOString();

function petResponse(body: { name?: string; personality?: string; tone?: string }): PetResponse {
  return {
    pet_id: 'pet-preview-1',
    user_id: 'user-preview-1',
    name: body.name?.trim() || 'ぽち',
    personality: body.personality || '元気で友好的',
    tone: body.tone || '自然体でカジュアル',
    created_at: now(),
  };
}

const memoryClassify: MemoryClassifyResult = {
  category: 'public',
  interests: ['カフェ巡り', '映画鑑賞'],
  values: ['のんびり過ごす'],
  recent_topics: ['週末の予定'],
  conversation_style_notes: 'カジュアルで親しみやすい',
  safe_summary: 'カフェと映画が好きなユーザー',
  blocked_reason: '',
  review_reason: '',
};

const CHAT_REPLIES = [
  'いいね！それすごく楽しそう！もっと聞かせて〜🐾',
  'へぇ〜！ぼくもそれ気になってたんだ！',
  'なるほど〜。今日も話してくれてうれしいな！',
  'わかる〜！その気持ち、ぼくも一緒だよ！',
];
let chatTurn = 0;

function chatResponse(body: { message?: string }): ChatResponse {
  const reply = CHAT_REPLIES[chatTurn % CHAT_REPLIES.length];
  chatTurn += 1;
  return {
    reply: body.message ? reply : 'もう一度話しかけてみて！',
    intent: 'small_talk',
    memory: null,
    ui_hint: { emotion: 'happy', animation: 'stretch' },
  };
}

const publicMemory: PublicMemoryResponse = {
  user_id: 'user-preview-1',
  safe_topic_tags: ['カフェ', '映画', '旅行'],
  safe_summaries: ['週末はカフェ巡りを楽しんでいる'],
  public_conversation_hooks: ['おすすめのカフェある？'],
  shareable_interests: ['カフェ巡り', '映画鑑賞', '写真'],
  updated_at: now(),
};

const reviewItems: ReviewItem[] = [
  {
    id: 'review-1',
    candidate_summary: '最近よく行くカフェの名前を覚えた',
    reason: '場所が特定できる情報を含む可能性',
    status: 'pending',
    created_at: now(),
  },
  {
    id: 'review-2',
    candidate_summary: '好きな映画ジャンルについて話した',
    reason: '公開してよいか確認したい話題',
    status: 'pending',
    created_at: now(),
  },
];

function tokenResponse(): ExchangeTokenResponse {
  const tokenKey = 'mock-token-' + Math.random().toString(36).slice(2, 8);
  return {
    payload_raw: [12, 34, 56, 78, 90],
    token_key: tokenKey,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    qr_url: `${typeof window !== 'undefined' ? window.location.origin : ''}/?exchangeToken=${tokenKey}`,
  };
}

function sessionResponse(sessionId: string): SessionResponse {
  return {
    session_id: sessionId,
    status: 'active',
    speaker_id: 'peer-preview-1',
    common_message: 'ふたりとも「カフェ巡り」が好きみたい！話しかけてみよう☕',
    analysis_id: 'analysis-preview-1',
  };
}

const onSiteCards: ReportCard[] = [
  { card_id: 'c1', card_type: 'common_point', title: '共通点', body: 'どちらもカフェ巡りが好き！' },
  { card_id: 'c2', card_type: 'conversation_starter', title: '会話のきっかけ', body: '「最近行ったお気に入りのカフェある？」' },
  { card_id: 'c3', card_type: 'next_topic', title: '次の話題', body: 'おすすめの映画を交換してみよう🎬' },
];

const analysisResponse: ExchangeAnalysisResponse = {
  session_id: 'session-preview-1',
  analysis_id: 'analysis-preview-1',
  common_topics: ['カフェ巡り', '映画鑑賞'],
  related_topics: ['写真', '旅行'],
  conversation_hooks: ['好きなカフェはどこ？', 'おすすめの映画は？'],
  followup_suggestions: ['今度一緒にカフェに行ってみる', 'おすすめ映画リストを共有する'],
  on_site_cards: onSiteCards,
  personal_points: [
    { topic: 'カフェ巡り', point: '静かな店でゆっくり過ごすのが好き' },
    { topic: '映画鑑賞', point: '余韻が残る作品について話すのが好き' },
  ],
};

const reportResponse: ReportResponse = {
  analysis_id: 'analysis-preview-1',
  cards: [
    ...onSiteCards,
    { card_id: 'c4', card_type: 'thank_you_template', title: 'お礼メッセージ', body: '今日は話せてうれしかった！またね😊' },
    { card_id: 'c5', card_type: 'new_interest', title: '新しい興味', body: '相手の影響で写真にも興味が出てきたみたい📷' },
    { card_id: 'c6', card_type: 'pet_message', title: 'ペットからひとこと', body: 'いい出会いだったね！ぼくもうれしいよ🐾' },
  ],
};

const matched = { status: 'matched' as const, session_id: 'session-preview-1' };

// [method, pathの正規表現, レスポンスを作る関数]
type Handler = (path: string, body: Record<string, unknown>) => unknown;
const ROUTES: Array<[string, RegExp, Handler]> = [
  ['POST', /^\/pets$/, (_p, b) => petResponse(b as { name?: string })],
  ['POST', /^\/inputs$/, () => memoryClassify],
  ['POST', /^\/chat$/, (_p, b) => chatResponse(b as { message?: string })],
  ['GET', /^\/memories\/public$/, () => publicMemory],
  ['GET', /^\/memories\/review$/, () => reviewItems],
  ['PUT', /^\/memories\/[^/]+\/approve$/, () => ({})],
  ['POST', /^\/exchanges\/token$/, () => tokenResponse()],
  ['POST', /^\/exchanges\/resolve$/, () => matched],
  ['GET', /^\/exchanges\/match\/[^/]+$/, () => matched],
  ['GET', /^\/exchanges\/token\/[^/]+\/poll$/, () => matched],
  ['POST', /^\/exchanges\/qr-scan\/[^/]+$/, () => matched],
  ['POST', /^\/exchanges\/session\/[^/]+\/end$/, () => ({})],
  ['GET', /^\/exchanges\/session\/([^/]+)$/, (p) => sessionResponse(p.split('/').pop() as string)],
  ['GET', /^\/exchanges\/[^/]+\/analysis$/, () => analysisResponse],
  ['GET', /^\/reports\/[^/]+$/, () => reportResponse],
  ['POST', /^\/reports\/[^/]+\/feedback$/, () => ({})],
];

declare global {
  interface Window {
    __issue61ApiMock?: boolean;
  }
}

export function installApiMock(): void {
  if (typeof window === 'undefined' || window.__issue61ApiMock) return;
  window.__issue61ApiMock = true;

  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(rawUrl, window.location.origin);

    // /api/* 以外（動画・画像など）は本物の fetch に通す
    if (!u.pathname.startsWith('/api/')) return realFetch(input, init);

    const path = u.pathname.replace(/^\/api/, '');
    const method = (init?.method || 'GET').toUpperCase();
    let body: Record<string, unknown> = {};
    if (init?.body && typeof init.body === 'string') {
      try { body = JSON.parse(init.body); } catch { /* noop */ }
    }

    // 本番のネットワーク感を出すため軽い遅延を入れる
    await new Promise((r) => setTimeout(r, 250));

    for (const [m, re, handler] of ROUTES) {
      if (m === method && re.test(path)) {
        const data = handler(path, body);
        return new Response(JSON.stringify(data ?? {}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // 未定義のエンドポイントは 404 を返す（api.ts 側で握りつぶされる）
    return new Response(JSON.stringify({ detail: `mock: no route for ${method} ${path}` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  console.info('[issue-61-preview] /api/* をモックしました。バックエンド不要で全画面を再現します。');
}
