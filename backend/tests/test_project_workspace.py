from backend import models
from backend.auth_utils import create_access_token


def test_projects_are_private_and_membership_controls_case_writes(client, db):
    user = models.User(username="collaborator", email="collaborator@example.test", hashed_password="!", role="viewer")
    db.add(user)
    db.commit()
    admin_headers = dict(client.headers)
    assert client.post("/api/projects", json={"id": "one", "name": "One"}).status_code == 201
    assert client.post("/api/projects", json={"id": "two", "name": "Two"}).status_code == 201
    case = client.post("/api/tests", json={"id": "PRIVATE", "title": "Private", "project_id": "two"})
    assert case.status_code == 201
    assert client.put(f"/api/projects/one/members/{user.id}", json={"role": "editor"}).status_code == 200
    client.headers["Authorization"] = f"Bearer {create_access_token(user.id)}"
    assert [p["id"] for p in client.get("/api/projects").json()] == ["one"]
    assert client.get("/api/tests/PRIVATE").status_code == 404
    assert client.get("/api/tests/PRIVATE/steps").status_code == 404
    assert client.get("/api/history/test/PRIVATE").status_code == 404
    assert client.post("/api/tests", json={"id": "OWN", "title": "Own", "project_id": "one"}).status_code == 201
    assert client.post("/api/tests", json={"id": "NO", "title": "No", "project_id": "two"}).status_code in (403, 404)
    client.headers.update(admin_headers)
    assert client.put(f"/api/projects/one/members/{user.id}", json={"role": "viewer"}).status_code == 200
    client.headers["Authorization"] = f"Bearer {create_access_token(user.id)}"
    assert client.patch("/api/tests/OWN", json={"title": "Changed"}).status_code in (403, 404)


def test_folder_and_case_require_consistent_project(client):
    client.post("/api/projects", json={"id": "one", "name": "One"})
    client.post("/api/projects", json={"id": "two", "name": "Two"})
    assert client.post("/api/folders", json={"id": "folder", "name": "Folder", "project_id": "one"}).status_code == 201
    assert client.post("/api/tests", json={"id": "BAD", "title": "Bad", "project_id": "two", "folder_id": "folder"}).status_code == 422
    assert client.post("/api/tests", json={"id": "NONE", "title": "No project"}).status_code == 422
    client.headers["X-Project-ID"] = "two"
    assert client.delete("/api/projects/one").status_code == 409


def test_editor_fields_steps_and_history(client):
    client.post("/api/projects", json={"id": "one", "name": "One"})
    created = client.post("/api/tests", json={"id": "EDIT", "title": "Editable", "project_id": "one"}).json()
    assert created["author"] == "test_admin"
    updated = client.patch("/api/tests/EDIT", json={"description": "Description", "prerequisites": "Setup", "revision": created["revision"]})
    assert updated.status_code == 200
    assert updated.json()["description"] == "Description"
    assert client.patch("/api/tests/EDIT", json={"type": "automated"}).json()["auto"] is True
    assert client.patch("/api/tests/EDIT", json={"title": "Stale", "revision": created["revision"]}).status_code == 409
    steps = client.patch("/api/tests/EDIT/steps", json=[{"action": "First"}, {"action": "Second"}]).json()
    reordered = client.patch("/api/tests/EDIT/steps", json=list(reversed(steps)))
    assert reordered.status_code == 200
    assert [s["id"] for s in reordered.json()] == [s["id"] for s in reversed(steps)]
    history = client.get("/api/history/test/EDIT").json()
    assert "First" in str(history) and "Second" in str(history)


def test_project_data_does_not_leak_through_aggregate_graphql_or_attachments(client, db):
    for pid in ("allowed", "hidden"):
        client.post("/api/projects", json={"id": pid, "name": pid})
        client.post("/api/tests", json={"id": pid, "title": pid + " secret", "project_id": pid})
    user = models.User(username="reader", email="reader@example.test", hashed_password="!", role="tester")
    db.add(user)
    db.commit()
    client.put(f"/api/projects/allowed/members/{user.id}", json={"role": "viewer"})
    client.headers["Authorization"] = f"Bearer {create_access_token(user.id)}"
    assert "hidden secret" not in client.get("/api/initial-data").text
    assert "hidden secret" not in client.get("/api/tests/export").text
    result = client.post("/graphql", json={"query": '{ tests { id title } test(id:"hidden") { id title } }'})
    assert "hidden secret" not in result.text
    assert result.json()["data"]["test"] is None
    assert client.post("/api/attachments", data={"entity_type": "test", "entity_id": "hidden"}, files={"file": ("proof.txt", b"private")}).status_code == 404
    assert client.patch("/api/tests/allowed/steps", json=[{"action": "No permission"}]).status_code == 403


