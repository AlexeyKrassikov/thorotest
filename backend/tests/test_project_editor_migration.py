from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text


def test_editor_migration_preserves_legacy_records_without_granting_access(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'editor-migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    config = Config("alembic.ini")
    command.upgrade(config, "f5b2c9d7a801")
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO folders (id, name) VALUES ('legacy-folder', 'Legacy')"))
        connection.execute(text("INSERT INTO tests (id, title, folder_id) VALUES ('LEGACY', 'Keep this', 'legacy-folder')"))
        connection.execute(text("INSERT INTO test_steps (test_id, \"order\", action) VALUES ('LEGACY', 1, 'Keep step')"))
    command.upgrade(config, "head")
    with engine.connect() as connection:
        row = connection.execute(text("SELECT title, project_id, description, prerequisites, revision FROM tests WHERE id='LEGACY'")).one()
        assert tuple(row) == ("Keep this", None, "", "", 0)
        assert connection.execute(text("SELECT name FROM folders WHERE id='legacy-folder'")).scalar() == "Legacy"
        assert tuple(connection.execute(text("SELECT action, archived FROM test_steps WHERE test_id='LEGACY'")).one()) == ("Keep step", 0)
        assert connection.execute(text("SELECT count(*) FROM project_members")).scalar() == 0
    engine.dispose()
