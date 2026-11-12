"""Klien AI MugaMind.

Satu tempat untuk semua panggilan model bahasa: dipakai oleh chat siswa dan
pembuat soal guru. Semua aturan ketat (hanya dari materi, jawaban pendek,
penolakan baku) ditegakkan di sini supaya tidak tersebar di router.
"""

import json
import re
import urllib.error
import urllib.request

from app.config import (
    AI_API_KEY,
    AI_ENABLED,
    AI_BASE_URL,
    AI_MAKS_KONTEKS,
    AI_MAX_TOKENS,
    AI_MODEL,
    AI_TIMEOUT,
)

TOLAK = "MugaMind tidak dirancang untuk menjawab pertanyaan ini."

_INSTRUKSI = """Kamu MugaMind, asisten belajar untuk siswa SMP Muhammadiyah 3 Ciledug.

Tujuanmu membuat siswa paham, bukan sekadar menyalin kalimat materi.

Aturan wajib:
1. Rujukan utama adalah KUTIPAN MATERI di bawah bila ada isinya.
2. Kalau kutipan materi tidak memuat jawabannya, tetap jawab dengan pengetahuan umum
   yang benar dan awali kalimat dengan "Di luar materi kelasmu: ". Jangan mengarang.
3. Boleh menjelaskan ulang bagian materi yang rumit, memberi contoh, atau meringkas
   inti materi dengan kata sendiri.
4. Maksimal 3 kalimat dan maksimal 320 karakter. Langsung ke jawaban, tanpa sapaan
   dan tanpa basa-basi seperti "tentu" atau "pertanyaan bagus". Kalau siswa minta
   "jelaskan", sebut inti proses atau sebabnya secara berurutan, bukan satu bagian saja.
5. Bahasa Indonesia sederhana dan santai, seperti guru menjelaskan ke siswa kelas {tingkat}.
6. Tolak HANYA bila permintaannya bukan soal belajar (gosip, politik, konten dewasa,
   atau menyuruh mengerjakan tugas orang lain); balas persis satu baris: {tolak}
7. Jangan menyebut dirimu model AI, jangan menulis daftar bernomor, jangan memakai tanda bintang.
"""


def tersedia() -> bool:
    return bool(AI_ENABLED and AI_API_KEY)


def nama_model() -> str:
    return AI_MODEL


def _potong(teks: str) -> str:
    """Batasi panjang jawaban tanpa memotong di tengah kata."""
    teks = re.sub(r"\s+", " ", teks).strip().strip('"').strip()
    teks = re.sub(r"^(jawaban|mugamind)\s*:\s*", "", teks, flags=re.I)
    if len(teks) <= 320:
        return teks
    potong = teks[:320]
    akhir = max(potong.rfind(". "), potong.rfind("! "), potong.rfind("? "))
    if akhir >= 150:
        return potong[: akhir + 1].strip()
    return potong.rsplit(" ", 1)[0].rstrip(",;:") + "."


def _rapikan(teks: str) -> str | None:
    if not teks:
        return None
    isi = _potong(teks)
    if not isi:
        return None
    if re.search(r"tidak dirancang untuk menjawab", isi, re.I):
        return TOLAK
    return isi


