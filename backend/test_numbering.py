"""Allocate sequential IDs in the same transaction as the new test."""
import re

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from .models import Test, TestIdCounter


def next_test_id(db):
    if db.scalar(select(TestIdCounter.id).where(TestIdCounter.id == 1)) is None:
        try:
            with db.begin_nested():
                db.add(TestIdCounter(id=1, last_value=0))
                db.flush()
        except IntegrityError:
            pass  # Another transaction initialized the singleton first.

    # An UPDATE locks the row on PostgreSQL and the writer on SQLite, even
    # before the first number is allocated. Keep this lock until case commit.
    db.execute(update(TestIdCounter).where(TestIdCounter.id == 1).values(
        last_value=TestIdCounter.last_value,
    ))
    highest = db.scalar(select(TestIdCounter.last_value).where(TestIdCounter.id == 1))
    # Imports and Git sync can supply IDs without going through this allocator.
    for identifier in db.scalars(select(Test.id).where(Test.id.like('TC-%'))):
        if re.fullmatch(r'TC-[0-9]+', identifier):
            highest = max(highest, int(identifier[3:]))
    if highest >= 2**63 - 1:
        raise HTTPException(409, 'Automatic test ID range exhausted')
    number = highest + 1
    db.execute(update(TestIdCounter).where(TestIdCounter.id == 1).values(last_value=number))
    return f'TC-{number}'
