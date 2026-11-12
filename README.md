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
cp .env.example .env          # lalu isi POSTGRES_PASSWORD dan AI_API_KEY
docker compose up -d --build
```

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
- `.env` asli (contohnya ada di `.env.example`)

Catatan: `frontend` di sini disajikan apa adanya (nginx di produksi memakai
folder `src/` yang sama, tanpa proses build).
