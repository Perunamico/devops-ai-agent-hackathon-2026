import json
import logging

from app.config import Settings
from app.schemas.memory import LARGE_CATEGORIES, MemoryClassifyResult
from app.schemas.pet import UserInputCreate
from app.services.firestore_service import FirestoreService
from app.services.vertex_ai_service import VertexAIService
from app.utils.rule_filter import is_obviously_blocked

logger = logging.getLogger(__name__)

_CLASSIFY_PROMPT = """\
あなたはユーザーのAIペットの「会話まとめエージェント」です。
直近の会話を読み、ユーザーが話した内容を**エピソード単位で1つに要約**して残します。
性格や価値観を診断・推測するエージェントではありません。ユーザーが実際に話したことを、事実ベースで短くまとめます。

## あなたの役割（ここが重要）
- 会話を読み、まとまった話題（エピソード）ごとに**1つの要約**を作る。1エピソード=1件。
- 「エピソード」とは、ユーザーが実際に話した出来事・体験・好きなもの・最近のことなど、中身のある話のかたまり。
- 同じ話題に関する複数の発話は**1つにまとめる**。話が途中・未完成でも、中身があれば1件にしてよい（完成を待たない）。
- 1つの発話に明らかに別々の話題が含まれていれば別のエピソードに分ける。ただし無理に細かく割らない。
- エピソードにできるのは「ユーザーが好きなもの・やったこと・体験・関心」が具体的に分かる発話だけ。**迷ったらエピソードにしない**。
- 次のものは**エピソードにしない**（profiles は空、要約も作らない。category も private のままにする）:
  - あいさつ・別れのあいさつ（おはよう / こんにちは / おやすみ / いってきます / ただいま / おつかれ など）。
  - 相槌・短い反応（うん / へえ / なるほど / そうなんだ など）。
  - その時の気分・状態・予定の一言（眠い / お腹すいた / もう寝る / 疲れた / 暇 など）。これは嗜好でも体験でもない。
  - ユーザーの好きなもの・やったこと・関心が具体的に分からない中身のない発話。
  相槌は単独で項目を作らず、直前のエピソードの熱量(intensity)を見極める手がかりにする。
- **既存プロフィールと同じ・近い話題なら、新しく作らず既存のトピック名をそのまま使って1件に統合する**（コンパクション）。
  似た話題を別トピックに細かく分けない（例:「睡眠」と「就寝予定」、「カフェ」と「カフェ作業」を別にしない）。
- 既存プロフィールに `"unconfirmed": true` が付いているもの（ユーザーが選んだだけでまだ深掘りできていないラベル由来の項目）を
  更新する場合は、`depth_confirmed` を判定する。
  今回の会話で具体的な理由・エピソード・文脈（reason/example/context など）を新たに聞けていれば `depth_confirmed: true`。
  同じ話題に触れただけ・再確認しただけで具体的な中身が増えていなければ `depth_confirmed: false`。
  既存に unconfirmed が付いていない場合・新規トピックの場合は `depth_confirmed: false` のままでよい（意味を持たない）。
- **性格・心理の言い換えを禁止**する。「〜を好む人」「気持ちが良いと感じている」のような人柄・内面の決めつけはしない。
  事実ベースの内容を「ご主人によると〜〜〜なんだってね。」のような、ペット視点の伝聞口調の1文にする
  （例:「ご主人によると朝すっきり起きられたんだってね。」）。「ユーザーは〜と話した。」という書き方はしない。
- 事実や状況を嗜好と決めつけない（例:「居酒屋でバイトしている」=「居酒屋が好き」ではない）。

直近の会話（古い→新しい）:
{conversation}

すでに分かっているプロフィール（同じ話題が出たら、これを更新する形で返す）:
{existing_profiles_json}

過去の共有禁止トピック:
{blocked_topics_json}

## エピソードの抽出（profiles）
今回の会話で出たエピソードを、エピソードごとに分けて配列で出す（1エピソード=1件）。
あいさつ・相槌だけ、または中身のある話が無ければ profiles は空配列でよい。
各エピソードは大・中・小カテゴリーで整理する。

- category_large（大カテゴリー）は次の100個から必ず1つ選ぶ:
  アニメ / マンガ / 映画 / ドラマ / お笑い・バラエティ / アイドル / 声優 / 動画配信・YouTube / 読書・小説 / 推し活 /
  音楽鑑賞 / 邦楽 / 洋楽 / ボーカロイド / クラシック音楽 / ジャズ / 楽器演奏 / 作曲・DTM / カラオケ / ライブ・フェス /
  コンソールゲーム / PCゲーム / スマホゲーム / レトロゲーム / eスポーツ / ボードゲーム / TRPG / パズル・脳トレ /
  グルメ・食べ歩き / 料理 / お菓子・スイーツ作り / カフェ巡り / コーヒー / お茶・紅茶 / お酒・バー / ラーメン / パン・ベーカリー /
  サッカー / 野球 / バスケットボール / テニス / ランニング・マラソン / 筋トレ・ジム / ヨガ・ピラティス / 登山・ハイキング / 水泳 / ダンス / 格闘技・武道 / スポーツ観戦 /
  国内旅行 / 海外旅行 / ドライブ / キャンプ / 温泉 / テーマパーク / 鉄道・電車 / 街歩き・散歩 /
  イラスト・絵を描く / 写真・カメラ / 動画編集 / ハンドメイド・手芸 / DIY・ものづくり / 陶芸・クラフト / 書道・カリグラフィー / デザイン /
  語学・英語 / 資格・勉強 / 自己啓発 / 歴史 / 科学 / 哲学・思想 / 心理学 / 投資・資産運用 /
  プログラミング / ガジェット / AI・機械学習 / PC自作 / Web・アプリ開発 / 電子工作・ロボット / 暗号資産・ブロックチェーン /
  アウトドア / 釣り / ガーデニング・園芸 / 天体観測 / 動物・ペット / 生き物・昆虫 /
  インテリア / 掃除・整理整頓 / 節約・ミニマリスト / 健康・ウェルネス / 占い・スピリチュアル /
  ファッション / 美容・スキンケア / メイク・コスメ / ネイル /
  恋愛・結婚 / 家族・子育て / 仕事・キャリア / ボランティア・社会貢献 / その他
  （どれにも当てはまらなければ "その他"）
- category_medium（中カテゴリー）・category_small（小カテゴリー）は自由記述で具体化する。
  例: 大=アニメ / 中=SF / 小=作品名
- topic は「何の話か」を表す短い見出しにする。
- preference は like | interested | dislike | conditional（好き・嫌いの**向き**）。会話から無理なく分かる範囲で。分からなければ interested。
- intensity は low | medium | high（**どのくらい強く好きか/関心があるか**）。
  言い回しや相槌の熱量から推定する（「ハマってる」「めっちゃ」→ high、「まあ」「別に」→ low、判断材料が薄ければ medium）。
- preference・intensity は決めつけない。あくまで会話に表れた範囲でよい。

各エピソードの contents には、**そのエピソードの1行要約を1件だけ**入れる（reason / emotion などに細かく分割しない）。
- label は "example" を使い、content には「ご主人によると〜〜〜なんだってね。」の形式で、
  事実ベースの1行要約を書く（「ユーザーは〜と話した。」という書き方はしない）。
- content は **80字以内**を目安に簡潔に。文末は「。」で終える。
- 「〜を好む人」「〜と感じている」のような性格・内面の言い換えはしない。
- shareability（共有してよい範囲）と confidence を必ず付ける。

shareability:
- ok: 友達との共通点探しに使ってよい（趣味・関心など当たり障りのない話題）
- summary_only: 要約だけ使ってよい
- private: 共通点探しには使わない
- unknown: まだ確認していない（迷ったらこれ）

confidence は low | medium | high。推測が強いほど low にする。

## 全体の分類（category：保存先と共有可否のルーティング）
- public: 趣味・関心など友達と共有してよい話題が中心
- private: ユーザー理解には使うが共有しない情報が中心
- review_required: **共有可否の判断が難しいセンシティブ寄りの内容**があるときだけ
- blocked: 連絡先・住所・センシティブな個人情報・共有禁止トピック

重要: 情報が少ない・発話が短い・相槌だから、という理由で review_required にしてはいけない。
その場合は private にする。review_required は健康・宗教・政治・収入・家庭環境や、
地名・大学名・学校名・勤務先名など個人の特定につながり得る固有名詞を含む内容など、
センシティブで共有可否が曖昧な内容に限る。

## ガードレール
健康・宗教・政治・性的嗜好・収入・家庭環境・正確な居場所・他人の個人情報は、
原則 private か review_required にし、共通点探しには使わない（contents の shareability も private にする）。
**地名（市区町村・駅名・地域名など）・大学名・学校名・勤務先名**が発話に含まれる場合は、
個人の特定につながり得るため category を review_required にし、safe_summary には
その固有名詞を含めず「ご主人によると〜の話をしていたみたい。」程度に抽象化した、伝聞口調の要約にする。
共有可否が未確認のものは shareability=unknown とする。
ユーザーの人格を断定しない。

出力JSON:
{{
  "category": "private|public|blocked|review_required",
  "interests": ["話に出たトピック名（性格の評価ではなく話題そのもの）"],
  "values": [],
  "recent_topics": ["きっかけになりやすい最近の話題"],
  "conversation_style_notes": "",
  "safe_summary": "review_requiredのときだけ、個人情報抜きで「ご主人によると〜なんだってね。」のような伝聞口調1行にする。それ以外は空文字",
  "blocked_reason": "blockedの場合のみ理由",
  "review_reason": "review_requiredの場合のみ理由",
  "review_category_large": "review_requiredのとき、その話題のカテゴリーを上の100個から必ず1つ選ぶ（カードのカテゴリー表示に使う）",
  "profiles": [
    {{
      "topic": "好きな対象の名前",
      "category_large": "上のリストから1つ",
      "category_medium": "中カテゴリー（自由記述）",
      "category_small": "小カテゴリー（自由記述）",
      "preference": "like|interested|dislike|conditional",
      "intensity": "low|medium|high",
      "depth_confirmed": "既存がunconfirmedのトピックを更新するときだけ判定（trueなら深掘り完了）。それ以外はfalse",
      "contents": [
        {{
          "label": "reason|emotion|context|social_mode|boundary|example|related_topic",
          "content": "具体的な内容",
          "shareability": "ok|summary_only|private|unknown",
          "confidence": "low|medium|high"
        }}
      ]
    }}
  ]
}}

注意: shareability=ok の内容は、具体的な個人情報を含まない表現にする。
例: "カフェで作業した話" → OK / "渋谷の〇〇カフェの会員" → NG
カードは「エピソード1つにつき1枚」。同じ話を理由・感情などに分けて複数のカードにしない。
"""

