import hashlib
import json
import logging
import secrets
import time
from fastapi import HTTPException, Request
from sqlalchemy import select, case
from app.database import SessionLocal
from app.models.security import Batas

log = logging.getLogger("bemai.security")


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def audit(event, actor=None, target=None, request_id=None):
    # Never include password, session token, CSRF, or request body.
    log.warning(
        json.dumps(
            {
                "event": event,
                "actor": actor,
                "target": target,
                "request_id": request_id,
            },
            ensure_ascii=False,
        )
    )


def limit(key, maximum, seconds):
    now = int(time.time())
    hashed = digest(key)
    with SessionLocal() as db:
        # Atomic upsert: counters are shared by all workers and survive restarts.
        if db.bind.dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import insert
        else:
            from sqlalchemy.dialects.sqlite import insert
        q = insert(Batas).values(key=hashed, hits=1, expires=now + seconds)
        q = q.on_conflict_do_update(
            index_elements=[Batas.key],
            set_={
                "hits": case((Batas.expires <= now, 1), else_=Batas.hits + 1),
                "expires": case(
                    (Batas.expires <= now, now + seconds), else_=Batas.expires
                ),
            },
        ).returning(Batas.hits)
        hits = db.execute(q).scalar_one()
        db.commit()
    if hits > maximum:
        audit("rate_limit", target=hashed)
        raise HTTPException(
            429,
            "Terlalu banyak permintaan; coba lagi nanti",
            headers={"Retry-After": str(seconds)},
        )


def hitung(key, maximum, seconds):
    """Naikkan penghitung lalu kembalikan (hits, masih_diizinkan).

    Dipakai untuk kuota yang tidak boleh memutus permintaan (mis. jatah tanya
    AI): pemanggil memutuskan sendiri apa yang ditampilkan ke pengguna.
    """
    now = int(time.time())
    hashed = digest(key)
    with SessionLocal() as db:
        if db.bind.dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import insert
        else:
            from sqlalchemy.dialects.sqlite import insert
        q = insert(Batas).values(key=hashed, hits=1, expires=now + seconds)
        q = q.on_conflict_do_update(
            index_elements=[Batas.key],
            set_={
                "hits": case((Batas.expires <= now, 1), else_=Batas.hits + 1),
                "expires": case(
                    (Batas.expires <= now, now + seconds), else_=Batas.expires
                ),
            },
        ).returning(Batas.hits)
        hits = db.execute(q).scalar_one()
        db.commit()
    return hits, hits <= maximum


def sisa_hitung(key, maximum):
    """Sisa kuota tanpa menambah hitungan (untuk ditampilkan ke pengguna)."""
    from sqlalchemy import select

    hashed = digest(key)
    with SessionLocal() as db:
        row = db.get(Batas, hashed)
        if not row or row.expires <= int(time.time()):
            return maximum
        return max(0, maximum - row.hits)


def verify_csrf(request, sesi):
    value = request.headers.get("X-CSRF-Token", "")
    if not value or not secrets.compare_digest(value, sesi.csrf):
        raise HTTPException(403, "Token keamanan tidak valid; muat ulang halaman")
