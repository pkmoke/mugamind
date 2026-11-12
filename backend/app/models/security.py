from sqlalchemy import (
    BigInteger,
    Integer,
    String,
    Text,
    JSON,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Penugasan(Base):
    __tablename__ = "penugasan_guru"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    guru_id: Mapped[int] = mapped_column(
        ForeignKey("pengguna.id", ondelete="CASCADE"), index=True
    )
    mapel: Mapped[str] = mapped_column(String(100))
    tingkat: Mapped[str] = mapped_column(String(10))
    rombel: Mapped[str] = mapped_column(String(10))
    __table_args__ = (UniqueConstraint("guru_id", "mapel", "tingkat", "rombel"),)


class Sesi(Base):
    __tablename__ = "sesi_aman"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    pengguna_id: Mapped[int] = mapped_column(
        ForeignKey("pengguna.id", ondelete="CASCADE"), index=True
    )
    csrf: Mapped[str] = mapped_column(String(64))
    expires: Mapped[int] = mapped_column(index=True)


class Batas(Base):
    __tablename__ = "batas_permintaan"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    hits: Mapped[int] = mapped_column(Integer)
    expires: Mapped[int] = mapped_column(index=True)


class Percobaan(Base):
    __tablename__ = "percobaan_latihan"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    pengguna_id: Mapped[int] = mapped_column(
        ForeignKey("pengguna.id", ondelete="CASCADE"), index=True
    )
    materi_id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("materi.id", ondelete="CASCADE"),
        index=True,
    )
    mapel: Mapped[str] = mapped_column(String(100))
    kelas: Mapped[str] = mapped_column(String(30))
    judul: Mapped[str] = mapped_column(String(255))
    snapshot: Mapped[list] = mapped_column(JSON)
    hasil: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    dibuat: Mapped[int] = mapped_column(index=True)
    expires: Mapped[int] = mapped_column(index=True)
    selesai: Mapped[int | None] = mapped_column(nullable=True)


class AktivitasBelajar(Base):
    __tablename__ = "aktivitas_belajar"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pengguna_id: Mapped[int] = mapped_column(
        ForeignKey("pengguna.id", ondelete="CASCADE"), index=True
    )
    materi_id: Mapped[int | None] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("materi.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    mapel: Mapped[str] = mapped_column(String(100))
    kelas: Mapped[str] = mapped_column(String(30))
    jenis: Mapped[str] = mapped_column(String(30))
    judul: Mapped[str] = mapped_column(Text)
    hasil: Mapped[str] = mapped_column(Text)
    dibuat: Mapped[int] = mapped_column(index=True)


class KontrolAkun(Base):
    __tablename__ = "kontrol_akun"
    pengguna_id: Mapped[int] = mapped_column(
        ForeignKey("pengguna.id", ondelete="CASCADE"), primary_key=True
    )
    aktif: Mapped[bool] = mapped_column(default=True)
    wajib_ganti_sandi: Mapped[bool] = mapped_column(default=False)


class AuditAdmin(Base):
    __tablename__ = "audit_admin"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("pengguna.id"), index=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("pengguna.id"), index=True)
    aksi: Mapped[str] = mapped_column(String(60))
    dibuat: Mapped[int] = mapped_column(index=True)
