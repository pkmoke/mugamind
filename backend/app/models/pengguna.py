from sqlalchemy import Integer
from sqlalchemy import JSON
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Pengguna(Base):
    __tablename__ = "pengguna"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True
    )
    nama: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    nis: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    kata_sandi: Mapped[str] = mapped_column(String(255), nullable=False)
    peran: Mapped[str] = mapped_column(String(20), nullable=False)
    tingkat: Mapped[str | None] = mapped_column(String(10), nullable=True)
    rombel: Mapped[str | None] = mapped_column(String(10), nullable=True)
    uji_coba_sampai: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    materi_dilihat: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
