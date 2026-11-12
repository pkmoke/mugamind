import time
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import require_pembelajaran, require_siswa, get_current_user
from app.models.materi import Materi
from app.models.security import AktivitasBelajar, Percobaan
from app.access import allowed, materi_akses, scopes
from app.security import hitung, limit, sisa_hitung
from app.config import AI_KUOTA_HARIAN
from app.services.jawaban import pilih_jawaban, pilih_konteks, relevan
from app.services import ai
from datetime import datetime

router = APIRouter(prefix="/api", tags=["Belajar"])


class Chat(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pertanyaan: str = Field(min_length=3, max_length=2000)


@router.post("/chat")
def chat(data: Chat, user=Depends(require_siswa), db: Session = Depends(get_db)):
    limit(f"chat:{user.id}", 30, 60)
    materials = [
        m
        for m in db.scalars(
            select(Materi).where(Materi.tingkat == user.tingkat)
        ).yield_per(100)
        if allowed(db, user, m)
    ]
    kunci_kuota = f"ai:{user.id}:{datetime.now().strftime('%Y%m%d')}"
    sisa = sisa_hitung(kunci_kuota, AI_KUOTA_HARIAN)

    if not materials:
        return _simpan(db, user, None, data.pertanyaan, "Belum ada materi pembelajaran untuk kelas Anda.", "kosong", sisa)

    if sisa <= 0:
        return _simpan(
            db, user, None, data.pertanyaan,
            f"Jatah bertanya MugaMind hari ini sudah habis ({AI_KUOTA_HARIAN} pertanyaan). "
            "Kamu masih bisa membaca materi, dan besok bisa bertanya lagi.",
            "kuota habis", 0,
        )

    # Pertanyaan tanpa topik (mis. "halo") tidak dikirim ke AI supaya kuota tidak
    # terbuang. Selain itu semua pertanyaan belajar dijawab: materi kelas dipakai
    # sebagai rujukan utama, dan bila tidak memuat, AI melengkapi dari pengetahuan
    # umum dengan penanda "Di luar materi kelasmu".
    from app.services.jawaban import tokens

    if not tokens(data.pertanyaan):
        return _simpan(
            db, user, None, data.pertanyaan,
            "Sebutkan topiknya ya, misalnya: 'jelaskan hukum tertulis' atau "
            "'apa bedanya norma hukum dan kesopanan?'.",
            "belum ada topik", sisa,
        )

    material, cadangan = pilih_jawaban(data.pertanyaan, materials)

    jawaban, metode = None, ""
    if ai.tersedia():
        konteks = pilih_konteks(data.pertanyaan, materials)
        jawaban, token = ai.jawab(data.pertanyaan, konteks, user.tingkat)
        if jawaban:
            hitung(kunci_kuota, AI_KUOTA_HARIAN, 86400)
            sisa = max(0, sisa - 1)
            metode = f"AI {ai.nama_model()}"
            if token:
                from app.security import audit as _audit

                _audit("chat_ai", actor=user.id, target=token)

    if not jawaban:
        # Cadangan: mesin kutipan lama, supaya layanan tidak pernah mati.
        jawaban = cadangan
        metode = "kutipan materi"

    return _simpan(db, user, material, data.pertanyaan, jawaban, metode, sisa)


def _simpan(db, user, material, pertanyaan, jawaban, metode, sisa):
    db.add(
        AktivitasBelajar(
            pengguna_id=user.id,
            materi_id=material.id if material else None,
            mapel=material.mapel if material else "",
            kelas=f"{user.tingkat} {user.rombel}",
            jenis="Chat",
            judul=pertanyaan,
            hasil=jawaban,
            dibuat=int(time.time()),
        )
    )
    db.commit()
    source = (
        {"materiId": str(material.id), "judul": material.judul, "mapel": material.mapel}
        if material
        else None
    )
    return {
        "jawaban": jawaban,
        "sumber": source,
        "metode": metode,
        "sisaKuota": sisa,
        "kuotaHarian": AI_KUOTA_HARIAN,
    }


@router.post("/materi/{mid}/rangkuman")
def rangkuman(mid: int, user=Depends(require_siswa), db: Session = Depends(get_db)):
    m = materi_akses(db, user, mid)
    points = m.rangkuman or m.teks[:3]
    db.add(
        AktivitasBelajar(
            pengguna_id=user.id,
            materi_id=m.id,
            mapel=m.mapel,
            kelas=f"{user.tingkat} {user.rombel}",
            jenis="Rangkuman",
            judul=m.judul,
            hasil="\n".join(points),
            dibuat=int(time.time()),
        )
    )
    db.commit()
    return {"poin": points}


@router.get("/aktivitas")
def aktivitas(
    user=Depends(require_pembelajaran),
    db: Session = Depends(get_db),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    q = select(AktivitasBelajar).order_by(
        AktivitasBelajar.dibuat.desc(), AktivitasBelajar.id.desc()
    )
    if user.peran == "siswa":
        q = q.where(AktivitasBelajar.pengguna_id == user.id)
    permitted = scopes(db, user) if user.peran == "guru" else None
    out = []
    for a in db.scalars(q).yield_per(100):
        if permitted is not None and (a.mapel, a.kelas) not in permitted:
            continue
        if offset:
            offset -= 1
            continue
        out.append(
            {
                "id": str(a.id),
                "waktu": a.dibuat * 1000,
                "tipe": a.jenis,
                "judul": a.judul,
                "hasil": a.hasil,
                "kelas": a.kelas,
                "mapel": a.mapel,
                "materiId": str(a.materi_id) if a.materi_id else None,
            }
        )
        if len(out) >= limit:
            break
    return out
