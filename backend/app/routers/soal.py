import re
import random
import io
import shutil
import subprocess
import tempfile
import time
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.soal import Soal
from app.models.materi import Materi
from app.dependencies import require_pembelajaran, get_current_user, require_guru
from app.schemas.soal import SoalCreate, SoalGenerateRequest, SoalTerbitkanRequest
from app.access import (
    allowed,
    materi_akses,
    kelas_materi,
    soal_dict,
    cek_tujuan,
    scopes,
)
from app.security import audit, limit
from app.services import ai

router = APIRouter(prefix="/api/soal", tags=["Soal"])

_HURUF_AMAN = set(".,;:!?()[]{}-–—'\"%/&+=*<>|_@#$°•…“”‘’")


def _rapikan_pdf(teks: str) -> str:
    """Bersihkan hasil pdftotext: kontrol, kata terpotong, baris jadi paragraf."""
    teks = teks.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    teks = re.sub(r"(\w)-\n(\w)", r"\1\2", teks)
    teks = re.sub(r"[ \t]+", " ", teks)
    blok = [re.sub(r" *\n *", " ", b).strip() for b in re.split(r"\n\s*\n", teks)]
    return "\n\n".join(b for b in blok if b)


def _teks_masuk_akal(teks: str) -> bool:
    """Tolak hasil yang isinya sampah (font terenkripsi, byte mentah)."""
    if len(teks) < 200:
        return False
    huruf = sum(1 for c in teks if c.isalpha())
    aneh = sum(
        1
        for c in teks
        if not (c.isalnum() or c.isspace() or c in _HURUF_AMAN)
    )
    return huruf / len(teks) > 0.55 and aneh / len(teks) < 0.15


def _teks_pdf_asli(pdf_path: Path, deadline: float) -> str:
    """Ambil lapisan teks asli PDF. Kosong kalau tidak ada atau hasilnya sampah."""
    if not shutil.which("pdftotext"):
        return ""
    sisa = deadline - time.monotonic()
    if sisa <= 0:
        return ""
    try:
        hasil = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf_path), "-"],
            capture_output=True,
            text=True,
            timeout=min(30, sisa),
        )
    except (subprocess.TimeoutExpired, OSError):
        return ""
    if hasil.returncode != 0:
        return ""
    teks = _rapikan_pdf(hasil.stdout)
    return teks if _teks_masuk_akal(teks) else ""


def visible(db, user, s, m=None):
    if m is None:
        m = db.get(Materi, s.materi_id) if s.materi_id else None
    if not m or not allowed(db, user, m):
        return False
    if user.peran == "guru":
        # Also check legacy questions whose destination classes may predate validation.
        return all((m.mapel, k) in scopes(db, user) for k in s.kelas)
    return f"{user.tingkat} {user.rombel}" in s.kelas


def check(db, user, data):
    m = materi_akses(db, user, data.materiId)
    cek_tujuan(db, user, m.mapel, data.kelas)
    if not set(data.kelas).issubset(kelas_materi(m)):
        raise HTTPException(400, "Kelas soal harus termasuk kelas materi sumber")
    return m


def make(data):
    d = data.model_dump()
    d["materi_id"] = d.pop("materiId")
    if "kunciEssay" in d:
        d["kunci_essay"] = d.pop("kunciEssay")
    return Soal(**d, dibuat_pada=datetime.now(timezone.utc))