def _kirim(sistem: str, pengguna, maks_token: int) -> tuple[str, int]:
    body = {
        "model": AI_MODEL,
        "messages": [
            {"role": "system", "content": sistem},
            {"role": "user", "content": pengguna},
        ],
        "max_tokens": maks_token,
        "temperature": 0.2,
        "stream": False,
    }
    req = urllib.request.Request(
        AI_BASE_URL + "/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + AI_API_KEY,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=AI_TIMEOUT) as resp:
        data = json.loads(resp.read().decode())
    pesan = data["choices"][0]["message"]
    isi = (pesan.get("content") or "").strip()
    token = int(data.get("usage", {}).get("total_tokens") or 0)
    if not isi and pesan.get("reasoning_content"):
        body["max_tokens"] = min(1200, maks_token * 2)
        req = urllib.request.Request(
            AI_BASE_URL + "/chat/completions",
            data=json.dumps(body).encode(),
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + AI_API_KEY,
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=AI_TIMEOUT) as resp:
            data = json.loads(resp.read().decode())
        pesan = data["choices"][0]["message"]
        isi = (pesan.get("content") or "").strip()
        token += int(data.get("usage", {}).get("total_tokens") or 0)
    return isi, token


def jawab(pertanyaan: str, konteks: str, tingkat: str = "VIII") -> tuple[str | None, int]:
    """Jawab satu pertanyaan dari konteks materi. None kalau AI gagal."""
    if not tersedia():
        return None, 0
    konteks = (konteks or "")[:AI_MAKS_KONTEKS].strip()
    sistem = _INSTRUKSI.format(tingkat=tingkat, tolak=TOLAK)
    isi_konteks = konteks or "(tidak ada bagian materi kelas yang cocok)"
    pengguna = f"KUTIPAN MATERI:\n{isi_konteks}\n\nPERTANYAAN SISWA:\n{pertanyaan}"
    try:
        isi, token = _kirim(sistem, pengguna, AI_MAX_TOKENS)
    except (urllib.error.URLError, TimeoutError, OSError, KeyError, ValueError):
        return None, 0
    return _rapikan(isi), token


_SKEMA_SOAL = """Balas HANYA dengan JSON valid, tanpa penjelasan dan tanpa blok kode.
Format:
{"soal":[{"tanya":"...","opsi":["...","...","...","..."],"jawaban":0,"pembahasan":"..."}]}
Aturan: setiap soal punya tepat 4 pilihan, "jawaban" adalah indeks (0-3) pilihan
yang benar, pembahasan maksimal 2 kalimat, semua isi hanya dari materi, dan
setiap soal menguji satu fakta berbeda. Tulis dalam bahasa Indonesia. Bila materi
tidak cukup untuk membuat soal, balas {"soal":[]}."""


def deskripsi_gambar(data_url: str) -> str:
    """Bacakan isi gambar sekali saja; hasilnya disimpan sebagai keterangan."""
    if not tersedia() or not data_url.startswith("data:image/"):
        return ""
    sistem = (
        "Kamu pengajar IPA SMP. Deskripsikan gambar untuk siswa dalam 1-2 kalimat "
        "(maksimal 240 karakter): sebutkan objek utama, bagian yang diberi label, "
        "dan proses yang sedang ditunjukkan. Tanpa pembuka, tanpa tanda bintang."
    )
    konten = [
        {"type": "text", "text": "Jelaskan gambar ini."},
        {"type": "image_url", "image_url": {"url": data_url}},
    ]
    try:
        isi, _ = _kirim(sistem, konten, 200)
    except (urllib.error.URLError, TimeoutError, OSError, KeyError, ValueError):
        return ""
    isi = re.sub(r"\s+", " ", isi).strip().strip('"')
    return isi[:300]


def buat_soal(teks_materi: str, jumlah: int, tipe: str = "pilihan_ganda") -> list[dict]:
    if not tersedia():
        return []
    materi = teks_materi[:AI_MAKS_KONTEKS]
    jenis = "uraian (esai)" if tipe == "essay" else "pilihan ganda"
    if tipe == "essay":
        sistem = _SKEMA_SOAL.replace(
            '{"soal":[{"tanya":"...","opsi":["...","...","...","..."],"jawaban":0,"pembahasan":"..."}]}',
            '{"soal":[{"tanya":"...","opsi":[],"jawaban":0,"pembahasan":"..."}]}',
        ).replace(
            'setiap soal punya tepat 4 pilihan, "jawaban" adalah indeks (0-3) pilihan\nbenar, ',
            "",
        )
    else:
        sistem = _SKEMA_SOAL
    pengguna = (
        f"Buat {jumlah} soal {jenis} dari materi berikut.\n\nMATERI:\n{materi}"
    )
    try:
        isi, _ = _kirim(sistem, pengguna, 2400)
    except (urllib.error.URLError, TimeoutError, OSError, KeyError, ValueError):
        return []
    isi = re.sub(r"^```(?:json)?|```$", "", isi.strip(), flags=re.M).strip()
    # Model kadang menutup JSON dengan rapi tetapi terpotong; ambil objek utuh.
    if isi and not isi.rstrip().endswith("}"):
        akhir = isi.rfind("}")
        if akhir > 0:
            isi = isi[: akhir + 1] + "]}"
    try:
        data = json.loads(isi)
    except ValueError:
        awal, akhir = isi.find("{"), isi.rfind("}")
        if awal < 0 or akhir <= awal:
            return []
        try:
            data = json.loads(isi[awal : akhir + 1])
        except ValueError:
            return []
    hasil = []
    for item in (data.get("soal") or [])[:jumlah]:
        tanya = str(item.get("tanya") or "").strip()
        opsi = [str(x).strip() for x in (item.get("opsi") or []) if str(x).strip()]
        pembahasan = str(item.get("pembahasan") or "").strip()
        if len(tanya) < 8 or len(tanya) > 400:
            continue
        if tipe == "essay":
            if not pembahasan:
                continue
            hasil.append(
                {
                    "tanya": tanya,
                    "opsi": [],
                    "jawaban": 0,
                    "pembahasan": pembahasan[:800],
                }
            )
            continue
        if len(opsi) != 4:
            continue
        try:
            kunci = int(item.get("jawaban"))
        except (TypeError, ValueError):
            continue
        if not 0 <= kunci < 4:
            continue
        hasil.append(
            {
                "tanya": tanya,
                "opsi": opsi,
                "jawaban": kunci,
                "pembahasan": pembahasan[:800],
            }
        )
    return hasil