_UPDATE_PROMPT = """\
あなたはAIペットです。ユーザーが交流レポートのカードに対して以下の反応を示しました。
これをもとに、ユーザーの興味・好みの提案スタイルを更新するためのJSON分析を行ってください。

反応データ:
{reactions_json}

現在のPublic Memory:
{public_memory_json}

出力JSON:
{{
  "interests_reinforced": ["ユーザーが好反応を示した話題"],
  "interests_weakened": ["ユーザーが否定的だった話題"],
  "preferred_suggestion_style": "detailed|casual|question_form",
  "new_interest_candidates": ["新しい関心候補"]
}}
"""


class MemoryAgent:
    def __init__(self, vertex_ai: VertexAIService, firestore: FirestoreService):
        self._ai = vertex_ai
        self._db = firestore

    def classify_and_store(self, user_id: str, user_input: UserInputCreate) -> MemoryClassifyResult:
        """単発入力（/inputs・オンボーディング等）の分類と保存。"""
        blocked_topics = self._db.get_blocked_topics(user_id)

        # Rule-based pre-filter
        if is_obviously_blocked(user_input.content):
            self._db.add_blocked_memory(user_id, {
                "blocked_topic": user_input.content[:100],
                "reason": "rule_based_pii",
            })
            return MemoryClassifyResult(category="blocked", blocked_reason="個人情報が検出されました")

        existing_profiles = self._get_existing_profiles(user_id)
        result = self._llm_classify(f"ユーザー: {user_input.content}", blocked_topics, existing_profiles)

        # Save input record
        self._db.save_user_input(user_id, {
            "input_type": user_input.input_type,
            "content": user_input.content,
            "classified_category": result.category,
        })

        self._route_and_persist(user_id, result, blocked_content=user_input.content)
        return result

    def reclassify_recent(self, user_id: str) -> MemoryClassifyResult | None:
        """直近の会話ウィンドウを毎ターン再構成して分類・保存する（非同期実行向け）。

        話題の区切りは LLM 自身が判断し、同一話題はまとめ、1発話に複数話題があれば分割する。
        相槌は単独で確認項目を作らず、直前の話題の強さ(intensity)に反映する。
        """
        messages = self._db.get_recent_chat_messages(user_id)
        if not messages:
            return None

        blocked_topics = self._db.get_blocked_topics(user_id)

        # 直近の user 発話が PII なら、その文だけ blocked にして LLM 入力からは除外する。
        latest_user = (messages[-1].get("user_message") or "") if messages else ""
        if latest_user and is_obviously_blocked(latest_user):
            self._db.add_blocked_memory(user_id, {
                "blocked_topic": latest_user[:100],
                "reason": "rule_based_pii",
            })
            messages = messages[:-1]
            if not messages:
                return None

        existing_profiles = self._get_existing_profiles(user_id)
        result = self._llm_classify(_render_window(messages), blocked_topics, existing_profiles)
        self._route_and_persist(user_id, result, blocked_content=latest_user)
        return result

    def _route_and_persist(
        self, user_id: str, result: MemoryClassifyResult, blocked_content: str
    ) -> None:
        if result.category in ("public", "private"):
            # 公開カードはここでは作らず、_persist_profiles で統合済みプロフィールから作り直す
            # （union 追記でカードが増え続けるのを防ぐ）。
            self._db.upsert_private_memory(user_id, {
                "interests": result.interests,
                "values": result.values,
                "recent_topics": result.recent_topics,
                "conversation_style_notes": result.conversation_style_notes,
            })
        elif result.category == "blocked":
            self._db.add_blocked_memory(user_id, {
                "blocked_topic": blocked_content[:100],
                "reason": result.blocked_reason,
            })
        elif result.category == "review_required":
            candidate = result.safe_summary or blocked_content[:200]
            # 同じ内容の確認待ちが既にあれば重複登録しない（毎ターン再構成での乱立を防ぐ）。
            if candidate and not self._has_pending_review(user_id, candidate):
                self._db.add_review_required(user_id, {
                    "candidate_summary": candidate,
                    "reason": result.review_reason,
                    # 承認時にカードのカテゴリーとして使う（エージェントが決めたカテゴリー）。
                    "category_large": result.review_category_large,
                })

        # blocked 以外なら、構造化した嗜好プロフィールを永続化する
        if result.category != "blocked" and result.profiles:
            self._persist_profiles(user_id, result)

    def _has_pending_review(self, user_id: str, candidate_summary: str) -> bool:
        for item in self._db.get_review_items(user_id):
            if item.get("candidate_summary") == candidate_summary:
                return True
        return False

    def _get_existing_profiles(self, user_id: str) -> list[dict]:
        return (self._db.get_private_memory(user_id) or {}).get("profiles") or []

    def _persist_profiles(self, user_id: str, result: MemoryClassifyResult) -> None:
        """嗜好プロフィールを Private Memory にトピック単位でマージ保存し、
        共有可の要素のみ Public Memory に反映する。"""
        existing = self._get_existing_profiles(user_id)
        new_dicts = [p.model_dump() for p in result.profiles]
        merged = _merge_profiles_by_topic(existing, new_dicts)
        self._db.set_private_memory_profiles(user_id, merged)
        self._rebuild_public_from_profiles(
            user_id, merged, conversation_hooks=result.recent_topics or []
        )

    def _rebuild_public_from_profiles(
        self, user_id: str, merged: list[dict], conversation_hooks: list[str] | None = None
    ) -> None:
        """統合済みプロフィール全体から公開メモリの共有フィールドを作り直して置換する。

        union 追記しないので 1トピック1枚に保たれ、共有対象が減れば減る。
        conversation_hooks を None にすると既存の hooks を保持する（ラベル更新時など会話由来の
        hooks を消さないため）。
        """
        shareable_tags: list[str] = []
        shareable_interests: list[str] = []
        shareable_summaries: list[str] = []
        for p in merged:
            category_path = [p.get("category_large"), p.get("category_medium"), p.get("category_small")]
            contents = p.get("contents") or []
            has_ok = any(c.get("shareability") == "ok" for c in contents)
            has_summary = any(c.get("shareability") == "summary_only" for c in contents)
            topic = p.get("topic")
            if has_ok:
                shareable_tags.extend(t for t in category_path if t)
                if topic:
                    shareable_interests.append(topic)
                shareable_summaries.extend(
                    c.get("content") for c in contents if c.get("shareability") == "ok" and c.get("content")
                )
            elif has_summary and topic:
                # 詳細は出さず、トピック名だけを要約として共有
                shareable_summaries.append(topic)

        fields = {
            "safe_topic_tags": list(dict.fromkeys(shareable_tags)),
            "shareable_interests": list(dict.fromkeys(shareable_interests)),
            "safe_summaries": list(dict.fromkeys(shareable_summaries)),
        }
        if conversation_hooks is not None:
            fields["public_conversation_hooks"] = list(dict.fromkeys(conversation_hooks))
        self._db.set_public_memory_fields(user_id, fields)

    def apply_selected_labels(self, user_id: str, labels: list[dict]) -> list[dict]:
        """ルールベースで選んだ「好きなもの」ラベルをプロフィール化して保存する。

        既存の origin=="label" プロフィールを全除去し、新しい選択で作り直す
        （設定画面での編集＝置換）。LLM を通さず、category_large のみ検証する。
        戻り値は保存した正本ラベル（不正カテゴリーを丸めた後）。
        """
        canonical: list[dict] = []
        label_profiles: list[dict] = []
        seen: set[str] = set()
        for label in labels:
            name = str(label.get("name") or "").strip()
            if not name or name in seen:
                continue
            seen.add(name)
            category = label.get("category_large")
            if category not in LARGE_CATEGORIES:
                category = "その他"
            medium = str(label.get("category_medium") or "").strip()
            small = str(label.get("category_small") or "").strip()
            canonical.append({
                "name": name,
                "category_large": category,
                "category_medium": medium,
                "category_small": small,
            })
            label_profiles.append({
                "topic": name,
                "category_large": category,
                "category_medium": medium,
                "category_small": small,
                "preference": "like",
                "intensity": "high",
                "origin": "label",
                # 選んだだけで理由・中身は未確認。会話で深掘りできるまで「（未確認）」を出す。
                "unconfirmed": True,
                "contents": [{
                    "label": "reason",
                    "content": name,
                    "shareability": "ok",
                    "confidence": "high",
                }],
            })

        # 既存の会話由来プロフィールは残し、ラベル由来のみ入れ替える。
        existing = [p for p in self._get_existing_profiles(user_id) if p.get("origin") != "label"]
        merged = _merge_profiles_by_topic(existing, label_profiles)
        self._db.set_private_memory_profiles(user_id, merged)
        # 会話由来の hooks を消さないよう conversation_hooks は触らない。
        self._rebuild_public_from_profiles(user_id, merged, conversation_hooks=None)
        self._db.set_selected_labels(user_id, canonical)
        return canonical

    def _llm_classify(
        self, conversation: str, blocked_topics: list[str], existing_profiles: list[dict]
    ) -> MemoryClassifyResult:
        prompt = _CLASSIFY_PROMPT.format(
            conversation=conversation,
            existing_profiles_json=json.dumps(existing_profiles, ensure_ascii=False),
            blocked_topics_json=json.dumps(blocked_topics, ensure_ascii=False),
        )
        try:
            raw = self._ai.generate_json(prompt, temperature=0.2)
            return MemoryClassifyResult(**_normalize_memory_result(raw))
        except Exception as e:
            logger.error("LLM1 classification failed, falling back to private: %s", e)
            return MemoryClassifyResult(category="private")

    def update_from_feedback(self, user_id: str, card_reactions: list[dict]) -> None:
        public_memory = self._db.get_public_memory(user_id) or {}
        prompt = _UPDATE_PROMPT.format(
            reactions_json=json.dumps(card_reactions, ensure_ascii=False),
            public_memory_json=json.dumps(public_memory, ensure_ascii=False),
        )
        try:
            raw = self._ai.generate_json(prompt, temperature=0.2)
            reinforced = raw.get("interests_reinforced", [])
            new_candidates = raw.get("new_interest_candidates", [])
            if reinforced or new_candidates:
                self._db.upsert_private_memory(user_id, {
                    "interests": reinforced + new_candidates,
                    "preferred_suggestion_style": raw.get("preferred_suggestion_style", ""),
                })
        except Exception as e:
            logger.error("LLM4 memory update failed: %s", e)


