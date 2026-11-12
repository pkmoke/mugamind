import secrets
import time
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from pwdlib import PasswordHash
from sqlalchemy import select, delete, func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.pengguna import Pengguna
from app.models.security import Sesi, KontrolAkun, Batas
from app.dependencies import get_current_user
from app.security import digest, limit, audit
from app.config import COOKIE, PRODUCTION, HTTPS_ONLY, SESSION_SECONDS, ENABLE_STUDENT_DEMO_LOGIN
from app.access import tugas

router = APIRouter(prefix="/api/auth", tags=["Auth"])
password_hash = PasswordHash.recommended()
DUMMY_HASH = password_hash.hash(secrets.token_urlsafe(32))


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    identitas: str = Field(min_length=1, max_length=255)
    kataSandi: str = Field(min_length=1, max_length=256)


class TrialLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    nama: str = Field(min_length=2, max_length=100)
    tingkat: str = Field(pattern=r"^(VII|VIII|IX)$")
    rombel: str = Field(pattern=r"^[A-F]$")


def user_dict(db, p):
    return {
        "id": str(p.id),
        "nama": p.nama,
        "peran": p.peran,
        "tingkat": p.tingkat,
        "rombel": p.rombel,
        "wajibGantiSandi": bool(
            (control := db.get(KontrolAkun, p.id)) and control.wajib_ganti_sandi
        ),
        "penugasan": [
            {"mapel": x.mapel, "tingkat": x.tingkat, "rombel": x.rombel}
            for x in tugas(db, p)
        ]
        if p.peran == "guru"
        else [],
    }


@router.post("/login")
def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    identitas = data.identitas.strip()
    # Satu sekolah bisa keluar dari satu IP publik; batas per akun tetap 8.
    limit("login-ip:" + (request.client.host if request.client else "unknown"), 400, 900)
    p = db.scalar(
        select(Pengguna).where(
            (func.lower(Pengguna.email) == identitas.lower()) | (Pengguna.nis == identitas)
        )
    )
    account_key = str(p.id) if p else identitas.casefold()
    try:
        valid = password_hash.verify(data.kataSandi, p.kata_sandi if p else DUMMY_HASH)
    except Exception:
        valid = False
    if (
        not p
        or not valid
        or p.peran not in ("siswa", "guru", "admin")
        or ((control := db.get(KontrolAkun, p.id)) and not control.aktif)
    ):
        limit("login-account:" + account_key, 8, 900)
        audit("login_failed", request_id=request.state.request_id)
        raise HTTPException(401, "Identitas atau kata sandi salah")
    if (
        p.peran == "guru"
        and not tugas(db, p)
        and not (control and control.wajib_ganti_sandi)
    ):
        audit("login_unassigned", actor=p.id)
        raise HTTPException(
            403, "Penugasan mengajar belum diatur oleh pengelola sekolah"
        )
    # Clear failed attempt counter on successful login so legitimate users are never locked out
    db.execute(delete(Batas).where(Batas.key == digest("login-account:" + account_key)))
    old = request.cookies.get(COOKIE)
    if old:
        db.execute(delete(Sesi).where(Sesi.token_hash == digest(old)))
    ttl = 3600 if p.peran == "admin" else SESSION_SECONDS
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    db.add(
        Sesi(
            token_hash=digest(token),
            pengguna_id=p.id,
            csrf=csrf,
            expires=int(time.time()) + ttl,
        )
    )
    db.commit()
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=(PRODUCTION or HTTPS_ONLY),
        samesite="lax",
        max_age=ttl,
        path="/",
    )
    audit("login_success", actor=p.id, request_id=request.state.request_id)
    return {"pengguna": user_dict(db, p), "csrfToken": csrf}



@router.post("/login-uji-coba")
def login_uji_coba(
    data: TrialLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    if not ENABLE_STUDENT_DEMO_LOGIN:
        raise HTTPException(404, "Login uji coba sedang dinonaktifkan")
    ip = request.client.host if request.client else "unknown"
    limit("trial-login-ip:" + ip, 30, 3600)
    now = int(time.time())
    name = " ".join(data.nama.split())
    if len(name) < 2:
        raise HTTPException(400, "Nama minimal 2 karakter")
    # Trial accounts are isolated to the selected class and expire automatically after 24 hours.
    p = Pengguna(
        nama=name,
        email=None,
        nis="uji-coba-" + secrets.token_urlsafe(18),
        kata_sandi=password_hash.hash(secrets.token_urlsafe(32)),
        peran="siswa",
        tingkat=data.tingkat,
        rombel=data.rombel,
        uji_coba_sampai=now + 86400,
    )
    db.add(p)
    db.flush()
    old = request.cookies.get(COOKIE)
    if old:
        db.execute(delete(Sesi).where(Sesi.token_hash == digest(old)))
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    ttl = min(SESSION_SECONDS, 86400)
    db.add(Sesi(token_hash=digest(token), pengguna_id=p.id, csrf=csrf, expires=now + ttl))
    db.commit()
    response.set_cookie(
        COOKIE, token, httponly=True, secure=(PRODUCTION or HTTPS_ONLY),
        samesite="lax", max_age=ttl, path="/",
    )
    audit("trial_student_login", actor=p.id)
    return {"pengguna": user_dict(db, p), "csrfToken": csrf}

@router.get("/saya")
def saya(
    request: Request, user=Depends(get_current_user), db: Session = Depends(get_db)
):
    return {"pengguna": user_dict(db, user), "csrfToken": request.state.sesi.csrf}


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.delete(request.state.sesi)
    db.commit()
    response.delete_cookie(
        COOKIE,
        path="/",
        secure=(PRODUCTION or HTTPS_ONLY),
        httponly=True,
        samesite="lax",
    )
    audit("logout", actor=user.id)


class Sandi(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lama: str = Field(min_length=1, max_length=256)
    baru: str = Field(min_length=12, max_length=256)


@router.post("/sandi", status_code=204)
def sandi(data: Sandi, user=Depends(get_current_user), db: Session = Depends(get_db)):
    limit(f"password:{user.id}", 5, 900)
    if not password_hash.verify(data.lama, user.kata_sandi):
        raise HTTPException(400, "Kata sandi lama tidak cocok")
    if data.baru == data.lama:
        raise HTTPException(400, "Gunakan kata sandi baru yang berbeda")
    user.kata_sandi = password_hash.hash(data.baru)
    control = db.get(KontrolAkun, user.id)
    if control:
        control.wajib_ganti_sandi = False
    db.execute(delete(Sesi).where(Sesi.pengguna_id == user.id))
    db.commit()
    audit("password_changed_sessions_revoked", actor=user.id)
