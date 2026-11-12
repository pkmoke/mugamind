"""
Script to create an admin account non-interactively.
Usage (inside Docker / WSL):
  docker compose exec backend python create_admin.py \
    --email admin@mugamind.sch \
    --nama "Administrator" \
    --password "GantiPassword123"

Or pass via environment variables (safer for automation):
  ADMIN_EMAIL=admin@mugamind.sch \
  ADMIN_NAMA=Administrator \
  ADMIN_PASSWORD=GantiPassword123 \
  docker compose exec -T backend python create_admin.py
"""
import sys
import os
import argparse
from sqlalchemy import select, func
from pwdlib import PasswordHash
from app.database import Base, SessionLocal, engine
from app.models.pengguna import Pengguna
from app.security import audit


def main():
    p = argparse.ArgumentParser(description="Buat akun administrator MugaMind")
    p.add_argument("--email", default=os.getenv("ADMIN_EMAIL"), help="Email admin")
    p.add_argument("--nama", default=os.getenv("ADMIN_NAMA", "Administrator"), help="Nama admin")
    p.add_argument("--password", default=os.getenv("ADMIN_PASSWORD"), help="Password (min 12 karakter)")

    a = p.parse_args()

    if not a.email:
        p.error("--email wajib diisi (atau set env ADMIN_EMAIL)")
    if not a.password:
        p.error("--password wajib diisi (atau set env ADMIN_PASSWORD)")
    if len(a.password) < 12:
        p.error("Password minimal 12 karakter")
    if len(a.password) > 256:
        p.error("Password maksimal 256 karakter")

    email_clean = a.email.strip().lower()
    password_hash = PasswordHash.recommended()

    # Ensure DB tables exist
    Base.metadata.create_all(engine)

    with SessionLocal() as db:
        existing = db.scalar(select(Pengguna).where(func.lower(Pengguna.email) == email_clean))
        if existing:
            if existing.peran == "admin":
                print(f"✓ Akun admin '{email_clean}' sudah ada (id={existing.id}). Tidak ada perubahan.")
                sys.exit(0)
            else:
                # Upgrade existing account to admin
                print(f"⚠ Akun '{email_clean}' ditemukan dengan peran '{existing.peran}'. Mengubah ke admin...")
                existing.peran = "admin"
                existing.kata_sandi = password_hash.hash(a.password)
                db.commit()
                audit("operator_user", target=existing.id)
                print(f"✓ Akun '{existing.nama}' ({email_clean}) berhasil dijadikan admin.")
                return

        u = Pengguna(
            nama=a.nama.strip(),
            email=email_clean,
            kata_sandi=password_hash.hash(a.password),
            peran="admin",
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        audit("operator_user", target=u.id)
        print(f"✓ Akun admin berhasil dibuat:")
        print(f"  Email    : {email_clean}")
        print(f"  Nama     : {u.nama}")
        print(f"  ID       : {u.id}")
        print(f"  Peran    : admin")
        print()
        print("⚠ PENTING: Segera ganti password setelah login pertama!")


if __name__ == "__main__":
    main()
