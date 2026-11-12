from sqlalchemy import Integer
from sqlalchemy import JSON
from datetime import datetime

from sqlalchemy import BigInteger, Numeric, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Hasil(Base):
    __tablename__ = "hasil"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True
    )

    pengguna_id: Mapped[int] = mapped_column(BigInteger, nullable=False)

    materi_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    nilai: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)

    benar: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    detail: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    dibuat_pada: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
