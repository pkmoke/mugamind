from sqlalchemy import Integer
from sqlalchemy import JSON
from datetime import datetime

from sqlalchemy import BigInteger, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Soal(Base):
    __tablename__ = "soal"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True
    )

    materi_id: Mapped[int | None] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("materi.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    tipe: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pilihan_ganda", server_default="pilihan_ganda"
    )

    gambar: Mapped[str | None] = mapped_column(Text, nullable=True)

    topik: Mapped[str | None] = mapped_column(String(150), nullable=True)

    tanya: Mapped[str] = mapped_column(Text, nullable=False)

    opsi: Mapped[list[str]] = mapped_column(
        ARRAY(Text).with_variant(JSON, "sqlite"), nullable=False, default=list
    )

    jawaban: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    pembahasan: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )

    kunci_essay: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )

    kelas: Mapped[list[str]] = mapped_column(
        ARRAY(Text).with_variant(JSON, "sqlite"), nullable=False
    )

    dibuat_pada: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