def test_last_owner_and_folder_cycles(client, db):
    client.post("/api/projects", json={"id": "one", "name": "One"})
    admin = db.query(models.User).filter_by(role="admin").one()
    assert client.delete(f"/api/projects/one/members/{admin.id}").status_code == 409
    client.post("/api/folders", json={"id": "parent", "name": "Parent", "project_id": "one"})
    client.post("/api/folders", json={"id": "child", "name": "Child", "project_id": "one", "parent_id": "parent"})
    assert client.patch("/api/folders/parent", json={"parent_id": "child"}).status_code == 422


def test_appearance_persists_and_is_validated(client):
    value = {"textSize": 18, "scale": 125, "density": "comfortable"}
    assert client.put("/api/me", json={"appearance": value}).json()["appearance"] == value
    assert client.get("/api/me").json()["appearance"] == value
    assert client.put("/api/me", json={"appearance": {"scale": 999}}).status_code == 422


def test_identical_steps_keep_identity_when_reordered(client):
    client.post("/api/projects", json={"id": "one", "name": "One"})
    client.post("/api/tests", json={"id": "SAME", "title": "Steps", "project_id": "one"})
    rows = client.patch("/api/tests/SAME/steps", json=[{"action": "Repeat"}, {"action": "Repeat"}]).json()
    result = client.patch("/api/tests/SAME/steps", json=list(reversed(rows)))
    assert [row["id"] for row in result.json()] == [row["id"] for row in reversed(rows)]


def test_viewer_can_read_pending_step_results_but_cannot_change_them(client, db):
    client.post("/api/projects", json={"id": "one", "name": "One"})
    client.post("/api/tests", json={"id": "READ", "title": "Read", "project_id": "one"})
    steps = client.patch("/api/tests/READ/steps", json=[{"action": "Open"}]).json()
    user = models.User(username="step-reader", email="step-reader@example.test", hashed_password="!", role="tester")
    db.add_all([user, models.Run(id="READ-RUN", name="Read run")])
    db.flush()
    case = models.RunCase(run_id="READ-RUN", test_id="READ")
    db.add(case)
    db.commit()
    client.put(f"/api/projects/one/members/{user.id}", json={"role": "viewer"})
    client.headers["Authorization"] = f"Bearer {create_access_token(user.id)}"
    path = f"/api/runs/READ-RUN/cases/{case.id}/steps"
    result = client.get(path)
    assert result.status_code == 200, result.text
    assert result.json()[0]["status"] == "pending"
    assert client.patch(path + f'/{steps[0]["id"]}', json={"status": "pass"}).status_code == 403
    assert client.patch("/api/runs/READ-RUN/status?status=completed").status_code == 403


def test_related_history_is_visible_only_to_members(client, db):
    client.post("/api/projects", json={"id": "one", "name": "One"})
    client.post("/api/tests", json={"id": "HISTORY", "title": "History", "project_id": "one"})
    user = models.User(username="history-reader", email="history-reader@example.test", hashed_password="!", role="tester")
    db.add(user)
    db.add(models.Defect(id="D-HISTORY", title="Defect", test_id="HISTORY"))
    requirement = models.Requirement(id="REQ-HISTORY", title="Requirement")
    requirement.tests = [db.get(models.Test, "HISTORY")]
    db.add(requirement)
    for entity, identifier in (("defect", "D-HISTORY"), ("requirement", "REQ-HISTORY")):
        db.add(models.RecordHistory(entity_type=entity, entity_id=identifier, action="update", actor_name="test_admin", created_at="2026-01-01T00:00:00Z", changes=[{"field": "title", "old": "Before", "new": "After"}]))
    db.commit()
    client.put(f"/api/projects/one/members/{user.id}", json={"role": "viewer"})
    admin_headers = dict(client.headers)
    client.headers["Authorization"] = f"Bearer {create_access_token(user.id)}"
    for entity, identifier in (("defect", "D-HISTORY"), ("requirement", "REQ-HISTORY")):
        assert len(client.get(f"/api/history/{entity}/{identifier}").json()) == 1
    client.headers.update(admin_headers)
    client.delete(f"/api/projects/one/members/{user.id}")
    client.headers["Authorization"] = f"Bearer {create_access_token(user.id)}"
    assert client.get("/api/history/defect/D-HISTORY").json() == []