_VALID_LABELS = {"reason", "emotion", "context", "social_mode", "boundary", "example", "related_topic"}
_VALID_SHAREABILITY = {"ok", "summary_only", "private", "unknown"}
_VALID_CONFIDENCE = {"low", "medium", "high"}
_VALID_PREFERENCE = {"like", "interested", "dislike", "conditional"}
_VALID_INTENSITY = {"low", "medium", "high"}
_SUMMARY_LIMIT = 100


def _trim_to_sentence(text: str, limit: int = _SUMMARY_LIMIT) -> str:
    """要約を limit 文字以内に、文末（。）で自然に収める。

    limit 以内に句点があればそこまで採用する。limit 以内に句点が無ければ、
    文を途中で切らずに最初の1文をそのまま残す（多少 limit を超えることがある）。
    「…」のような切り詰め記号は付けない。
    """
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    cut = text.rfind("。", 0, limit)
    if cut != -1:
        return text[: cut + 1]
    first = text.find("。")
    if first != -1:
        return text[: first + 1]
    return text


def _render_window(messages: list[dict]) -> str:
    """chat_messages のウィンドウを会話テキストに整形する。"""
    lines: list[str] = []
    for m in messages:
        user_msg = m.get("user_message")
        pet_reply = m.get("pet_reply")
        if user_msg:
            lines.append(f"ユーザー: {user_msg}")
        if pet_reply:
            lines.append(f"ペット: {pet_reply}")
    return "\n".join(lines)


