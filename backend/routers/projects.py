from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List

from ..db import get_db
from .. import models
from ..schemas import ProjectOut, ProjectCreate, ProjectUpdate
from ..auth_utils import require_role, get_current_user
from ..project_access import require_project_access, permission
from pydantic import BaseModel
from typing import Literal

router = APIRouter(tags=["projects"])

ADMIN_ONLY = require_role("admin")


@router.get("/projects", response_model=List[ProjectOut])
def list_projects(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    projects = db.query(models.Project).all()
    for project in projects:
        project.permission = permission(db, _, project.id)
    return projects


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db), _: models.User = ADMIN_ONLY):
    if db.query(models.Project).filter(models.Project.id == payload.id).first():
        raise HTTPException(status_code=409, detail="Project ID already exists")
    project = models.Project(**payload.model_dump())
    db.add(project)
    db.flush()
    db.add(models.ProjectMember(project_id=project.id, user_id=_.id, role="owner"))
    db.commit()
    db.refresh(project)
    project.permission = permission(db, _, project.id)
    return project


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: str, payload: ProjectUpdate, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    require_project_access(db, _, project_id, manage=True)
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    project.permission = permission(db, _, project.id)
    return project


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: str, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    require_project_access(db, _, project_id, manage=True)
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Project deletion must inspect the target, not the UI's active-project filter.
    for model in (models.Test, models.Folder):
        table = model.__table__
        if db.connection().execute(select(table.c.id).where(table.c.project_id == project_id).limit(1)).first():
            raise HTTPException(409, "Project is not empty")
    db.query(models.ProjectMember).filter_by(project_id=project_id).delete()
    db.delete(project)
    db.commit()


class MemberInput(BaseModel):
    role: Literal["owner", "editor", "viewer"]


@router.get("/projects/{project_id}/members")
def members(project_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    require_project_access(db, user, project_id, manage=True)
    rows = db.query(models.ProjectMember, models.User).join(models.User).filter(models.ProjectMember.project_id == project_id).all()
    return [{"user_id": u.id, "username": u.username, "role": member.role} for member, u in rows]


@router.get("/projects/{project_id}/candidates")
def candidates(project_id: str, search: str = "", db: Session = Depends(get_db), user=Depends(get_current_user)):
    require_project_access(db, user, project_id, manage=True)
    rows = db.query(models.User).filter(models.User.account_status == "active", models.User.username.ilike(f"%{search}%")).order_by(models.User.username).limit(50).all()
    return [{"id": u.id, "username": u.username} for u in rows]


def check_last_owner(db, project_id, member, new_role):
    if member and member.role == "owner" and new_role != "owner":
        if db.query(models.ProjectMember).filter_by(project_id=project_id, role="owner").count() <= 1:
            raise HTTPException(409, "Keep at least one project owner")


@router.put("/projects/{project_id}/members/{user_id}")
def set_member(project_id: str, user_id: int, payload: MemberInput, db: Session = Depends(get_db), user=Depends(get_current_user)):
    require_project_access(db, user, project_id, manage=True)
    db.query(models.Project).filter_by(id=project_id).with_for_update().one()
    target = db.query(models.User).filter_by(id=user_id, account_status="active").first()
    if not target:
        raise HTTPException(404, "User not found")
    member = db.get(models.ProjectMember, (project_id, user_id))
    check_last_owner(db, project_id, member, payload.role)
    if not member:
        member = models.ProjectMember(project_id=project_id, user_id=user_id)
        db.add(member)
    member.role = payload.role
    db.commit()
    return {"user_id": user_id, "username": target.username, "role": payload.role}


@router.delete("/projects/{project_id}/members/{user_id}", status_code=204)
def remove_member(project_id: str, user_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    require_project_access(db, user, project_id, manage=True)
    db.query(models.Project).filter_by(id=project_id).with_for_update().one()
    member = db.get(models.ProjectMember, (project_id, user_id))
    check_last_owner(db, project_id, member, None)
    if member:
        db.delete(member)
        db.commit()
