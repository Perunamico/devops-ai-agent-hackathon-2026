// バックエンドのPydanticスキーマに対応する型定義

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

export interface ReviewItem {
  id: string;
  candidate_summary: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface ExchangeTokenResponse {
  token: string;
  expires_at: string;
  sound_frequencies: number[];
  qr_data: string;
}

export interface JoinExchangeResponse {
  session_id: string;
  status: 'waiting' | 'confirmed';
}

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

export interface ExchangeAnalysisResponse {
  session_id: string;
  analysis_id: string;
  common_topics: string[];
  related_topics: string[];
  conversation_hooks: string[];
  followup_suggestions: string[];
  on_site_cards: ReportCard[];
}

export interface ReportResponse {
  analysis_id: string;
  cards: ReportCard[];
}
