export interface PetCreate {
  name: string;
  personality: string;
  tone: string;
}

export interface PetResponse {
  pet_id: string;
  user_id: string;
  name: string;
  personality: string;
  tone: string;
  created_at: string;
}

export interface UserInputCreate {
  input_type: 'chat' | 'diary' | 'interest_tag';
  content: string;
}

export interface ChatRequest {
  message: string;
}

export interface SelectedLabel {
  name: string;
  category_large: string;
  category_medium?: string;
  category_small?: string;
}

export interface MemoryClassifyResult {
  category: 'private' | 'public' | 'blocked' | 'review_required';
  interests: string[];
  values: string[];
  recent_topics: string[];
  conversation_style_notes: string;
  safe_summary: string;
  blocked_reason: string;
  review_reason: string;
}

export interface PublicMemoryResponse {
  user_id: string;
  safe_topic_tags: string[];
  safe_summaries: string[];
  public_conversation_hooks: string[];
  shareable_interests: string[];
  updated_at: string;
}

export type ChatIntent =
  | 'small_talk'
  | 'emotion_support'
  | 'interest_discovery'
  | 'memory_update'
  | 'safety_block'
  | 'review_required';

export interface ChatUiHint {
  emotion: 'happy' | 'comfort' | 'curious' | 'careful' | 'neutral';
  animation: 'hand' | 'stretch' | 'hand_stretch' | 'blink' | 'shake';
}

export interface ChatResponse {
  reply: string;
  intent: ChatIntent;
  memory: MemoryClassifyResult | null;
  ui_hint: ChatUiHint;
}

export interface ReviewItem {
  id: string;
  candidate_summary: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface MemoryListItem {
  id: string;
  summary: string;
  detail: string;
  source: 'review_required' | 'public' | 'private' | 'blocked';
  created_at: string;
  can_approve: boolean;
  category?: string;
}

export interface MemoryListResponse {
  review: MemoryListItem[];
  allowed: MemoryListItem[];
  secret: MemoryListItem[];
}

// ---- Exchange（新方式: payloadRaw ベース）----

export interface ExchangeTokenResponse {
  payload_raw: number[];
  token_key: string;
  expires_at: string;
  qr_url: string;
}

export type ResolveStatus = 'matched' | 'waiting' | 'expired' | 'used' | 'not_found' | 'self';

export interface ResolveExchangeResponse {
  status: ResolveStatus;
  session_id?: string;
  pending_id?: string;
}

export interface MatchStatusResponse {
  status: 'waiting' | 'matched';
  session_id?: string;
}

export interface SessionResponse {
  session_id: string;
  status: 'active' | 'ended';
  speaker_id: string;
  common_message: string | null;
  analysis_id: string | null;
  ended_by?: string;
  // 双方が成功画面へ到達したときだけ true。false の間は成功画面へ遷移しない。
  both_ready: boolean;
}

// ---- Analysis / Report ----

export type CardType =
  | 'common_point'
  | 'conversation_starter'
  | 'next_topic'
  | 'thank_you_template'
  | 'new_interest'
  | 'pet_message';

export interface ReportCard {
  card_id: string;
  card_type: CardType;
  title: string;
  body: string;
}

export interface PersonalPoint {
  topic: string;
  point: string;
}

export interface ExchangeAnalysisResponse {
  session_id: string;
  analysis_id: string;
  common_topics: string[];
  related_topics: string[];
  conversation_hooks: string[];
  followup_suggestions: string[];
  on_site_cards: ReportCard[];
  // 本人だけに表示される「自分の好きなポイント」
  personal_points: PersonalPoint[];
}

export interface ReportResponse {
  analysis_id: string;
  cards: ReportCard[];
}
