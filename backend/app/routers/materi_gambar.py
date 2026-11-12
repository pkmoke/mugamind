"""Gambar pendukung materi: unggah (base64 terkompresi), keterangan otomatis, hapus."""

import base64
import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.access import materi_akses, materi_dict
from app.database import get_db
from app.dependencies import require_guru
from app.security import audit, limit
from app.services import ai

router = APIRouter(prefix="/api/materi", tags=["Gambar Materi"])

MAKS_GAMBAR = 8
MAKS_BYTE = 480_000
FOLDER = Path(
    os.environ.get("GAMBAR_MATERI_DIR")
    or Path(__file__).resolve().parents[3] / "frontend" / "assets" / "materi"
)
PREFIX_URL = "/assets/materi/"

POLA = re.compile(r"^data:image/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$")


class GambarMasuk(BaseModel):
    model_config = ConfigDict(extra="forbid")
    gambar: str = Field(min_length=80, max_length=900_000)
    keterangan: str = Field(default="", max_length=400)


def _entri(db, m, raw: bytes, ekst: str):
    folder = FOLDER / str(m.id)
    folder.mkdir(parents=True, exist_ok=True)
    nama = f"{uuid.uuid4().hex[:12]}.{ekst}"
    (folder / nama).write_bytes(raw)
    return {"id": uuid.uuid4().hex[:10], "url": f"/assets/materi/{m.id}/{nama}", "keterangan": ""}


@router.post("/{mid}/gambar")
def unggah(
    mid: int,
    data: GambarMasuk,
    user=Depends(require_guru),
    db: Session = Depends(get_db),
):
    limit(f"gambar:{user.id}", 30, 3600)
    m = materi_akses(db, user, mid)
    gambar = list(m.gambar or [])
    if len(gambar) >= MAKS_GAMBAR:
        raise HTTPException(400, f"Maksimal {MAKS_GAMBAR} gambar per materi")
    cocok = POLA.match(data.gambar.strip())
    if not cocok:
        raise HTTPException(400, "Format gambar harus PNG, JPG, atau WEBP")
    try:
        mentah = base64.b64decode(cocok.group(2), validate=False)
    except ValueError:
        raise HTTPException(400, "Gambar tidak bisa dibaca")
    if not mentah or len(mentah) > MAKS_BYTE:
        raise HTTPException(413, "Gambar terlalu besar; perbesar ulang di bawah 450 KB")
    ekst = {"jpg": "jpg", "jpeg": "jpg"}.get(cocok.group(1), cocok.group(1))

    entri = _entri(db, m, mentah, ekst)
    keterangan = data.keterangan.strip()
    if not keterangan:
        keterangan = ai.deskripsi_gambar("data:image/%s;base64,%s" % (cocok.group(1), cocok.group(2)))
    entri["keterangan"] = keterangan
    gambar.append(entri)
    m.gambar = gambar
    db.commit()
    audit("materi_image_added", actor=user.id, target=m.id)
    return entri


@router.put("/{mid}/gambar/{gid}")
def ubah_keterangan(
    mid: int,
    gid: str,
    data: GambarMasuk,
    user=Depends(require_guru),
    db: Session = Depends(get_db),
):
    m = materi_akses(db, user, mid)
    gambar = [dict(g) for g in (m.gambar or [])]
    for g in gambar:
        if g.get("id") == gid:
            g["keterangan"] = data.keterangan.strip()[:400]
            m.gambar = gambar
            db.commit()
            return g
    raise HTTPException(404, "Gambar tidak ditemukan")


@router.delete("/{mid}/gambar/{gid}", status_code=204)
def hapus(
    mid: int,
    gid: str,
    user=Depends(require_guru),
    db: Session = Depends(get_db),
):
    m = materi_akses(db, user, mid)
    sisa = []
    terhapus = None
    for g in m.gambar or []:
        if g.get("id") == gid:
            terhapus = g
        else:
            sisa.append(g)
    if terhapus is None:
        raise HTTPException(404, "Gambar tidak ditemukan")
    berkas = FOLDER / terhapus["url"].split(PREFIX_URL, 1)[-1]
    if berkas.is_file():
        berkas.unlink()
    m.gambar = sisa
    db.commit()
    audit("materi_image_removed", actor=user.id, target=m.id)
