"""Akun sementara untuk verifikasi tampilan admin/guru. Dipakai sekali, lalu dihapus."""

from sqlalchemy import select

from app.database import SessionLocal
from app.models.pengguna import Pengguna
from app.models.security import KontrolAkun, Penugasan
from app.routers.auth import password_hash

SANDI = "Verifikasi2627"

with SessionLocal() as db:
    for email, nama, peran, tugas in [
        ("verif.admin@uji.local", "Verif Admin", "admin", []),
        (
            "verif.guru@uji.local",
            "Verif Guru",
            "guru",
            [("IPA", "VIII", r) for r in "ABCD"],
        ),
    ]:
        u = db.scalar(select(Pengguna).where(Pengguna.email == email))
        if u is None:
            u = Pengguna(
                nama=nama,
                email=email,
                nis=None,
                kata_sandi=password_hash.hash(SANDI),
                peran=peran,
            )
            db.add(u)
            db.flush()
            db.add(KontrolAkun(pengguna_id=u.id, aktif=True, wajib_ganti_sandi=False))
        for mapel, tingkat, rombel in tugas:
            if not db.scalar(
                select(Penugasan.id).where(
                    Penugasan.guru_id == u.id,
                    Penugasan.tingkat == tingkat,
                    Penugasan.rombel == rombel,
                )
            ):
                db.add(
                    Penugasan(guru_id=u.id, mapel=mapel, tingkat=tingkat, rombel=rombel)
                )
    db.commit()
print("akun verifikasi siap")
