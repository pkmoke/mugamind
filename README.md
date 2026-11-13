# MugaMind — kode sumber

Aplikasi belajar untuk SMP: front-end vanilla JavaScript (tanpa bundler, tanpa
framework), back-end FastAPI, basis data PostgreSQL (bisa juga SQLite untuk
menjalankan di laptop sendiri).

## Isi repo

- `frontend/` — `index.html`, `src/js/` (26 modul, ±4.842 baris), `src/styles/`
  (4 berkas CSS, ±4.021 baris), `assets/`
- `backend/` — `app/` (30 berkas Python, ±3.730 baris)
  - `app/routers/` — auth, materi, soal, latihan, penilaian, belajar (chat AI),
    notifikasi, admin, materi_gambar
  - `app/services/` — `ai.py` (klien model bahasa), `jawaban.py` (pencocokan kata kunci)
  - `app/access.py` — pembatasan per objek (siswa hanya kelasnya, guru hanya kelas
    yang ditugaskan)
  - `app/security.py`, `app/models/`, `app/schemas/`
  - `manage.py` — init basis data, impor siswa, backup, reset data uji
- `requirements.txt` — dependensi Python terkunci dengan hash

## Menjalankan dengan Docker

```bash
docker compose up -d --build
```

Tanpa konfigurasi tambahan, compose langsung jalan dengan nilai bawaan (kata sandi
basis data lokal `bemai_lokal_dev`). Untuk mengubahnya, set variabel sebelum
menjalankan compose, misalnya:

```bash
export POSTGRES_PASSWORD=sandi-acak-anda
export AI_API_KEY=kunci-layanan-ai          # opsional, kosong = fitur AI mati
docker compose up -d --build
```

Berkas `.env` tidak disertakan di repo, karena di situlah kunci API biasanya
disimpan. `.env` sudah masuk `.gitignore`; kalau ingin memakainya, buat sendiri di
laptop masing-masing, jangan di-commit.

Buka `http://127.0.0.1:8899/`. Isinya lima layanan: `db` (PostgreSQL 17),
`migrate` (menyiapkan tabel sekali jalan), `backend` (uvicorn di port 8000, tidak
dipublikasikan ke host), `maintenance` (pembersihan data lama tiap lima menit), dan
`frontend` (nginx yang juga meneruskan `/api/` ke backend). Data disimpan di dua
volume, `postgres_data` dan `materi_data`, jadi `docker compose down` tidak
menghapus isinya; `docker compose down -v` menghapusnya.

Menghentikan tanpa menghapus wadah: `docker compose stop`.

## Menjalankan tanpa Docker

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py init-db          # bikin tabel (SQLite: backend/bemai.db)
.venv/bin/python manage.py --help           # lihat perintah: user, import-siswa, backup, reset-uji
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Buka `http://127.0.0.1:8000/` — backend juga menyajikan `../frontend`, jadi tidak
perlu server statis terpisah. Untuk PostgreSQL, set `DATABASE_URL` sebelum
menjalankan uvicorn, mis. `postgresql+psycopg://user:sandi@127.0.0.1:5432/bemai`.

Variabel lingkungan yang dipakai dibaca di `backend/app/config.py`
(`APP_ORIGINS`, `ALLOWED_HOSTS`, `DATABASE_URL`, `AI_API_KEY`, `AI_MODEL`, kuota
AI, masa retensi nilai/aktivitas).

## Data siswa (tahun pelajaran 2026/2027)

Data peserta didik diambil dari daftar resmi sekolah: 436 siswa, 12 rombel
(VII A–D, VIII A–D, IX A–D). NIS dibuat berpola `2627` + nomor urut tiga digit
(`2627001`–`2627436`), urut per tingkat, lalu per rombel, lalu alfabet nama.

Daftar NIS dan kata sandi awal **tidak disimpan di repo** — berkasnya ada di
`data-akun/` di mesin server (diabaikan git). Kata sandi awal dibagikan ke siswa
lewat jalur sekolah dan wajib diganti saat pertama masuk.

Impor ulang (mis. data semester baru):

```
docker compose cp data-akun/siswa-2627.csv backend:/tmp/siswa-2627.csv
docker compose cp backend/impor_siswa.py backend:/app/impor_siswa.py
docker compose exec -e PYTHONPATH=/app backend python /app/impor_siswa.py \
  --file /tmp/siswa-2627.csv --sandi "<sandi-awal>"
```

Format CSV: `nama;nis;kelas` (kelas ditulis `VII A`). Akun yang NIS-nya sudah ada
akan dilewati, jadi skrip ini aman dijalankan berulang.

## Sudah diuji dari repo ini

Dengan SQLite (tanpa Docker): `manage.py init-db` → `manage.py user --peran admin`
→ `POST /api/auth/login` membalas 200, halaman `/`, `/src/styles/dasar.css`, dan
`/api/health` semua 200.

Dengan Docker: `docker compose up -d --build` dari repo ini membangun ulang kelima
layanan sampai `backend` healthy, halaman depan 200, `/api/health` `{"status":"ok"}`,
dan login guru 200 lewat nginx di port 8899.

## Yang belum ikut di repo ini

Kode di bawah ini diambil dari image Docker yang sedang berjalan, bukan dari
folder kerja aslinya, jadi berkas berikut belum ada:

- `docs/` (panduan menjalankan & operasional)
- `tests/` (37 tes otomatis) dan `scripts/probe_rbac.py`
- `.env` (memang sengaja tidak disertakan, isinya kunci API)

Catatan: `frontend` di sini disajikan apa adanya (nginx di produksi memakai
folder `src/` yang sama, tanpa proses build).
