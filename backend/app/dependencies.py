import time
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.config import COOKIE
from app.database import get_db
from app.models.pengguna import Pengguna
from app.models.security import Sesi, KontrolAkun
from app.security import digest, verify_csrf, audit, limit


def get_current_user(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE, "")
    sesi = db.get(Sesi, digest(token)) if token and len(token) <= 128 else None
    if not sesi or sesi.expires <= int(time.time()):
        raise HTTPException(401, "Sesi berakhir; silakan masuk kembali")
    user = db.get(Pengguna, sesi.pengguna_id)
    if not user or user.peran not in ("guru", "siswa", "admin"):
        raise HTTPException(401, "Akun tidak tersedia")
    if user.uji_coba_sampai is not None and user.uji_coba_sampai <= int(time.time()):
        raise HTTPException(401, "Masa akun uji coba telah berakhir")
    control = db.get(KontrolAkun, user.id)
    if control and not control.aktif:
        raise HTTPException(401, "Akun tidak tersedia")
    if (
        control
        and control.wajib_ganti_sandi
        and request.url.path
        not in ("/api/auth/saya", "/api/auth/sandi", "/api/auth/logout")
    ):
        raise HTTPException(403, "Ganti kata sandi sementara sebelum melanjutkan")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        verify_csrf(request, sesi)
        limit(f"write:{user.id}", 120, 60)
    request.state.sesi = sesi
    request.state.user_id = user.id
    return user


def require_guru(user: Pengguna = Depends(get_current_user)):
    if user.peran != "guru":
        audit("access_denied", actor=user.id)
        raise HTTPException(403, "Akses hanya untuk guru")
    return user


def require_siswa(user: Pengguna = Depends(get_current_user)):
    if user.peran != "siswa":
        raise HTTPException(403, "Akses hanya untuk siswa")
    return user


def require_admin(user: Pengguna = Depends(get_current_user)):
    if user.peran != "admin":
        audit("access_denied", actor=user.id)
        raise HTTPException(403, "Akses hanya untuk administrator")
    return user


def require_pembelajaran(user: Pengguna = Depends(get_current_user)):
    if user.peran not in ("siswa", "guru"):
        raise HTTPException(403, "Akun ini khusus pengelolaan sekolah")
    return user
