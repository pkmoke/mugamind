from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field

Tingkat = Literal["VII", "VIII", "IX"]
Rombel = Literal["A", "B", "C", "D", "E", "F"]
Pendek = Annotated[str, Field(min_length=1, max_length=100, strict=True)]
Bagian = Annotated[str, Field(min_length=1, max_length=4000, strict=True)]


class MateriCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    mapel: Pendek
    tingkat: Tingkat
    rombel: list[Rombel] = Field(min_length=1, max_length=6)
    judul: str = Field(min_length=1, max_length=255)
    teks: list[Bagian] = Field(min_length=1, max_length=100)
    rangkuman: list[Bagian] = Field(default_factory=list, max_length=30)


# Updates are full validated replacements so required columns can never become null.
MateriUpdate = MateriCreate
