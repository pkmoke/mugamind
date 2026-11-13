"""Impor massal siswa dari CSV (nama;nis;kelas) dengan satu kata sandi sementara."""

import argparse
import csv
import pathlib
import re
import sys

from sqlalchemy import select

from app.database import SessionLocal
from app.models.pengguna import Pengguna
from app.models.security import KontrolAkun
from app.routers.auth import password_hash


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--file", required=True)
    p.add_argument("--sandi", required=True)
    p.add_argument("--kering", action="store_true")
    a = p.parse_args()

    jalur = pathlib.Path(a.file)
    if not jalur.exists():
        sys.exit(f"Berkas tidak ditemukan: {jalur}")
    if len(a.sandi) < 12:
        sys.exit("Kata sandi sementara minimal 12 karakter")

    baris = list(csv.reader(jalur.read_text(encoding="utf-8-sig").splitlines(), delimiter=";"))
    kepala = [h.strip().lower() for h in baris[0]]
    idx = {h: i for i, h in enumerate(kepala)}
    if not {"nama", "nis", "kelas"}.issubset(idx):
        sys.exit("Kolom wajib: nama;nis;kelas")

    dibuat = dilewati = 0
    kelas_terpakai = {}
    with SessionLocal() as db:
        for isi in baris[1:]:
            if not any(x.strip() for x in isi):
                continue
            nama = isi[idx["nama"]].strip()
            nis = isi[idx["nis"]].strip()
            kelas = isi[idx["kelas"]].strip().upper()
            cocok = re.fullmatch(r"(VII|VIII|IX)\s*([A-F])", kelas)
            if not cocok or not nama or not nis:
                dilewati += 1
                continue
            if db.scalar(select(Pengguna.id).where(Pengguna.nis == nis)):
                dilewati += 1
                continue
            u = Pengguna(
                nama=nama,
                email=None,
                nis=nis,
                kata_sandi=password_hash.hash(a.sandi),
                peran="siswa",
                tingkat=cocok.group(1),
                rombel=cocok.group(2),
            )
            db.add(u)
            db.flush()
            db.add(KontrolAkun(pengguna_id=u.id, aktif=True, wajib_ganti_sandi=True))
            dibuat += 1
            kunci = f"{cocok.group(1)} {cocok.group(2)}"
            kelas_terpakai[kunci] = kelas_terpakai.get(kunci, 0) + 1
        if a.kering:
            db.rollback()
            print(f"[kering] akan dibuat {dibuat}, dilewati {dilewati}")
        else:
            db.commit()
            print(f"Selesai: {dibuat} akun siswa dibuat, {dilewati} dilewati.")
        for k in sorted(kelas_terpakai, key=lambda x: (x.split()[0], x.split()[1])):
            print(f"  {k}: {kelas_terpakai[k]}")


if __name__ == "__main__":
    main()
