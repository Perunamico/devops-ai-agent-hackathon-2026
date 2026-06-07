import type {
  PetCreate,
  PetResponse,
  UserInputCreate,
  MemoryClassifyResult,
  PublicMemoryResponse,
  ReviewItem,
  ExchangeTokenResponse,
  JoinExchangeResponse,
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

export const issueToken = () =>
  apiFetch<ExchangeTokenResponse>('/exchanges/token', { method: 'POST' });

export const joinExchange = (token: string, exchange_method: 'sound' | 'qr_fallback' = 'sound') =>
  apiFetch<JoinExchangeResponse>('/exchanges/join', {
    method: 'POST',
    body: JSON.stringify({ token, exchange_method }),
  });

export const approveExchange = (sessionId: string) =>
  apiFetch<{ status: string; analysis_id?: string }>(`/exchanges/${sessionId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approved: true }),
  });

export const getAnalysis = (sessionId: string) =>
  apiFetch<ExchangeAnalysisResponse>(`/exchanges/${sessionId}/analysis`);

export const getReport = (analysisId: string) =>
  apiFetch<ReportResponse>(`/reports/${analysisId}`);

export const submitFeedback = (analysisId: string, cardId: string, reaction: string) =>
  apiFetch<void>(`/reports/${analysisId}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ card_id: cardId, reaction }),
  });
