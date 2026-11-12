from pydantic import BaseModel, ConfigDict, Field, model_validator


class MulaiLatihan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    materiId: int = Field(gt=0)


class JawabanLatihan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    soalId: int = Field(gt=0)
    pilihan: int = Field(default=-1, ge=-1, le=5, strict=True)
    jawabanTeks: str | None = Field(default="", max_length=4000)


class LatihanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    percobaanId: str = Field(pattern=r"^[a-f0-9]{32}$")
    jawaban: list[JawabanLatihan] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unique(self):
        if len({x.soalId for x in self.jawaban}) != len(self.jawaban):
            raise ValueError("Soal duplikat")
        return self
