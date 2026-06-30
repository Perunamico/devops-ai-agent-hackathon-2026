from app.config import Settings
from app.services.firestore_service import FirestoreService


def test_get_memory_list_groups_review_allowed_and_secret():
    db = FirestoreService(Settings(firestore_enabled=False))
    user_id = "user-1"

    db.add_review_required(user_id, {
        "candidate_summary": "健康の話題",
        "reason": "共有してよいか確認が必要",
    })
    db.upsert_public_memory(user_id, {
        "safe_summaries": ["カフェ巡りが好き"],
        "shareable_interests": ["映画鑑賞"],
    })
    db.upsert_private_memory(user_id, {
        "interests": ["カフェ巡りが好き", "夜に作業するのが好き"],
        "conversation_style_notes": "落ち着いた会話を好む",
        "profiles": [
            {
                "topic": "音楽",
                "category_large": "音楽",
                "category_medium": "ライブ",
                "category_small": "",
                "contents": [
                    {
                        "content": "小さなライブハウスが好き",
                        "shareability": "ok",
                    },
                    {
                        "content": "家族の予定に合わせて行く",
                        "shareability": "private",
                    },
                    {
                        "content": "特定の健康事情に左右される",
                        "shareability": "unknown",
                    },
                ],
            }
        ],
    })
    db.add_blocked_memory(user_id, {
        "blocked_topic": "電話番号",
        "reason": "rule_based_pii",
    })

    memories = db.get_memory_list(user_id)

    assert [item["summary"] for item in memories["review"]] == [
        "健康の話題",
        "特定の健康事情に左右される",
    ]
    # カード自体は従来どおり（safe_summaries 由来＋共有可のプロフィール内容）。
    # shareable_interests（映画鑑賞）はマッチング用に保存はするがカード表示しない。
    assert [item["summary"] for item in memories["allowed"]] == [
        "カフェ巡りが好き",
        "小さなライブハウスが好き",
    ]
    # チップ（category）は中身のカテゴリーのみ。「公開要約」固定は出さない。
    # 対応するプロフィールが無い safe_summary はカテゴリー空（チップ非表示）。
    assert memories["allowed"][0]["category"] == ""
    assert memories["allowed"][1]["category"] == "音楽"
    # interests（夜に作業するのが好き）はタグなのでカード化しない。
    # 秘匿カードは共有しないプロフィール内容・会話スタイル・ブロック情報のみ。
    assert [item["summary"] for item in memories["secret"]] == [
        "家族の予定に合わせて行く",
        "落ち着いた会話を好む",
        "電話番号",
    ]
    # review_required も unknown 由来の項目も、どちらも操作可能にする。
    assert memories["review"][0]["can_approve"] is True
    assert memories["review"][1]["can_approve"] is True


def _seed_unknown_profile(db, user_id: str) -> None:
    db.upsert_private_memory(user_id, {
        "profiles": [
            {
                "topic": "音楽",
                "category_large": "音楽",
                "category_medium": "ライブ",
                "contents": [
                    {"content": "小さなライブハウスが好き", "shareability": "ok"},
                    {"content": "家族の予定に合わせて行く", "shareability": "private"},
                    {"content": "特定の健康事情に左右される", "shareability": "unknown"},
                ],
            }
        ],
    })


def test_approve_unknown_profile_content_moves_to_allowed():
    db = FirestoreService(Settings(firestore_enabled=False))
    user_id = "user-2"
    _seed_unknown_profile(db, user_id)

    # unknown 内容は private-profile-0-2 として確認依頼に出る。
    before = db.get_memory_list(user_id)
    assert "特定の健康事情に左右される" in [i["summary"] for i in before["review"]]

    db.resolve_review_item(user_id, "private-profile-0-2", "approve")

    after = db.get_memory_list(user_id)
    assert "特定の健康事情に左右される" not in [i["summary"] for i in after["review"]]
    assert "特定の健康事情に左右される" in [i["summary"] for i in after["allowed"]]


def test_review_approval_card_uses_agent_category():
    # review_required を承認すると公開カードになる。チップは profiles を通らないので
    # エージェントが付けた category_large（review_required 用）を保存・表示する。
    db = FirestoreService(Settings(firestore_enabled=False))
    user_id = "user-r"
    db.add_review_required(user_id, {
        "candidate_summary": "健康の話題",
        "reason": "確認",
        "category_large": "健康・ウェルネス",
    })
    item_id = db.get_review_items(user_id)[0]["id"]

    db.resolve_review_item(user_id, item_id, "approve")

    allowed = db.get_memory_list(user_id)["allowed"]
    card = next(i for i in allowed if i["summary"] == "健康の話題")
    assert card["category"] == "健康・ウェルネス"


def test_reject_unknown_profile_content_moves_to_secret():
    db = FirestoreService(Settings(firestore_enabled=False))
    user_id = "user-3"
    _seed_unknown_profile(db, user_id)

    db.resolve_review_item(user_id, "private-profile-0-2", "reject")

    after = db.get_memory_list(user_id)
    assert "特定の健康事情に左右される" not in [i["summary"] for i in after["review"]]
    assert "特定の健康事情に左右される" in [i["summary"] for i in after["secret"]]
