from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.materi import Materi
from app.models.soal import Soal
from app.dependencies import require_pembelajaran, get_current_user, require_guru
from app.schemas.materi import MateriCreate, MateriUpdate
from app.access import (
    allowed,
    materi_akses,
    cek_tujuan,
    kelas_materi,
    materi_dict,
    scopes,
)
from app.security import audit

router = APIRouter(prefix="/api/materi", tags=["Materi"])


@router.get("")
def daftar(
    user=Depends(require_pembelajaran),
    db: Session = Depends(get_db),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    query = select(Materi).order_by(Materi.id)
    if user.peran == "siswa":
        query = query.where(Materi.tingkat == user.tingkat)
    elif user.peran == "guru":
        user_scopes = scopes(db, user)
        mapels = {mapel for mapel, _ in user_scopes}
        tingkats = {k.split()[0] for _, k in user_scopes if len(k.split()) > 0}
        if mapels and tingkats:
            query = query.where(Materi.mapel.in_(mapels), Materi.tingkat.in_(tingkats))
        else:
            return []

    out = []
    for m in db.scalars(query).yield_per(100):
        if allowed(db, user, m):
            if offset:
                offset -= 1
            else:
                out.append(materi_dict(m))
            if len(out) >= limit:
                break
    return out


@router.get("/{mid}")
def detail(mid: int, user=Depends(require_pembelajaran), db: Session = Depends(get_db)):
    return materi_dict(materi_akses(db, user, mid))


@router.post("")
def tambah(
    data: MateriCreate, user=Depends(require_guru), db: Session = Depends(get_db)
):
    m = Materi(
        **data.model_dump(),
        dibuat_pada=datetime.now(timezone.utc),
        diubah_pada=datetime.now(timezone.utc),
    )
    cek_tujuan(db, user, m.mapel, kelas_materi(m))
    db.add(m)
    db.commit()
    db.refresh(m)
    audit("materi_created", actor=user.id, target=m.id)
    return materi_dict(m)


@router.put("/{mid}")
def ubah(
    mid: int,
    data: MateriUpdate,
    user=Depends(require_guru),
    db: Session = Depends(get_db),
):
    m = materi_akses(db, user, mid)
    candidate = Materi(**data.model_dump())
    cek_tujuan(db, user, candidate.mapel, kelas_materi(candidate))
    for key, value in data.model_dump().items():
        setattr(m, key, value)
    m.diubah_pada = datetime.now(timezone.utc)
    # Retarget linked questions atomically; no stale access to classes removed from lesson.
    for s in db.scalars(select(Soal).where(Soal.materi_id == m.id)):
        s.kelas = [k for k in s.kelas if k in kelas_materi(m)]
    db.commit()
    audit("materi_updated", actor=user.id, target=m.id)
    return materi_dict(m)


@router.delete("/{mid}", status_code=204)
def hapus(mid: int, user=Depends(require_guru), db: Session = Depends(get_db)):
    m = materi_akses(db, user, mid)
    # Explicit cleanup also supports old ORM definitions without relationship cascades.
    for s in db.scalars(select(Soal).where(Soal.materi_id == m.id)):
        db.delete(s)
    db.delete(m)
    db.commit()
    audit("materi_deleted", actor=user.id, target=mid)
