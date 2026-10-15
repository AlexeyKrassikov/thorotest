from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..db import get_db
from .. import models
from ..schemas import FolderOut, FolderCreate, FolderUpdate
from ..auth_utils import require_role, get_current_user
from ..project_access import require_project_access, validate_folder

router = APIRouter(tags=["folders"])

WRITE_ROLES = Depends(get_current_user)
ADMIN_ONLY = Depends(get_current_user)


def _build_tree(folders: list, parent_id=None) -> list:
    result = []
    for f in folders:
        if f.parent_id == parent_id:
            children = _build_tree(folders, f.id)
            result.append(FolderOut(
                id=f.id, name=f.name, parent_id=f.parent_id,
                project_id=f.project_id, count=f.count, children=children,
            ))
    # Alphabetical (case-insensitive) at every level so the folder tree and every
    # folder picker render in a stable, predictable order.
    result.sort(key=lambda fo: fo.name.lower())
    return result


@router.get("/folders", response_model=List[FolderOut])
def get_folders(project_id: str | None = None, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    query = db.query(models.Folder)
    if project_id:
        require_project_access(db, _, project_id)
        query = query.filter_by(project_id=project_id)
    folders = query.all()
    return _build_tree(folders)


@router.post("/folders", response_model=FolderOut, status_code=201)
def create_folder(payload: FolderCreate, db: Session = Depends(get_db), _: models.User = WRITE_ROLES):
    payload.project_id = payload.project_id or db.info.get("active_project")
    validate_folder(db, _, payload.project_id, parent_id=payload.parent_id)
    if db.query(models.Folder).filter(models.Folder.id == payload.id).first():
        raise HTTPException(status_code=409, detail="Folder ID already exists")
    folder = models.Folder(
        id=payload.id,
        name=payload.name,
        parent_id=payload.parent_id,
        project_id=payload.project_id,
        count=0,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return FolderOut(
        id=folder.id, name=folder.name, parent_id=folder.parent_id,
        project_id=folder.project_id, count=folder.count, children=[],
    )


@router.patch("/folders/{folder_id}", response_model=FolderOut)
def update_folder(folder_id: str, payload: FolderUpdate, db: Session = Depends(get_db), _: models.User = WRITE_ROLES):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    require_project_access(db, _, folder.project_id, write=True)
    data = payload.model_dump(exclude_unset=True)
    if "project_id" in data and data["project_id"] != folder.project_id:
        raise HTTPException(422, "Cannot move folders between projects")
    validate_folder(db, _, folder.project_id, parent_id=data.get("parent_id"))
    parent = data.get("parent_id")
    seen = {folder_id}
    while parent:
        if parent in seen:
            raise HTTPException(422, "Folder hierarchy cannot contain cycles")
        seen.add(parent)
        ancestor = db.query(models.Folder).filter_by(id=parent).first()
        parent = ancestor.parent_id if ancestor else None
    for field, value in data.items():
        setattr(folder, field, value)
    db.commit()
    db.refresh(folder)
    return FolderOut(
        id=folder.id, name=folder.name, parent_id=folder.parent_id,
        project_id=folder.project_id, count=folder.count, children=[],
    )


@router.delete("/folders/{folder_id}", status_code=204)
def delete_folder(folder_id: str, db: Session = Depends(get_db), _: models.User = ADMIN_ONLY):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    require_project_access(db, _, folder.project_id, write=True)
    child_count = db.query(models.Folder).filter(models.Folder.parent_id == folder_id).count()
    test_count = db.query(models.Test).filter(models.Test.folder_id == folder_id).count()
    if child_count > 0 or test_count > 0:
        raise HTTPException(status_code=409, detail=f"Folder has {child_count} sub-folders and {test_count} tests — move or delete them first")
    db.delete(folder)
    db.commit()
