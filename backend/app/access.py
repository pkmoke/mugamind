from fastapi import HTTPException
from sqlalchemy import select
from app.models.security import Penugasan
from app.models.materi import Materi


def tugas(db, user):
    return db.scalars(select(Penugasan).where(Penugasan.guru_id == user.id)).all()


def scopes(db, user):
    key = ("scopes", user.id)
    if key not in db.info:
        db.info[key] = {(x.mapel, f"{x.tingkat} {x.rombel}") for x in tugas(db, user)}
    return db.info[key]


def kelas_materi(m):
    return [f"{m.tingkat} {r}" for r in (m.rombel or ["A", "B", "C", "D", "E", "F"])]


def allowed(db, user, m):
    if user.peran == "siswa":
        return f"{user.tingkat} {user.rombel}" in kelas_materi(m)
    permitted = scopes(db, user)
    # A shared lesson spanning unassigned classes is not mutable/readable by this teacher.
    return bool(kelas_materi(m)) and all(
        (m.mapel, k) in permitted for k in kelas_materi(m)
    )


def materi_akses(db, user, mid):
    m = db.get(Materi, mid)
    if not m or not allowed(db, user, m):
        raise HTTPException(404, "Materi tidak ditemukan dalam penugasan Anda")
    return m


def cek_tujuan(db, user, mapel, kelas):
    permitted = scopes(db, user)
    if not kelas or any((mapel, k) not in permitted for k in kelas):
        raise HTTPException(
            403, "Kelas dan mata pelajaran harus sesuai penugasan mengajar"
        )


def materi_dict(m):
    return {
        "id": str(m.id),
        "mapel": m.mapel,
        "tingkat": m.tingkat,
        "kelas": m.tingkat,
        "rombel": m.rombel,
        "judul": m.judul,
        "teks": m.teks,
        "rangkuman": m.rangkuman,
        "gambar": getattr(m, "gambar", None) or [],
        "dibuat": m.dibuat_pada.isoformat() if getattr(m, "dibuat_pada", None) else None,
    }


def soal_dict(s, guru=False):
    d = {
        "id": str(s.id),
        "materiId": str(s.materi_id),
        "topik": s.topik,
        "tipe": getattr(s, "tipe", "pilihan_ganda") or "pilihan_ganda",
        "tanya": s.tanya,
        "gambar": getattr(s, "gambar", None),
        "opsi": s.opsi or [],
        "kelas": s.kelas,
    }
    if guru:
        d["jawaban"] = s.jawaban
        d["pembahasan"] = s.pembahasan
        d["kunciEssay"] = getattr(s, "kunci_essay", "")
    return d
