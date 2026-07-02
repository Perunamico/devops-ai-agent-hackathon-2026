import pytest

from app.config import Settings
from app.services.firestore_service import FirestoreService


def test_firestore_enabled_raises_when_client_init_fails(monkeypatch):
    from google.cloud import firestore

    def raise_client_error(*args, **kwargs):
        raise RuntimeError("credentials unavailable")

    monkeypatch.setattr(firestore, "Client", raise_client_error)

    with pytest.raises(RuntimeError, match="Firestore is enabled"):
        FirestoreService(Settings(firestore_enabled=True, google_cloud_project="test-project"))


def test_firestore_disabled_uses_in_memory_store():
    db = FirestoreService(Settings(firestore_enabled=False, skip_auth=True))

    db.upsert_user("user1", {"name": "test"})

    assert db.get_user("user1") == {"id": "user1", "name": "test"}
