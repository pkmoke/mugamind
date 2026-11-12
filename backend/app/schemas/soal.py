from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Pilihan = Annotated[str, Field(min_length=1, max_length=2000, strict=True)]
Kelas = Annotated[str, Field(pattern=r"^(VII|VIII|IX) [A-F]$")]


class SoalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    materiId: int = Field(gt=0)
    tipe: Literal["pilihan_ganda", "essay"] = Field(default="pilihan_ganda")
    topik: str = Field(default="Manual", max_length=150)
    tanya: str = Field(min_length=1, max_length=4000)
    gambar: str | None = Field(default=None, max_length=2_000_000)
    opsi: list[Pilihan] = Field(default_factory=list, max_length=6)
    pembahasan: str = Field(default="", max_length=4000)
    kunciEssay: str = Field(default="", max_length=4000)
    jawaban: int = Field(default=0, ge=-1, le=5, strict=True)
    kelas: list[Kelas] = Field(min_length=1, max_length=18)

    @model_validator(mode="after")
    def check(self):
        if self.tipe == "pilihan_ganda":
            if len(self.opsi) < 2:
                raise ValueError("Soal pilihan ganda memerlukan minimal 2 opsi")
            if self.jawaban < 0 or self.jawaban >= len(self.opsi):
                raise ValueError("Kunci jawaban pilihan ganda tidak valid")
        elif self.tipe == "essay":
            if self.jawaban < 0:
                self.jawaban = 0
        if len(set(self.kelas)) != len(self.kelas):
            raise ValueError("Kelas duplikat tidak valid")
        return self


class SoalGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    materiId: int = Field(gt=0)
    jumlah: int = Field(default=5, ge=2, le=50)
    tipe: Literal["pilihan_ganda", "essay"] = "pilihan_ganda"


class SoalTerbitkanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    usulan: list[SoalCreate] = Field(min_length=1, max_length=50)
