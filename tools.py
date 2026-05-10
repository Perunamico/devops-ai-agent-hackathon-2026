import json
from pathlib import Path

NOTES_FILE = "notes.json"


def save_note(text: str):
    path = Path(NOTES_FILE)

    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            notes = json.load(f)
    else:
        notes = []

    notes.append(text)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(notes, f, ensure_ascii=False, indent=2)

    return {
        "status": "success",
        "saved_note": text
    }