def _topic_key(profile: dict) -> str:
    """同一話題判定用のキー。大カテゴリー＋トピック名（正規化）。"""
    topic = (profile.get("topic") or "").strip().lower()
    large = (profile.get("category_large") or "").strip()
    return f"{large}::{topic}" if topic else ""


def _merge_profiles_by_topic(existing: list[dict], new: list[dict]) -> list[dict]:
    """既存プロフィールに新規/更新プロフィールをトピック単位でマージする。

    同じトピックは新しい内容で置き換え（毎ターン再構成）、無ければ追記する。
    トピック名が空の新規プロフィールは追記する。
    """
    result = list(existing)
    index = {}
    for i, p in enumerate(result):
        key = _topic_key(p)
        if key:
            index[key] = i
    for np in new:
        key = _topic_key(np)
        # depth_confirmed は unconfirmed 解除を判定するための一時的な信号。永続化はしない。
        depth_confirmed = np.pop("depth_confirmed", False)
        if key and key in index:
            old = result[index[key]]
            if old.get("origin") == "label" and np.get("origin") != "label":
                np = {**np, "origin": "label"}
                # ラベル由来の未確認トピックは、会話で深掘りが完了したと判定された時だけ
                # unconfirmed を外す（「（未確認）」表示が消える）。浅い言及では維持する。
                if old.get("unconfirmed") and not depth_confirmed:
                    np["unconfirmed"] = True
            result[index[key]] = np
        else:
            result.append(np)
            if key:
                index[key] = len(result) - 1
    return result[:50]  # cap