@router.post("/ekstrak-ocr")
async def ekstrak_ocr(
    request: Request,
    filename: str = Query(..., min_length=1, max_length=180),
    user=Depends(require_guru),
):
    """Read text from image-based PDF/DOCX/image files for the teacher's question importer."""
    limit(f"ocr:{user.id}", 10, 3600)
    name = Path(filename).name
    ext = Path(name).suffix.lower()
    if ext not in {".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(415, "Format OCR yang didukung: PDF, DOCX, PNG, JPG, JPEG, WEBP")
    raw = await request.body()
    if not raw or len(raw) > 10 * 1024 * 1024:
        raise HTTPException(413, "Berkas kosong atau melebihi 10 MB")
    tesseract = shutil.which("tesseract")
    if not tesseract and not (ext == ".pdf" and shutil.which("pdftotext")):
        raise HTTPException(503, "Mesin OCR belum tersedia pada server")
    try:
        langs = subprocess.run(
            [tesseract, "--list-langs"], capture_output=True, text=True, timeout=10
        ).stdout
        language = "ind+eng" if "ind" in langs else "eng"
        chunks = []
        sumber_teks = "OCR"
        with tempfile.TemporaryDirectory(prefix="bemai-ocr-") as temp:
            folder = Path(temp)
            deadline = time.monotonic() + 90

            def run_ocr(image_path):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise subprocess.TimeoutExpired([tesseract, str(image_path)], 90)
                result = subprocess.run(
                    [tesseract, str(image_path), "stdout", "-l", language, "--psm", "6"],
                    capture_output=True, text=True, timeout=min(25, remaining),
                )
                if result.returncode != 0:
                    raise RuntimeError("OCR gagal membaca salah satu halaman/gambar")
                value = result.stdout.strip()
                if value:
                    chunks.append(value)

            if ext in {".png", ".jpg", ".jpeg", ".webp"}:
                image_path = folder / ("upload" + ext)
                image_path.write_bytes(raw)
                run_ocr(image_path)
            elif ext == ".pdf":
                if not shutil.which("pdfinfo"):
                    raise HTTPException(503, "Pemroses PDF belum tersedia pada server")
                pdf_path = folder / "upload.pdf"
                pdf_path.write_bytes(raw)
                info = subprocess.run(
                    ["pdfinfo", str(pdf_path)], capture_output=True, text=True, timeout=10
                )
                pages_match = re.search(r"^Pages:\s+(\d+)", info.stdout, re.M)
                if info.returncode != 0 or not pages_match:
                    raise HTTPException(400, "PDF tidak dapat dibaca")
                pages = int(pages_match.group(1))
                teks_langsung = _teks_pdf_asli(pdf_path, deadline)
                if teks_langsung:
                    if pages > 40:
                        raise HTTPException(413, "PDF dibatasi maksimal 40 halaman per berkas")
                    chunks.append(teks_langsung)
                    sumber_teks = "teks PDF"
                else:
                    if not shutil.which("pdftoppm") or not tesseract:
                        raise HTTPException(503, "Pemroses PDF belum tersedia pada server")
                    if pages > 10:
                        raise HTTPException(413, "OCR dibatasi maksimal 10 halaman per berkas")
                    prefix = folder / "page"
                    converted = subprocess.run(
                        ["pdftoppm", "-f", "1", "-l", "20", "-r", "180", "-png", str(pdf_path), str(prefix)],
                        capture_output=True, timeout=min(45, max(1, deadline - time.monotonic())),
                    )
                    if converted.returncode != 0:
                        raise HTTPException(400, "Halaman PDF tidak dapat dikonversi")
                    page_images = sorted(
                        folder.glob("page-*.png"),
                        key=lambda path: int(path.stem.rsplit("-", 1)[-1]),
                    )
                    for image_path in page_images:
                        run_ocr(image_path)
            else:  # DOCX: extract paragraph text and OCR embedded pictures.
                try:
                    with zipfile.ZipFile(io.BytesIO(raw)) as doc:
                        document_info = doc.getinfo("word/document.xml")
                        if document_info.file_size > 10 * 1024 * 1024:
                            raise HTTPException(413, "Isi DOCX terlalu besar untuk diproses")
                        xml = doc.read("word/document.xml")
                        tree = ET.fromstring(xml)
                        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                        paragraphs = []
                        for para in tree.findall(".//w:p", ns):
                            text_value = "".join(x.text or "" for x in para.findall(".//w:t", ns))
                            if text_value.strip():
                                paragraphs.append(text_value.strip())
                        chunks.extend(paragraphs)
                        media = [n for n in doc.namelist() if n.startswith("word/media/") and not n.endswith("/")]
                        if len(media) > 10 or sum(doc.getinfo(n).file_size for n in media) > 20 * 1024 * 1024:
                            raise HTTPException(413, "DOCX dibatasi maksimal 10 gambar dan total media 20 MB")
                        for index, media_name in enumerate(media):
                            suffix = Path(media_name).suffix.lower()
                            if suffix not in {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}:
                                continue
                            image_path = folder / f"docx-image-{index}{suffix}"
                            image_path.write_bytes(doc.read(media_name))
                            run_ocr(image_path)
                except zipfile.BadZipFile:
                    raise HTTPException(400, "Dokumen DOCX tidak valid")
        result = "\n\n".join(chunks).strip()
        if not result:
            raise HTTPException(422, "Tidak ada teks yang berhasil dibaca. Pastikan gambar jelas dan tidak buram.")
        audit("question_document_ocr", actor=user.id, target=len(raw))
        return {"teks": result[:120000], "metode": sumber_teks, "bagianTerbaca": len(chunks)}
    except subprocess.TimeoutExpired:
        raise HTTPException(408, "Proses OCR terlalu lama. Coba berkas yang lebih kecil.")
    except HTTPException:
        raise
    except Exception:
        audit("question_document_ocr_failed", actor=user.id)
        raise HTTPException(400, "Berkas gagal diproses. Periksa format dan kualitas dokumen.")


@router.get("")
def daftar(
    user=Depends(require_pembelajaran),
    db: Session = Depends(get_db),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    query = (
        select(Soal, Materi)
        .join(Materi, Soal.materi_id == Materi.id)
        .order_by(Soal.id)
    )
    if user.peran == "siswa":
        query = query.where(Materi.tingkat == user.tingkat)
    elif user.peran == "guru":
        user_scopes = scopes(db, user)
        mapels = {mapel for mapel, _ in user_scopes}
        tingkats = {k.split()[0] for _, k in user_scopes if len(k.split()) > 0}
        if mapels and tingkats:
            query = query.where(Materi.mapel.in_(mapels), Materi.tingkat.in_(tingkats))
        else:
            return []

    out = []
    for s, m in db.execute(query).yield_per(100):
        if visible(db, user, s, m):
            if offset:
                offset -= 1
            else:
                out.append(soal_dict(s, user.peran == "guru"))
            if len(out) >= limit:
                break
    return out


@router.post("/generate")
def generate(
    data: SoalGenerateRequest, user=Depends(require_guru), db: Session = Depends(get_db)
):
    m = materi_akses(db, user, data.materiId)

    # Jalur utama: AI menyusun soal dari isi materi. Hasilnya tetap berupa
    # usulan; guru harus meninjau dan menerbitkan sendiri.
    if ai.tersedia():
        usulan = ai.buat_soal("\n\n".join(m.teks), data.jumlah, data.tipe)
        if usulan:
            drafts = []
            for s in usulan:
                dasar = {
                    "materiId": str(m.id),
                    "tipe": data.tipe,
                    "topik": "AI",
                    "tanya": s["tanya"],
                    "opsi": s["opsi"],
                    "jawaban": s["jawaban"],
                    "pembahasan": s["pembahasan"],
                    "kunciEssay": s["pembahasan"] if data.tipe == "essay" else "",
                    "kelas": kelas_materi(m),
                }
                drafts.append(dasar)
            return {"usulan": drafts}

    defs = []
    for t in m.teks:
        match = re.match(
            r"^(.{3,70}?)\s+(?:adalah|yaitu|merupakan)\s+(.{5,})$", t, re.I
        )
        if match:
            defs.append((match[1], match[2]))
    if len(defs) < 2:
        raise HTTPException(
            400, "Tambahkan sedikitnya dua kalimat definisi pada materi"
        )
    drafts = []
    for term, meaning in defs[: data.jumlah]:
        if data.tipe == "essay":
            drafts.append(
                {
                    "materiId": str(m.id),
                    "tipe": "essay",
                    "topik": "Uraian",
                    "tanya": f"Jelaskan pengertian {term} dan uraikan perannya berdasarkan materi yang telah dipelajari.",
                    "opsi": [],
                    "jawaban": 0,
                    "pembahasan": meaning,
                    "kunciEssay": meaning,
                    "kelas": kelas_materi(m),
                }
            )
            continue
        options = list(dict.fromkeys([meaning] + [v for k, v in defs if k != term][:3]))
        if len(options) < 2:
            continue
        random.SystemRandom().shuffle(options)
        drafts.append(
            {
                "materiId": str(m.id),
                "tipe": "pilihan_ganda",
                "topik": "Definisi",
                "tanya": f"Apa yang dimaksud dengan {term}?",
                "opsi": options,
                "jawaban": options.index(meaning),
                "pembahasan": f"{term} adalah {meaning}",
                "kunciEssay": "",
                "kelas": kelas_materi(m),
            }
        )
    return {"usulan": drafts}

@router.post("/terbitkan")
def terbitkan(
    data: SoalTerbitkanRequest,
    user=Depends(require_guru),
    db: Session = Depends(get_db),
):
    by_materi = {}
    for item in data.usulan:
        check(db, user, item)
        by_materi[item.materiId] = by_materi.get(item.materiId, 0) + 1
    for mid, count in by_materi.items():
        existing = db.scalar(select(func.count(Soal.id)).where(Soal.materi_id == mid)) or 0
        if existing + count > 50:
            raise HTTPException(
                400,
                f"Total soal melebihi batas 50 soal per materi (sudah ada {existing} soal, ditambah {count} soal)",
            )
    items = [make(x) for x in data.usulan]
    db.add_all(items)
    db.commit()
    audit("soal_published", actor=user.id, target=len(items))
    return {"soal": [soal_dict(x, True) for x in items]}


@router.post("")
def tambah(data: SoalCreate, user=Depends(require_guru), db: Session = Depends(get_db)):
    check(db, user, data)
    existing = db.scalar(select(func.count(Soal.id)).where(Soal.materi_id == data.materiId)) or 0
    if existing + 1 > 50:
        raise HTTPException(
            400,
            f"Maksimal 50 soal per materi (sudah ada {existing} soal)",
        )
    s = make(data)
    db.add(s)
    db.commit()
    db.refresh(s)
    audit("soal_created", actor=user.id, target=s.id)
    return soal_dict(s, True)


@router.get("/{sid}")
def detail(sid: int, user=Depends(require_pembelajaran), db: Session = Depends(get_db)):
    s = db.get(Soal, sid)
    if not s or not visible(db, user, s):
        raise HTTPException(404, "Soal tidak ditemukan")
    return soal_dict(s, user.peran == "guru")


@router.put("/{sid}")
def ubah(
    sid: int,
    data: SoalCreate,
    user=Depends(require_guru),
    db: Session = Depends(get_db),
):
    s = db.get(Soal, sid)
    if not s or not visible(db, user, s):
        raise HTTPException(404, "Soal tidak ditemukan")
    check(db, user, data)
    d = data.model_dump()
    d["materi_id"] = d.pop("materiId")
    if "kunciEssay" in d:
        d["kunci_essay"] = d.pop("kunciEssay")
    for k, v in d.items():
        setattr(s, k, v)
    db.commit()
    audit("soal_updated", actor=user.id, target=sid)
    return soal_dict(s, True)


@router.delete("/{sid}", status_code=204)
def hapus(sid: int, user=Depends(require_guru), db: Session = Depends(get_db)):
    s = db.get(Soal, sid)
    if not s or not visible(db, user, s):
        raise HTTPException(404, "Soal tidak ditemukan")
    db.delete(s)
    db.commit()
    audit("soal_deleted", actor=user.id, target=sid)
