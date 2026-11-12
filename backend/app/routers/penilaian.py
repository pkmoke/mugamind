"""Penilaian esai, reset latihan, dan ekspor nilai oleh guru."""

import csv
import io
import time
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import scopes
from app.database import get_db
from app.dependencies import require_guru
from app.models.pengguna import Pengguna
from app.models.security import Percobaan
from app.security import audit, limit

router = APIRouter(prefix="/api/latihan", tags=["Penilaian"])


class NilaiSatu(BaseModel):
    model_config = ConfigDict(extra="forbid")
    soalId: int = Field(gt=0)
    poin: int = Field(ge=0, le=100, strict=True)


class NilaiEsai(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nilai: list[NilaiSatu] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unik(self):
        if len({x.soalId for x in self.nilai}) != len(self.nilai):
            raise ValueError("Soal duplikat")
        return self


def _dalam_scope(db, guru, p: Percobaan) -> bool:
    return (p.mapel, p.kelas) in scopes(db, guru)


def _hitung_ulang(hasil: dict) -> dict:
    """Hitung ulang nilai: pilihan ganda 1 poin, esai proporsional 0-100."""
    detail = hasil.get("detail") or []
    benar = 0
    total_esai = 0
    esai_dinilai = 0
    skor = 0.0
    for item in detail:
        if item.get("tipe") == "essay":
            total_esai += 1
            poin = item.get("poinEsai")
            if poin is None:
                continue
            esai_dinilai += 1
            skor += poin / 100
        else:
            if item.get("benar") is True:
                benar += 1
                skor += 1
    total = len(detail)
    hasil["benar"] = benar
    hasil["total"] = total
    hasil["menungguPenilaian"] = total_esai - esai_dinilai
    hasil["esaiDinilai"] = esai_dinilai
    hasil["nilai"] = round(skor / total * 100, 2) if total else None
    hasil["sudahDinilai"] = hasil["menungguPenilaian"] == 0
    return hasil


@router.get("/menunggu")
def menunggu(
    user=Depends(require_guru),
    db: Session = Depends(get_db),
    offset: int = Query(0, ge=0),
    limit_baris: int = Query(50, ge=1, le=100),
):
    """Daftar pekerjaan siswa yang masih punya esai belum dinilai."""
    izin = scopes(db, user)
    out = []
    query = (
        select(Percobaan, Pengguna.nama)
        .join(Pengguna, Percobaan.pengguna_id == Pengguna.id)
        .where(Percobaan.selesai.is_not(None))
        .order_by(Percobaan.selesai.desc())
    )
    dilewati = 0
    for p, nama in db.execute(query).yield_per(100):
        hasil = p.hasil if isinstance(p.hasil, dict) else {}
        if (p.mapel, p.kelas) not in izin:
            continue
        sisa = [
            d
            for d in (hasil.get("detail") or [])
            if d.get("tipe") == "essay" and d.get("poinEsai") is None
        ]
        if not sisa:
            continue
        if dilewati < offset:
            dilewati += 1
            continue
        out.append(
            {
                "percobaanId": p.id,
                "siswaId": str(p.pengguna_id),
                "namaSiswa": nama,
                "kelas": p.kelas,
                "mapel": p.mapel,
                "judul": p.judul,
                "waktu": p.selesai * 1000,
                "jumlahEsai": len(sisa),
                "nilaiSementara": (
                    round(
                        sum(1 for d in (hasil.get("detail") or []) if d.get("benar") is True)
                        / max(1, len(hasil.get("detail") or []))
                        * 100,
                        2,
                    )
                ),
                "esai": [
                    {
                        "soalId": d.get("soalId"),
                        "tanya": d.get("tanya"),
                        "jawaban": d.get("jawabTeks") or "",
                        "kunci": d.get("kunci") or "",
                        "pembahasan": d.get("pembahasan") or "",
                    }
                    for d in sisa
                ],
            }
        )
        if len(out) >= limit_baris:
            break
    return out


@router.post("/{pid}/nilai")
def nilai(
    pid: str,
    data: NilaiEsai,
    user=Depends(require_guru),
    db: Session = Depends(get_db),
):
    limit(f"nilai:{user.id}", 120, 60)
    p = db.get(Percobaan, pid)
    if not p or p.selesai is None:
        raise HTTPException(404, "Pekerjaan siswa tidak ditemukan")
    if not _dalam_scope(db, user, p):
        raise HTTPException(403, "Bukan kelas yang Anda ampu")
    hasil = dict(p.hasil or {})
    detail = [dict(d) for d in (hasil.get("detail") or [])]
    peta = {x.soalId: x.poin for x in data.nilai}
    kena = 0
    for item in detail:
        if item.get("tipe") != "essay":
            continue
        soal_id = int(item.get("soalId") or 0)
        if soal_id in peta:
            item["poinEsai"] = peta[soal_id]
            item["dinilaiPada"] = int(time.time())
            kena += 1
    if not kena:
        raise HTTPException(400, "Tidak ada soal esai yang cocok pada pekerjaan ini")
    hasil["detail"] = detail
    hasil = _hitung_ulang(hasil)
    hasil["dinilaiOleh"] = str(user.id)
    hasil["dinilaiPada"] = int(time.time())
    p.hasil = hasil
    db.commit()
    audit("attempt_graded", actor=user.id, target=p.id)
    return hasil


@router.delete("/{pid}", status_code=204)
def reset(
    pid: str,
    user=Depends(require_guru),
    db: Session = Depends(get_db),
):
    """Hapus satu pekerjaan supaya siswa boleh mengulang latihan."""
    limit(f"reset:{user.id}", 60, 60)
    p = db.get(Percobaan, pid)
    if not p:
        raise HTTPException(404, "Pekerjaan siswa tidak ditemukan")
    if not _dalam_scope(db, user, p):
        raise HTTPException(403, "Bukan kelas yang Anda ampu")
    db.delete(p)
    db.commit()
    audit("attempt_reset", actor=user.id, target=pid)


@router.get("/ekspor")
def ekspor(
    user=Depends(require_guru),
    db: Session = Depends(get_db),
    mapel: str = Query(default="", max_length=100),
    kelas: str = Query(default="", max_length=20),
):
    """Unduh rekap nilai sebagai CSV (dibuka di Excel)."""
    izin = scopes(db, user)
    rows = []
    query = (
        select(Percobaan, Pengguna.nama, Pengguna.nis)
        .join(Pengguna, Percobaan.pengguna_id == Pengguna.id)
        .where(Percobaan.selesai.is_not(None))
        .order_by(Percobaan.kelas, Pengguna.nama, Percobaan.selesai)
    )
    for p, nama, nis in db.execute(query).yield_per(200):
        if (p.mapel, p.kelas) not in izin:
            continue
        if mapel and p.mapel != mapel:
            continue
        if kelas and p.kelas != kelas:
            continue
        h = p.hasil if isinstance(p.hasil, dict) else {}
        rows.append(
            [
                nama,
                nis or "",
                p.kelas,
                p.mapel,
                p.judul,
                "" if h.get("nilai") is None else h.get("nilai"),
                h.get("benar", ""),
                h.get("total", ""),
                "Belum" if h.get("menungguPenilaian") else "Sudah",
                time.strftime("%Y-%m-%d %H:%M", time.localtime(p.selesai)),
            ]
        )
    buf = io.StringIO()
    buf.write("\ufeff")
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(
        ["Nama", "NIS", "Kelas", "Mapel", "Materi", "Nilai", "Benar", "Jumlah soal", "Status esai", "Waktu"]
    )
    writer.writerows(rows)
    nama_file = f"nilai-{kelas or 'semua'}-{mapel or 'semua'}.csv".replace(" ", "-")
    audit("grades_exported", actor=user.id, target=len(rows))
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nama_file}"'},
    )
