import re

# Patterns that are always blocked regardless of LLM classification
_BLOCKED_PATTERNS = [
    re.compile(r"(?<!\d)0\d{1,4}[-\s]?\d{2,4}[-\s]?\d{4}(?!\d)"),   # Japanese phone number
    re.compile(r"(?<!\d)\d{3}[-\s]?\d{4}[-\s]?\d{4}(?!\d)"),          # Mobile phone
    re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"),  # Email
    re.compile(r"(?<!\d)\d{3}[-\s]?\d{4}(?!\d)"),                       # Japanese postal code
    re.compile(r"(住所|address|〒|番地|丁目|アパート|マンション).{0,30}\d"),
    re.compile(r"(パスワード|password|pw|pass).{0,10}[:=]\s*\S+", re.IGNORECASE),
    re.compile(r"(マイナンバー|個人番号|社会保障番号).{0,10}\d{4}"),
]


def is_obviously_blocked(text: str) -> bool:
    for pattern in _BLOCKED_PATTERNS:
        if pattern.search(text):
            return True
    return False
