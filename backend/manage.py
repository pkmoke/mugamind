"""Operator CLI for migrations and administrator provisioning."""

import argparse
import getpass
import time
from sqlalchemy import select, delete, func, or_
from pwdlib import PasswordHash
from app.database import Base, engine, SessionLocal
from app.security import audit
from app.models.pengguna import Pengguna
from app.models.materi import Materi
from app.models.soal import Soal
from app.models.hasil import Hasil
from app.models.security import (
    Penugasan,
    Sesi,
    Batas,
    Percobaan,
    AktivitasBelajar,
    KontrolAkun,
    AuditAdmin,
)


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("init-db")
    sub.add_parser("purge")
    impor = sub.add_parser("import-siswa")
    impor.add_argument("--file", required=True, help="CSV: nama;nis;kelas;email (email opsional)")
    uji = sub.add_parser("reset-uji")
    uji.add_argument("--hari", type=int, default=7, help="hapus data yang dibuat N hari terakhir")
    uji.add_argument("--semua", action="store_true", help="hapus semua data belajar (akun tetap)")
    uji.add_argument("--ya", action="store_true", help="konfirmasi untuk --semua")
    uji.add_argument("--akun", default="", help="NIS/email akun uji yang ikut dihapus, pisahkan koma")
    backup = sub.add_parser("backup")
    backup.add_argument("--dir", default="backups")
    user = sub.add_parser("user")
    user.add_argument("--email", required=True)
    user.add_argument("--nama", required=True)
    user.add_argument("--peran", choices=["guru", "siswa", "admin"], required=True)
    user.add_argument("--tingkat", choices=["VII", "VIII", "IX"])
    user.add_argument("--rombel", choices=list("ABCDEF"))
    user.add_argument("--nis")
    grant = sub.add_parser("assign")
    grant.add_argument("--email", required=True)
    grant.add_argument("--mapel", required=True)
    grant.add_argument("--tingkat", choices=["VII", "VIII", "IX"], required=True)
    grant.add_argument("--rombel", choices=list("ABCDEF"), required=True)
    revoke = sub.add_parser("revoke")
    revoke.add_argument("--email", required=True)
    revoke.add_argument("--mapel", required=True)
    revoke.add_argument("--tingkat", required=True)
    revoke.add_argument("--rombel", required=True)
    reset = sub.add_parser("reset-password")
    reset.add_argument("--email", required=True)
    a = p.parse_args()
    if a.command == "init-db":
        Base.metadata.create_all(engine)
        from sqlalchemy import inspect, text

        cols = {c["name"] for c in inspect(engine).get_columns("soal")}
        with engine.begin() as conn:
            if "pembahasan" not in cols:
                conn.execute(
                    text("ALTER TABLE soal ADD COLUMN pembahasan TEXT NOT NULL DEFAULT ''")
                )
            if "tipe" not in cols:
                conn.execute(
                    text("ALTER TABLE soal ADD COLUMN tipe VARCHAR(20) NOT NULL DEFAULT 'pilihan_ganda'")
                )
            if "gambar" not in cols:
                conn.execute(
                    text("ALTER TABLE soal ADD COLUMN gambar TEXT NULL")
                )
            ucols = {c["name"] for c in inspect(engine).get_columns("pengguna")}
            if "materi_dilihat" not in ucols:
                conn.execute(text("ALTER TABLE pengguna ADD COLUMN materi_dilihat DATETIME NULL"))
            mcols = {c["name"] for c in inspect(engine).get_columns("materi")}
            if "gambar" not in mcols:
                conn.execute(
                    text(
                        "ALTER TABLE materi ADD COLUMN gambar JSON NOT NULL DEFAULT '[]'"
                    )
                )
            if "kunci_essay" not in cols:
                conn.execute(
                    text("ALTER TABLE soal ADD COLUMN kunci_essay TEXT NOT NULL DEFAULT ''")
                )
            user_cols = {c["name"] for c in inspect(engine).get_columns("pengguna")}
            if "uji_coba_sampai" not in user_cols:
                conn.execute(text("ALTER TABLE pengguna ADD COLUMN uji_coba_sampai BIGINT NULL"))
        print("Migrasi aditif selesai; data lama tidak dihapus.")
        return
    with SessionLocal() as db:
        if a.command == "import-siswa":
            import csv
            import pathlib
            import secrets
            import re

            jalur = pathlib.Path(a.file)
            if not jalur.exists():
                p.error(f"Berkas tidak ditemukan: {jalur}")
            teks = jalur.read_text(encoding="utf-8-sig")
            baris = list(csv.reader(teks.splitlines(), delimiter=";" if ";" in teks.splitlines()[0] else ","))
            kepala = [h.strip().lower() for h in baris[0]]
            wajib = {"nama", "nis", "kelas"}
            if not wajib.issubset(set(kepala)):
                p.error("Kolom wajib: nama;nis;kelas (opsional: email)")
            idx = {h: i for i, h in enumerate(kepala)}
            dibuat, dilewati = [], []
            for isi in baris[1:]:
                if not any(x.strip() for x in isi):
                    continue
                nama = isi[idx["nama"]].strip()
                nis = isi[idx["nis"]].strip()
                kelas = isi[idx["kelas"]].strip().upper()
                email = isi[idx["email"]].strip().lower() if "email" in idx and idx["email"] < len(isi) else ""
                cocok = re.fullmatch(r"(VII|VIII|IX)\s*([A-F])", kelas)
                if not cocok or not nama or not nis:
                    dilewati.append(f"{nama or '-'}: kelas/nama/NIS tidak valid ({kelas})")
                    continue
                tingkat, rombel = cocok.group(1), cocok.group(2)
                ada = db.scalar(
                    select(Pengguna).where(
                        or_(Pengguna.nis == nis, Pengguna.email == email) if email else (Pengguna.nis == nis)
                    )
                )
                if ada:
                    dilewati.append(f"{nama}: NIS {nis} sudah terdaftar")
                    continue
                sandi = secrets.token_urlsafe(9)[:12]
                u = Pengguna(
                    nama=nama,
                    nis=nis,
                    email=email or None,
                    kata_sandi=PasswordHash.recommended().hash(sandi),
                    peran="siswa",
                    tingkat=tingkat,
                    rombel=rombel,
                )
                db.add(u)
                db.flush()
                c = db.get(KontrolAkun, u.id)
                if c is None:
                    c = KontrolAkun(pengguna_id=u.id, aktif=True, wajib_ganti_sandi=False)
                    db.add(c)
                c.wajib_ganti_sandi = True
                dibuat.append([nama, nis, f"{tingkat} {rombel}", sandi])
            db.commit()
            keluar = jalur.with_name(jalur.stem + "-akun.csv")
            with open(keluar, "w", newline="", encoding="utf-8-sig") as f:
                w = csv.writer(f, delimiter=";")
                w.writerow(["nama", "nis", "kelas", "sandi_sementara"])
                w.writerows(dibuat)
            print(f"{len(dibuat)} akun dibuat. Kata sandi sementara ada di: {keluar}")
            if dilewati:
                print(f"{len(dilewati)} baris dilewati:")
                for d in dilewati[:20]:
                    print("  -", d)
            return
        if a.command == "backup":
            import pathlib
            import shutil
            import sqlite3

            folder = pathlib.Path(a.dir)
            folder.mkdir(parents=True, exist_ok=True)
            cap = time.strftime("%Y%m%d-%H%M")
            if db.bind.dialect.name == "sqlite":
                sumber = db.bind.url.database
                tujuan = folder / f"bemai-{cap}.db"
                asal = sqlite3.connect(sumber)
                salin = sqlite3.connect(tujuan)
                with salin:
                    asal.backup(salin)
                salin.close()
                asal.close()
            else:
                if not shutil.which("pg_dump"):
                    p.error("pg_dump tidak tersedia; pasang postgresql-client")
                tujuan = folder / f"bemai-{cap}.sql"
                url = db.bind.url
                env = os.environ.copy()
                if url.password:
                    env["PGPASSWORD"] = url.password
                hasil = subprocess.run(
                    ["pg_dump", "-h", url.host or "localhost", "-p", str(url.port or 5432),
                     "-U", url.username or "postgres", "-d", url.database or "bemai",
                     "-f", str(tujuan)],
                    env=env,
                )
                if hasil.returncode:
                    p.error("pg_dump gagal")
            # Sisakan 14 berkas terbaru saja.
            lama = sorted(folder.glob("bemai-*"))
            for berkas in lama[:-14]:
                berkas.unlink()
            print(f"Cadangan dibuat: {tujuan}")
            return
        if a.command == "purge":
            now = int(time.time())
            # Nilai latihan disimpan berbulan-bulan supaya bisa dipakai rapor;
            # log aktivitas cukup lebih pendek. Keduanya bisa diatur lewat .env.
            from app.config import RETENSI_AKTIVITAS_HARI, RETENSI_NILAI_HARI

            batas_nilai = now - RETENSI_NILAI_HARI * 86400
            batas_aktivitas = now - RETENSI_AKTIVITAS_HARI * 86400
            db.execute(delete(Pengguna).where(
                Pengguna.uji_coba_sampai.is_not(None),
                Pengguna.uji_coba_sampai < now,
            ))
            for model, where in [
                (Sesi, Sesi.expires < now),
                (Batas, Batas.expires < now),
                (Percobaan, Percobaan.dibuat < batas_nilai),
                (AktivitasBelajar, AktivitasBelajar.dibuat < batas_aktivitas),
            ]:
                db.execute(delete(model).where(where))
            # Legacy tables: preserve declared 24-hour retention after migration too.
            from datetime import datetime, timezone
            from sqlalchemy import text

            db.execute(
                delete(Hasil).where(
                    Hasil.dibuat_pada < datetime.fromtimestamp(batas_nilai, timezone.utc)
                )
            )
            if db.bind.dialect.name == "postgresql":
                from sqlalchemy import inspect

                existing = set(inspect(db.bind).get_table_names())
                for name in ("chat", "aktivitas"):
                    if name not in existing:
                        continue
                    db.execute(
                        text(f"DELETE FROM {name} WHERE dibuat_pada < :batas"),
                        {"batas": datetime.fromtimestamp(batas_aktivitas, timezone.utc)},
                    )
            db.commit()
            print(f"Retensi diterapkan: nilai {RETENSI_NILAI_HARI} hari, aktivitas {RETENSI_AKTIVITAS_HARI} hari.")
            return
        if a.command == "reset-uji":
            from datetime import datetime, timedelta, timezone
            from pathlib import Path
            import shutil

            kering = not a.ya

            batas_dt = None if a.semua else datetime.now(timezone.utc) - timedelta(days=a.hari)
            batas_ts = None if a.semua else int(time.time()) - a.hari * 86400

            q_materi = select(Materi)
            if batas_dt is not None:
                q_materi = q_materi.where(Materi.dibuat_pada >= batas_dt)
            materi = list(db.scalars(q_materi))
            ids = [m.id for m in materi]

            n_soal = 0
            for mid in ids:
                n_soal += db.execute(delete(Soal).where(Soal.materi_id == mid)).rowcount or 0

            q_perc = delete(Percobaan)
            q_akt = delete(AktivitasBelajar)
            q_hasil = delete(Hasil)
            if ids:
                q_perc = q_perc.where(Percobaan.materi_id.in_(ids))
                q_akt = q_akt.where(AktivitasBelajar.materi_id.in_(ids))
            if batas_ts is not None:
                q_perc = q_perc.where(Percobaan.dibuat >= batas_ts)
                q_akt = q_akt.where(AktivitasBelajar.dibuat >= batas_ts)
            n_perc = db.execute(q_perc).rowcount or 0
            n_akt = db.execute(q_akt).rowcount or 0
            if batas_dt is not None:
                q_hasil = q_hasil.where(Hasil.dibuat_pada >= batas_dt)
            n_hasil = db.execute(q_hasil).rowcount or 0

            folder = Path(__file__).resolve().parent.parent / "frontend" / "assets" / "materi"
            n_gambar = 0
            for m in materi:
                db.delete(m)
                d = folder / str(m.id)
                if not kering and d.is_dir():
                    n_gambar += len(list(d.iterdir()))
                    shutil.rmtree(d)

            n_akun = 0
            for nilai in [x.strip() for x in a.akun.split(",") if x.strip()]:
                u = db.scalar(
                    select(Pengguna).where(
                        or_(Pengguna.nis == nilai, func.lower(Pengguna.email) == nilai.lower())
                    )
                )
                if u is None or u.peran == "admin":
                    continue
                db.execute(delete(Percobaan).where(Percobaan.pengguna_id == u.id))
                db.execute(delete(AktivitasBelajar).where(AktivitasBelajar.pengguna_id == u.id))
                db.delete(u)
                n_akun += 1

            if kering:
                db.rollback()
                print(
                    f"Akan dihapus: {len(materi)} materi, {n_soal} soal, {n_perc} pekerjaan latihan, "
                    f"{n_akt} aktivitas, {n_hasil} nilai lama, {n_gambar} gambar, {n_akun} akun uji."
                )
                print("Belum ada yang dihapus. Ulangi dengan --ya kalau daftar di atas sudah benar.")
                return

            db.commit()
            print(
                f"Selesai: {len(materi)} materi, {n_soal} soal, {n_perc} pekerjaan latihan, "
                f"{n_akt} aktivitas, {n_hasil} nilai lama, {n_gambar} gambar, {n_akun} akun uji dihapus."
            )
            return
        email_clean = a.email.strip().lower()
        u = db.scalar(select(Pengguna).where(func.lower(Pengguna.email) == email_clean))
        if a.command == "user":
            nis_clean = a.nis.strip() if getattr(a, "nis", None) and a.nis.strip() else None
            existing_q = select(Pengguna).where(func.lower(Pengguna.email) == email_clean)
            if nis_clean:
                existing_q = select(Pengguna).where(
                    or_(func.lower(Pengguna.email) == email_clean, Pengguna.nis == nis_clean)
                )
            if db.scalar(existing_q):
                p.error("Email atau NIS sudah digunakan")
            if a.peran == "siswa" and not (a.tingkat and a.rombel):
                p.error("Siswa wajib memiliki tingkat dan rombel")
            password = getpass.getpass("Kata sandi (minimal 12 karakter): ")
            if len(password) < 12 or len(password) > 256:
                p.error("Panjang kata sandi 12–256 karakter")
            u = Pengguna(
                nama=a.nama.strip(),
                email=email_clean,
                nis=nis_clean,
                kata_sandi=PasswordHash.recommended().hash(password),
                peran=a.peran,
                tingkat=a.tingkat,
                rombel=a.rombel,
            )
            db.add(u)
        elif not u:
            p.error("Akun tidak ditemukan")
        elif a.command == "reset-password":
            password = getpass.getpass("Kata sandi baru (minimal 12 karakter): ")
            if not 12 <= len(password) <= 256:
                p.error("Panjang kata sandi 12–256 karakter")
            u.kata_sandi = PasswordHash.recommended().hash(password)
            db.execute(delete(Sesi).where(Sesi.pengguna_id == u.id))
        else:
            if u.peran != "guru":
                p.error("Penugasan hanya untuk akun guru")
            q = select(Penugasan).where(
                Penugasan.guru_id == u.id,
                Penugasan.mapel == a.mapel,
                Penugasan.tingkat == a.tingkat,
                Penugasan.rombel == a.rombel,
            )
            assignment = db.scalar(q)
            if a.command == "assign" and not assignment:
                db.add(
                    Penugasan(
                        guru_id=u.id, mapel=a.mapel, tingkat=a.tingkat, rombel=a.rombel
                    )
                )
            if a.command == "revoke" and assignment:
                db.delete(assignment)
            db.execute(delete(Sesi).where(Sesi.pengguna_id == u.id))
        db.commit()
        audit("operator_" + a.command, target=u.id)
        print("Perubahan tersimpan.")


if __name__ == "__main__":
    main()
