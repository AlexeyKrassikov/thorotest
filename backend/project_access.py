"""Project capabilities shared by REST, GraphQL and related record queries."""
from fastapi import HTTPException
from sqlalchemy import event, select, or_, false
from sqlalchemy.orm import Session, with_loader_criteria
from . import models as m


def permission(db, user, project_id):
    if user.role == "admin":
        return "owner"
    member = db.get(m.ProjectMember, (project_id, user.id)) if project_id else None
    return member.role if member else None


def require_project_access(db, user, project_id, write=False, manage=False):
    if not project_id:
        raise HTTPException(422, "Select a project")
    project = db.query(m.Project).filter_by(id=project_id).first()
    role = permission(db, user, project_id)
    if not project or not role:
        raise HTTPException(404, "Project not found")
    if (manage and role != "owner") or (write and role not in ("owner", "editor")):
        raise HTTPException(403, "Insufficient project permissions")
    return project


def require_test(db, user, test_id, write=False):
    test = db.query(m.Test).filter_by(id=test_id).first()
    if not test:
        raise HTTPException(404, "Test not found")
    if not test.project_id and user.role == "admin":
        return test
    require_project_access(db, user, test.project_id, write=write)
    return test


def validate_folder(db, user, project_id, folder_id=None, parent_id=None):
    require_project_access(db, user, project_id, write=True)
    for value in (folder_id, parent_id):
        if value:
            folder = db.query(m.Folder).filter_by(id=value, project_id=project_id).first()
            if not folder:
                raise HTTPException(422, "Folder must belong to the selected project")


def bind_access(db, user):
    # A request owns its session. Storing primitive identity avoids stale ORM users.
    db.info["project_user"] = (user.id, user.role)


@event.listens_for(Session, "do_orm_execute")
def scope_queries(state):
    identity = state.session.info.get("project_user")
    active = state.session.info.get("active_project")
    if identity and active:
        for model in (m.Test, m.Folder):
            state.statement = state.statement.options(with_loader_criteria(model, model.project_id == active, include_aliases=True))
    if not identity or identity[1] == "admin" or state.execution_options.get("project_internal"):
        return
    uid = identity[0]
    members = m.ProjectMember.__table__
    tests = m.Test.__table__
    folders = m.Folder.__table__
    cases = m.RunCase.__table__
    steps = m.TestStep.__table__
    projects = select(members.c.project_id).where(members.c.user_id == uid)
    if state.is_update or state.is_delete:
        projects = projects.where(members.c.role.in_(["owner", "editor"]))
    visible_tests = select(tests.c.id).where(tests.c.project_id.in_(projects))
    visible_folders = select(folders.c.id).where(folders.c.project_id.in_(projects))
    visible_cases = select(cases.c.id).where(cases.c.test_id.in_(visible_tests))
    visible_steps = select(steps.c.id).where(steps.c.test_id.in_(visible_tests))
    # A mixed-project run is visible only when all its cases are visible.
    visible_runs = select(cases.c.run_id).where(cases.c.test_id.in_(visible_tests)).distinct()
    hidden_cases = cases.alias("inaccessible_cases")
    visible_runs = visible_runs.where(~cases.c.run_id.in_(select(hidden_cases.c.run_id).where(
        ~hidden_cases.c.test_id.in_(visible_tests))))
    defects = m.Defect.__table__
    visible_defects = select(defects.c.id).where(defects.c.test_id.in_(visible_tests))
    links = m.requirement_tests
    hidden_links = links.alias("inaccessible_requirement_tests")
    visible_requirements = select(links.c.requirement_id).where(
        links.c.test_id.in_(visible_tests), ~links.c.requirement_id.in_(
            select(hidden_links.c.requirement_id).where(~hidden_links.c.test_id.in_(visible_tests))))
    rules = {
        m.Project: m.Project.id.in_(projects),
        m.Test: m.Test.project_id.in_(projects),
        m.Folder: m.Folder.project_id.in_(projects),
        m.TestStep: m.TestStep.test_id.in_(visible_tests),
        m.Comment: m.Comment.test_id.in_(visible_tests),
        m.RunCase: m.RunCase.test_id.in_(visible_tests),
        m.Run: m.Run.id.in_(visible_runs),
        m.StepResult: m.StepResult.run_case_id.in_(visible_cases),
        m.Defect: m.Defect.test_id.in_(visible_tests),
        m.Pipeline: m.Pipeline.run_id.in_(visible_runs),
        m.Activity: m.Activity.target.in_(visible_tests),
        m.UserFavorite: m.UserFavorite.folder_id.in_(visible_folders),
        m.Attachment: or_((m.Attachment.entity_type == "test") & m.Attachment.entity_id.in_(visible_tests),
                         (m.Attachment.entity_type == "step") & m.Attachment.entity_id.in_(select(steps.c.id.cast(m.String)).where(steps.c.id.in_(visible_steps))),
                         (m.Attachment.entity_type == "run_case") & m.Attachment.entity_id.in_(select(cases.c.id.cast(m.String)).where(cases.c.id.in_(visible_cases)))),
        m.RecordHistory: or_(
            (m.RecordHistory.entity_type == "test") & m.RecordHistory.entity_id.in_(visible_tests),
            (m.RecordHistory.entity_type == "defect") & m.RecordHistory.entity_id.in_(visible_defects),
            (m.RecordHistory.entity_type == "requirement") & m.RecordHistory.entity_id.in_(visible_requirements)),
        m.Notification: or_(m.Notification.link.in_(select(("#/tests/" + tests.c.id)).where(tests.c.id.in_(visible_tests))),
                            m.Notification.link.in_(select(("#/runs/" + m.Run.__table__.c.id)).where(m.Run.__table__.c.id.in_(visible_runs))),
                            m.Notification.link.in_(select(("#/defects/" + defects.c.id)).where(defects.c.id.in_(visible_defects))),
                            m.Notification.link.in_(select(("#/requirements/" + m.Requirement.__table__.c.id)).where(m.Requirement.__table__.c.id.in_(visible_requirements)))),
    }
    rules[m.Requirement] = m.Requirement.id.in_(visible_requirements)
    # Plan IDs are stored as JSON, not a join table. Evaluate this small catalog
    # through Core to avoid dialect-specific JSON membership SQL.
    connection = state.session.connection()
    allowed_ids = set(connection.execute(visible_tests).scalars())
    plans = connection.execute(select(m.TestPlan.__table__.c.id, m.TestPlan.__table__.c.test_ids)).all()
    rules[m.TestPlan] = m.TestPlan.id.in_([pid for pid, ids in plans if ids and set(ids) <= allowed_ids])
    for model, condition in rules.items():
        state.statement = state.statement.options(with_loader_criteria(model, condition, include_aliases=True))


