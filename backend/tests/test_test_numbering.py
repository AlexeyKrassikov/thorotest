import re

from backend import models


def create_auto(client, **extra):
    return client.post('/api/tests', json={'title': 'Numbered case', 'auto_id': True, **extra})


def test_auto_ids_start_at_one_and_increment(client):
    first = create_auto(client)
    second = create_auto(client)
    assert first.status_code == second.status_code == 201
    assert [first.json()['id'], second.json()['id']] == ['TC-1', 'TC-2']


def test_existing_numeric_ids_and_later_imports_are_respected(client, db):
    for identifier in ['TC-009', 'TC-42', 'TC-ABC', 'EXT-9000']:
        db.add(models.Test(id=identifier, title='Existing'))
    db.commit()
    assert create_auto(client).json()['id'] == 'TC-43'
    db.add(models.Test(id='TC-100', title='Imported later'))
    db.commit()
    assert create_auto(client).json()['id'] == 'TC-101'
    assert db.get(models.Test, 'TC-009').title == 'Existing'


def test_deleted_auto_id_is_not_reused(client):
    identifier = create_auto(client).json()['id']
    assert client.delete(f'/api/tests/{identifier}').status_code == 204
    assert create_auto(client).json()['id'] == 'TC-2'


def test_manual_and_legacy_random_modes_are_preserved(client):
    manual = client.post('/api/tests', json={'id': 'CUSTOM-7', 'title': 'Manual', 'auto_id': False})
    assert manual.status_code == 201
    assert manual.json()['id'] == 'CUSTOM-7'
    assert client.post('/api/tests', json={'id': 'CUSTOM-7', 'title': 'Duplicate'}).status_code == 409
    legacy = client.post('/api/tests', json={'title': 'Legacy client'})
    assert re.fullmatch(r'TC-[0-9A-F]{8}', legacy.json()['id'])


def test_explicit_id_and_auto_mode_are_rejected(client):
    assert create_auto(client, id='CUSTOM-8').status_code == 422


def test_viewer_cannot_allocate_numbers(auth_client):
    assert create_auto(auth_client('viewer')).status_code == 403


def test_failed_validation_does_not_create_a_case(client):
    response = client.post('/api/tests', json={'auto_id': True})
    assert response.status_code == 422
    assert create_auto(client).json()['id'] == 'TC-1'


def test_concurrent_allocations_are_unique_and_persisted(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from backend.db import Base
    from backend.test_numbering import next_test_id

    engine = create_engine(f'sqlite:///{tmp_path}/counter.db', connect_args={'timeout': 20})
    Base.metadata.create_all(engine)
    barrier = Barrier(6)

    def create(_):
        with Session(engine) as session:
            barrier.wait()
            identifier = next_test_id(session)
            session.add(models.Test(id=identifier, title='Concurrent'))
            session.commit()
            return identifier

    try:
        with ThreadPoolExecutor(max_workers=6) as pool:
            ids = list(pool.map(create, range(6)))
        assert set(ids) == {f'TC-{n}' for n in range(1, 7)}
        with Session(engine) as session:
            assert next_test_id(session) == 'TC-7'
    finally:
        engine.dispose()


def test_exhausted_counter_returns_readable_error(client, db):
    db.add(models.Test(id=f'TC-{2**63 - 1}', title='Limit'))
    db.commit()
    response = create_auto(client)
    assert response.status_code == 409
    assert response.json()['detail'] == 'Automatic test ID range exhausted'
