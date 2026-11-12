"""School administration. No learning-data access or web administrator elevation."""

import time
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, delete, func, or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import require_admin
from app.models.pengguna import Pengguna
from app.models.security import KontrolAkun, AuditAdmin, Penugasan, Sesi
from app.routers.auth import password_hash
from app.security import limit, audit

router = APIRouter(prefix="/api/admin", tags=["Administrator"])


class Confirm(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)
    adminPassword: str = Field(min_length=1, max_length=256, repr=False)


class Akun(Confirm):
    nama: str = Field(min_length=1, max_length=150)
    email: str = Field(
        min_length=3, max_length=255, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    )
    peran: Literal["siswa", "guru"]
    tingkat: Literal["VII", "VIII", "IX"] | None = None
    rombel: Literal["A", "B", "C", "D", "E", "F"] | None = None
    aktif: bool = Field(default=True, strict=True)

    @model_validator(mode="after")
    def check(self):
        self.nama = self.nama.strip()
        self.email = self.email.strip().lower()
        if not self.nama or (
            self.peran == "siswa" and not (self.tingkat and self.rombel)
        ):
            raise ValueError("Siswa wajib memiliki kelas")
        if self.peran == "guru":
            self.tingkat = self.rombel = None
        return self


class BuatAkun(Akun):
    password: str = Field(min_length=12, max_length=256, repr=False)


class Reset(Confirm):
    password: str = Field(min_length=12, max_length=256, repr=False)