@event.listens_for(Session, "before_flush")
def enforce_writes(db, flush_context, instances):
    identity = db.info.get("project_user")
    if not identity:
        return
    user = db.get(m.User, identity[0])
    for row in list(db.new) + list(db.dirty) + list(db.deleted):
        if row not in db.new and row not in db.deleted and not db.is_modified(row):
            continue
        if isinstance(row, (m.Test, m.Folder)):
            if not row.project_id and row in db.new:
                row.project_id = db.info.get("active_project")
            if not row.project_id and row not in db.new and user.role == "admin":
                continue
            require_project_access(db, user, row.project_id, write=True)
            if isinstance(row, m.Test) and row.folder_id:
                validate_folder(db, user, row.project_id, folder_id=row.folder_id)
        elif isinstance(row, (m.TestStep, m.Comment, m.RunCase)) and row.test_id:
            # Newly inserted cases may still be pending in this flush.
            test = next((t for t in db.new if isinstance(t, m.Test) and t.id == row.test_id), None)
            if test:
                require_project_access(db, user, test.project_id, write=True)
            else:
                require_test(db, user, row.test_id, write=True)
        elif isinstance(row, m.Defect) and row.test_id:
            require_test(db, user, row.test_id, write=True)
        elif isinstance(row, m.TestPlan):
            for test_id in row.test_ids or []:
                require_test(db, user, test_id, write=True)
        elif isinstance(row, m.Run) and row not in db.new and user.role != "admin":
            cases = m.RunCase.__table__
            test_ids = db.connection().execute(select(cases.c.test_id).where(cases.c.run_id == row.id)).scalars().all()
            if not test_ids:
                raise HTTPException(403, "Insufficient project permissions")
            for test_id in test_ids:
                require_test(db, user, test_id, write=True)
        elif isinstance(row, m.StepResult):
            case = db.query(m.RunCase).filter_by(id=row.run_case_id).first()
            step = db.query(m.TestStep).filter_by(id=row.test_step_id).first()
            if not case or not step or case.test_id != step.test_id:
                raise HTTPException(404, "Test not found")
            require_test(db, user, case.test_id, write=True)


def require_attachment_entity(db, user, entity_type, entity_id, write=False):
    if entity_type == "test":
        return require_test(db, user, entity_id, write=write)
    model = m.TestStep if entity_type == "step" else m.RunCase if entity_type == "run_case" else None
    row = db.query(model).filter_by(id=entity_id).first() if model else None
    if not row:
        raise HTTPException(404, "Test not found")
    return require_test(db, user, row.test_id, write=write)


def can_read_link(db, user, link):
    if not user or user.account_status != "active":
        return False
    if user.role == "admin":
        return True
    if (link or "").startswith("#/tests/"):
        test = db.query(m.Test).filter_by(id=link[8:]).first()
        return bool(test and permission(db, user, test.project_id))
    if (link or "").startswith("#/runs/"):
        cases = m.RunCase.__table__
        ids = db.connection().execute(select(cases.c.test_id).where(cases.c.run_id == link[7:])).scalars().all()
        return bool(ids) and all(can_read_link(db, user, "#/tests/" + tid) for tid in ids)
    if (link or "").startswith("#/defects/"):
        defect = db.query(m.Defect).filter_by(id=link[10:]).first()
        return bool(defect and defect.test_id and can_read_link(db, user, "#/tests/" + defect.test_id))
    if (link or "").startswith("#/requirements/"):
        links = m.requirement_tests
        ids = db.connection().execute(select(links.c.test_id).where(links.c.requirement_id == link[15:])).scalars().all()
        return bool(ids) and all(can_read_link(db, user, "#/tests/" + tid) for tid in ids)
    return False
