import time
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.soal import Soal
from app.models.pengguna import Pengguna
from app.models.security import Percobaan
from app.dependencies import require_pembelajaran, require_siswa, get_current_user
from app.schemas.latihan import MulaiLatihan, LatihanRequest
from app.access import materi_akses, soal_dict, scopes
from app.security import audit, limit

router = APIRouter(prefix="/api/latihan", tags=["Latihan"])


@router.post("/mulai")
def mulai(
    data: MulaiLatihan, user=Depends(require_siswa), db: Session = Depends(get_db)
):
    limit(f"attempt:{user.id}", 10, 3600)
    m = materi_akses(db, user, data.materiId)
    kelas = f"{user.tingkat} {user.rombel}"
    sudah_selesai = db.scalar(
        select(Percobaan)
        .where(
            Percobaan.pengguna_id == user.id,
            Percobaan.materi_id == m.id,
            Percobaan.selesai.is_not(None),
        )
        .limit(1)
    )
    if sudah_selesai:
        nilai = sudah_selesai.hasil.get("nilai", 0) if isinstance(sudah_selesai.hasil, dict) else 0
        raise HTTPException(
            400,
            f"Latihan materi '{m.judul}' sudah pernah dikerjakan (Nilai: {nilai}/100). Latihan hanya dapat dikerjakan 1 kali.",
        )
    questions = [
        s
        for s in db.scalars(
            select(Soal).where(Soal.materi_id == m.id).order_by(Soal.id)
        )
        if kelas in s.kelas
    ]
    if not questions:
        raise HTTPException(400, "Belum ada soal untuk kelas Anda")
    if len(questions) > 50:
        raise HTTPException(
            400,
            "Paket melebihi 50 soal; guru perlu membaginya menjadi beberapa materi",
        )
    snapshot = [soal_dict(s, True) for s in questions]
    now = int(time.time())
    p = Percobaan(
        id=uuid.uuid4().hex,
        pengguna_id=user.id,
        materi_id=m.id,
        mapel=m.mapel,
        kelas=kelas,
        judul=m.judul,
        snapshot=snapshot,
        dibuat=now,
        expires=now + 3600,
    )
    db.add(p)
    db.commit()
    audit("attempt_started", actor=user.id, target=p.id)
    return {
        "percobaanId": p.id,
        "expires": p.expires,
        "soal": [
            {
                k: v
                for k, v in x.items()
                if k not in ("jawaban", "pembahasan", "kunciEssay")
            }
            for x in snapshot
        ],
    }


@router.post("")
def kumpul(
    data: LatihanRequest, user=Depends(require_siswa), db: Session = Depends(get_db)
):
    p = db.get(Percobaan, data.percobaanId)
    if not p or p.pengguna_id != user.id:
        raise HTTPException(404, "Percobaan tidak ditemukan")
    if p.kelas != f"{user.tingkat} {user.rombel}":
        raise HTTPException(403, "Kelas akun telah berubah")
    materi_akses(db, user, p.materi_id)
    if p.selesai is not None:
        return p.hasil
    if p.expires <= int(time.time()):
        raise HTTPException(409, "Waktu latihan berakhir; mulai kembali")
    mapping = {int(s["id"]): s for s in p.snapshot}
    if {x.soalId for x in data.jawaban} != set(mapping):
        raise HTTPException(400, "Jawaban harus mencakup seluruh paket soal")
    detail = []
    for item in data.jawaban:
        s = mapping[item.soalId]
        tipe = s.get("tipe", "pilihan_ganda")
        if tipe == "essay":
            teks_jawab = (item.jawabanTeks or "").strip()
            kunci = s.get("kunci_essay") or s.get("pembahasan", "")
            detail.append(
                {
                    "soalId": str(item.soalId),
                    "tipe": "essay",
                    "jawab": -1,
                    "jawabTeks": teks_jawab,
                    "benar": None,
                    "menungguPenilaian": True,
                    "kunci": kunci,
                    "tanya": s["tanya"],
                    "gambar": s.get("gambar"),
                    "opsi": [],
                    "pembahasan": s.get("pembahasan", "") or kunci,
                }
            )
        else:
            if item.pilihan >= len(s["opsi"]):
                raise HTTPException(400, "Pilihan jawaban tidak valid")
            detail.append(
                {
                    "soalId": str(item.soalId),
                    "tipe": "pilihan_ganda",
                    "jawab": item.pilihan,
                    "jawabTeks": (
                        s["opsi"][item.pilihan]
                        if 0 <= item.pilihan < len(s["opsi"])
                        else ""
                    ),
                    "benar": item.pilihan == s["jawaban"],
                    "kunci": s["jawaban"],
                    "tanya": s["tanya"],
                    "gambar": s.get("gambar"),
                    "opsi": s["opsi"],
                    "pembahasan": s.get("pembahasan", ""),
                }
            )
    benar = sum(1 for x in detail if x.get("benar") is True)
    total_dinilai = sum(1 for x in detail if x.get("tipe") != "essay")
    menunggu_penilaian = sum(1 for x in detail if x.get("tipe") == "essay")
    now = int(time.time())
    result = {
        "id": p.id,
        "materiId": str(p.materi_id),
        "judul": p.judul,
        "kelas": p.kelas,
        "waktu": now * 1000,
        # Esai yang belum dinilai berarti nilai belum final: tampilkan
        # "menunggu penilaian" dulu, bukan angka yang menyesatkan.
        "nilai": (
            None
            if menunggu_penilaian
            else (round(benar / total_dinilai * 100, 2) if total_dinilai else None)
        ),
        "benar": benar,
        "total": len(mapping),
        "totalDinilai": total_dinilai,
        "menungguPenilaian": menunggu_penilaian,
        "detail": detail,
    }
    # Compare-and-swap ensures concurrent submissions cannot overwrite an accepted result.
    changed = db.execute(
        update(Percobaan)
        .where(Percobaan.id == p.id, Percobaan.selesai.is_(None))
        .values(hasil=result, selesai=now)
    )
    db.commit()
    if not changed.rowcount:
        db.expire_all()
        return db.get(Percobaan, p.id).hasil
    audit("attempt_completed", actor=user.id, target=p.id)
    return result


@router.get("/riwayat")
def riwayat(
    user=Depends(require_pembelajaran),
    db: Session = Depends(get_db),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    q = (
        select(Percobaan, Pengguna.nama)
        .join(Pengguna, Percobaan.pengguna_id == Pengguna.id)
        .where(Percobaan.selesai.is_not(None))
        .order_by(Percobaan.selesai.desc(), Percobaan.id)
    )
    if user.peran == "siswa":
        q = q.where(Percobaan.pengguna_id == user.id)
    permitted = scopes(db, user) if user.peran == "guru" else None
    out = []
    for p, nama_siswa in db.execute(q).yield_per(100):
        if permitted is not None and (p.mapel, p.kelas) not in permitted:
            continue
        if offset:
            offset -= 1
            continue
        out.append({
            **p.hasil,
            "mapel": p.mapel,
            "namaSiswa": nama_siswa,
            "siswaId": str(p.pengguna_id),
            "waktu": p.hasil.get("waktu", p.selesai * 1000) if isinstance(p.hasil, dict) else p.selesai * 1000,
        })
        if len(out) >= limit:
            break
    return out