class Tugas(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    mapel: str = Field(min_length=1, max_length=100)
    tingkat: Literal["VII", "VIII", "IX"]
    rombel: Literal["A", "B", "C", "D", "E", "F"]


class PenugasanRequest(Confirm):
    penugasan: list[Tugas] = Field(max_length=60)

    @model_validator(mode="after")
    def unique(self):
        if len({(x.mapel, x.tingkat, x.rombel) for x in self.penugasan}) != len(
            self.penugasan
        ):
            raise ValueError("Penugasan duplikat")
        return self


def confirm(db, user, data):
    limit(f"admin-confirm:{user.id}", 20, 900)
    if not password_hash.verify(data.adminPassword, user.kata_sandi):
        audit("admin_reauth_failed", actor=user.id)
        raise HTTPException(403, "Konfirmasi kata sandi admin tidak cocok")


def target(db, uid):
    u = db.get(Pengguna, uid)
    if not u:
        raise HTTPException(404, "Akun tidak ditemukan")
    if u.peran == "admin":
        raise HTTPException(403, "Akun administrator dikelola melalui operator server")
    return u


def control(db, u):
    c = db.get(KontrolAkun, u.id)
    if c is None:
        c = KontrolAkun(pengguna_id=u.id, aktif=True, wajib_ganti_sandi=False)
        db.add(c)
    return c


def finish(db, user, u, action):
    db.execute(delete(Sesi).where(Sesi.pengguna_id == u.id))
    db.add(
        AuditAdmin(
            actor_id=user.id, target_id=u.id, aksi=action, dibuat=int(time.time())
        )
    )
    db.commit()
    audit(action, actor=user.id, target=u.id)


def serialize(db, u):
    c = db.get(KontrolAkun, u.id)
    return dict(
        id=str(u.id),
        nama=u.nama,
        email=u.email,
        peran=u.peran,
        tingkat=u.tingkat,
        rombel=u.rombel,
        aktif=c.aktif if c else True,
        wajibGantiSandi=c.wajib_ganti_sandi if c else False,
        penugasan=[
            dict(mapel=t.mapel, tingkat=t.tingkat, rombel=t.rombel)
            for t in db.scalars(select(Penugasan).where(Penugasan.guru_id == u.id))
        ]
        if u.peran == "guru"
        else [],
    )


def unique_email(db, email, uid=0):
    if db.scalar(
        select(Pengguna.id).where(
            Pengguna.id != uid,
            or_(func.lower(Pengguna.email) == email, Pengguna.nis == email),
        )
    ):
        raise HTTPException(409, "Identitas sudah digunakan")


@router.get("/akun")
def daftar(
    user=Depends(require_admin),
    db: Session = Depends(get_db),
    q: str = Query(default="", max_length=150),
    peran: Literal["siswa", "guru", "admin"] | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
):
    query = select(Pengguna).where(Pengguna.uji_coba_sampai.is_(None))
    if q.strip():
        query = query.where(
            or_(
                Pengguna.nama.contains(q.strip(), autoescape=True),
                Pengguna.email.contains(q.strip(), autoescape=True),
            )
        )
    if peran:
        query = query.where(Pengguna.peran == peran)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    users = db.scalars(
        query.order_by(Pengguna.nama, Pengguna.id).offset(offset).limit(limit)
    )
    return {"items": [serialize(db, u) for u in users], "total": total}


@router.get("/ringkasan")
def ringkasan(user=Depends(require_admin), db: Session = Depends(get_db)):
    counts = dict(
        db.execute(
            select(Pengguna.peran, func.count())
            .where(Pengguna.uji_coba_sampai.is_(None))
            .group_by(Pengguna.peran)
        ).all()
    )
    return {
        "siswa": counts.get("siswa", 0),
        "guru": counts.get("guru", 0),
        "admin": counts.get("admin", 0),
        "nonaktif": db.scalar(
            select(func.count())
            .select_from(KontrolAkun)
            .where(KontrolAkun.aktif.is_(False))
        ),
        "tanpaPenugasan": db.scalar(
            select(func.count())
            .select_from(Pengguna)
            .where(
                Pengguna.peran == "guru",
                ~select(Penugasan.id).where(Penugasan.guru_id == Pengguna.id).exists(),
            )
        ),
    }


@router.post("/akun", status_code=201)
def buat(data: BuatAkun, user=Depends(require_admin), db: Session = Depends(get_db)):
    confirm(db, user, data)
    unique_email(db, data.email)
    u = Pengguna(
        nama=data.nama,
        email=data.email,
        peran=data.peran,
        tingkat=data.tingkat,
        rombel=data.rombel,
        kata_sandi=password_hash.hash(data.password),
    )
    db.add(u)
    db.flush()
    c = control(db, u)
    c.aktif = data.aktif
    c.wajib_ganti_sandi = True
    finish(db, user, u, "admin_account_created")
    return serialize(db, u)


@router.put("/akun/{uid}")
def ubah(
    uid: int, data: Akun, user=Depends(require_admin), db: Session = Depends(get_db)
):
    confirm(db, user, data)
    u = target(db, uid)
    unique_email(db, data.email, u.id)
    if u.peran != data.peran:
        db.execute(delete(Penugasan).where(Penugasan.guru_id == u.id))
    for key in ("nama", "email", "peran", "tingkat", "rombel"):
        setattr(u, key, getattr(data, key))
    control(db, u).aktif = data.aktif
    finish(db, user, u, "admin_account_updated")
    return serialize(db, u)


@router.post("/akun/{uid}/reset-sandi", status_code=204)
def reset(
    uid: int, data: Reset, user=Depends(require_admin), db: Session = Depends(get_db)
):
    confirm(db, user, data)
    u = target(db, uid)
    if password_hash.verify(data.password, u.kata_sandi):
        raise HTTPException(400, "Gunakan kata sandi sementara yang berbeda")
    u.kata_sandi = password_hash.hash(data.password)
    control(db, u).wajib_ganti_sandi = True
    finish(db, user, u, "admin_password_reset")


@router.put("/akun/{uid}/penugasan")
def penugasan(
    uid: int,
    data: PenugasanRequest,
    user=Depends(require_admin),
    db: Session = Depends(get_db),
):
    confirm(db, user, data)
    u = target(db, uid)
    if u.peran != "guru":
        raise HTTPException(400, "Penugasan hanya untuk guru")
    db.execute(delete(Penugasan).where(Penugasan.guru_id == u.id))
    for t in data.penugasan:
        db.add(Penugasan(guru_id=u.id, **t.model_dump()))
    finish(db, user, u, "admin_assignments_updated")
    return serialize(db, u)


@router.get("/audit")
def logs(
    user=Depends(require_admin),
    db: Session = Depends(get_db),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
):
    items = db.scalars(
        select(AuditAdmin).order_by(AuditAdmin.id.desc()).offset(offset).limit(limit)
    )
    return {
        "items": [
            dict(
                id=str(x.id),
                actor=str(x.actor_id),
                target=str(x.target_id),
                aksi=x.aksi,
                waktu=x.dibuat * 1000,
            )
            for x in items
        ],
        "total": db.scalar(select(func.count()).select_from(AuditAdmin)),
    }