def _normalize_memory_result(raw: dict) -> dict:
    return {
        "category": raw.get("category") or "private",
        "interests": raw.get("interests") or [],
        "values": raw.get("values") or [],
        "recent_topics": raw.get("recent_topics") or [],
        "conversation_style_notes": raw.get("conversation_style_notes") or "",
        "safe_summary": _trim_to_sentence(raw.get("safe_summary") or ""),
        "blocked_reason": raw.get("blocked_reason") or "",
        "review_reason": raw.get("review_reason") or "",
        "review_category_large": raw.get("review_category_large") or "",
        "profiles": _normalize_profiles(raw.get("profiles")),
    }


def _normalize_profiles(raw_profiles) -> list[dict]:
    """LLM出力の profiles をサニタイズ。不正な値は安全側に丸め、欠損要素はスキップする。"""
    if not isinstance(raw_profiles, list):
        return []
    profiles = []
    for p in raw_profiles:
        if not isinstance(p, dict):
            continue
        large = p.get("category_large")
        contents = []
        for c in p.get("contents") or []:
            if not isinstance(c, dict):
                continue
            label = c.get("label")
            content = c.get("content")
            if label not in _VALID_LABELS or not content:
                continue
            share = c.get("shareability")
            conf = c.get("confidence")
            contents.append({
                "label": label,
                "content": _trim_to_sentence(str(content)),
                "shareability": share if share in _VALID_SHAREABILITY else "unknown",
                "confidence": conf if conf in _VALID_CONFIDENCE else "low",
            })
        pref = p.get("preference")
        intensity = p.get("intensity")
        profiles.append({
            "topic": str(p.get("topic") or ""),
            "category_large": large if large in LARGE_CATEGORIES else "その他",
            "category_medium": str(p.get("category_medium") or ""),
            "category_small": str(p.get("category_small") or ""),
            "preference": pref if pref in _VALID_PREFERENCE else "interested",
            "intensity": intensity if intensity in _VALID_INTENSITY else "medium",
            "depth_confirmed": bool(p.get("depth_confirmed")),
            "contents": contents,
        })
    return profiles
