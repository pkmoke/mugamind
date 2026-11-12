"""Pemberitahuan materi baru untuk siswa (tanpa push, dihitung dari waktu buka terakhir)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import allowed
from app.database import get_db
from app.dependencies import require_pembelajaran
from app.models.materi import Materi

router = APIRouter(prefix="/api", tags=["Notifikasi"])


def _daftar(db, user):
    query = select(Materi).order_by(Materi.id.desc())
    if user.peran == "siswa":
        query = query.where(Materi.tingkat == user.tingkat)
    elif user.peran != "guru":
        return []
    batas = getattr(user, "materi_dilihat", None)
    if batas is not None and batas.tzinfo is None:
        batas = batas.replace(tzinfo=timezone.utc)
    hasil = []
    for m in db.scalars(query).yield_per(100):
        if not allowed(db, user, m):
            continue
        dibuat = m.dibuat_pada
        if dibuat is not None and dibuat.tzinfo is None:
            dibuat = dibuat.replace(tzinfo=timezone.utc)
        if batas is not None and (dibuat is None or dibuat <= batas):
            continue
        hasil.append({"id": str(m.id), "judul": m.judul, "mapel": m.mapel})
    return hasil


@router.get("/notifikasi")
def notifikasi(user=Depends(require_pembelajaran), db: Session = Depends(get_db)):
    if user.peran != "siswa":
        return {"baru": 0, "daftar": []}
    daftar = _daftar(db, user)
    return {"baru": len(daftar), "daftar": daftar[:5]}


@router.post("/notifikasi/dibaca", status_code=204)
def tandai(user=Depends(require_pembelajaran), db: Session = Depends(get_db)):
    if user.peran == "siswa":
        user.materi_dilihat = datetime.now(timezone.utc)
        db.commit()
