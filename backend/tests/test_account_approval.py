from backend import models
from backend.auth_utils import create_access_token, create_websocket_ticket, user_from_bearer_token, user_from_websocket_ticket
from backend.routers.oauth import upsert_oauth_user


def test_new_mattermost_account_waits_for_approval(client, db):
    result = upsert_oauth_user(db, provider="mattermost", oauth_id="new-member",
                              email="new@example.test", verified=False,
                              display_name="New", ip=None, allow_provisioning=True)
    assert result == {"status": "pending_approval"}
    user = db.query(models.User).filter_by(email="new@example.test").one()
    assert user.account_status == "pending"
    assert client.get("/api/me", headers={"Authorization": f"Bearer {create_access_token(user.id)}"}).status_code == 401
    response = client.patch(f"/api/admin/users/{user.id}/status", json={"status": "active", "role": "tester"})
    assert response.status_code == 200
    assert response.json()["role"] == "tester"
    result = upsert_oauth_user(db, provider="mattermost", oauth_id="new-member",
                              email="new@example.test", verified=False,
                              display_name="New", ip=None)
    assert result["status"] == "ok"


def test_blocked_user_rejected_by_all_resolvers(client, db):
    user = models.User(username="blocked", email="blocked@example.test", hashed_password="!", role="viewer")
    db.add(user)
    db.commit()
    token = create_access_token(user.id)
    ticket = create_websocket_ticket(user.id)
    user.account_status = "blocked"
    db.commit()
    assert user_from_bearer_token(token, db) is None
    assert user_from_websocket_ticket(ticket, db) is None
    assert client.get("/api/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_cannot_block_last_admin(client, db):
    admin = db.query(models.User).filter_by(role="admin").one()
    assert client.patch(f"/api/admin/users/{admin.id}/status", json={"status": "blocked"}).status_code == 409
