import type {
  PetCreate,
  PetResponse,
  UserInputCreate,
  MemoryClassifyResult,
  PublicMemoryResponse,
  ReviewItem,
  ExchangeTokenResponse,
  ResolveExchangeResponse,
  MatchStatusResponse,
  SessionResponse,
  ExchangeAnalysisResponse,
  ReportResponse,
} from './types';

const BASE = '/api';
const AUTH_HEADER = 'Bearer dev-token';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: AUTH_HEADER,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const createPet = (body: PetCreate) =>
  apiFetch<PetResponse>('/pets', { method: 'POST', body: JSON.stringify(body) });

export const submitInput = (body: UserInputCreate) =>
  apiFetch<MemoryClassifyResult>('/inputs', { method: 'POST', body: JSON.stringify(body) });

export const getPublicMemory = () =>
  apiFetch<PublicMemoryResponse>('/memories/public');

export const getReviewItems = () =>
  apiFetch<ReviewItem[]>('/memories/review');

export const approveMemory = (itemId: string, action: 'approve' | 'reject') =>
  apiFetch<void>(`/memories/${itemId}/approve`, {
    method: 'PUT',
    body: JSON.stringify({ action }),
  });

// ---- Exchange（新方式）----

export const issueToken = () =>
  apiFetch<ExchangeTokenResponse>('/exchanges/token', { method: 'POST' });

export const resolveExchange = (payload_raw: number[]) =>
  apiFetch<ResolveExchangeResponse>('/exchanges/resolve', {
    method: 'POST',
    body: JSON.stringify({ payload_raw }),
  });

export const getMatchStatus = (pendingId: string) =>
  apiFetch<MatchStatusResponse>(`/exchanges/match/${pendingId}`);

export const pollToken = (tokenKey: string) =>
  apiFetch<MatchStatusResponse>(`/exchanges/token/${tokenKey}/poll`);

export const scanQrToken = (tokenKey: string) =>
  apiFetch<ResolveExchangeResponse>(`/exchanges/qr-scan/${tokenKey}`, { method: 'POST' });

export const getSession = (sessionId: string) =>
  apiFetch<SessionResponse>(`/exchanges/session/${sessionId}`);

export const endSession = (sessionId: string) =>
  apiFetch<void>(`/exchanges/session/${sessionId}/end`, { method: 'POST' });

// ---- Analysis / Report ----

export const getAnalysis = (sessionId: string) =>
  apiFetch<ExchangeAnalysisResponse>(`/exchanges/${sessionId}/analysis`);

export const getReport = (analysisId: string) =>
  apiFetch<ReportResponse>(`/reports/${analysisId}`);

export const submitFeedback = (analysisId: string, cardId: string, reaction: string) =>
  apiFetch<void>(`/reports/${analysisId}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ card_id: cardId, reaction }),
  });
