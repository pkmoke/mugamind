import os
from dotenv import load_dotenv

load_dotenv()
ENV = os.getenv("APP_ENV", "development")
PRODUCTION = ENV == "production"
HTTPS_ONLY = PRODUCTION or ENV == "preview"
ORIGINS = [
    s.strip()
    for s in os.getenv(
        "APP_ORIGINS",
        "http://127.0.0.1:8899,http://localhost:8899,http://127.0.0.1:8000,http://localhost:8000,http://127.0.0.1:5500,http://localhost:5500",
    ).split(",")
    if s.strip()
]
HOSTS = [
    s.strip()
    for s in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",")
    if s.strip()
]
_TUNNEL = "pictures-rouge-blues-himself.trycloudflare.com"
if _TUNNEL not in HOSTS:
    HOSTS.append(_TUNNEL)
_torig = "https://" + _TUNNEL
if _torig not in ORIGINS:
    ORIGINS.append(_torig)

COOKIE = "__Host-bemai_session" if HTTPS_ONLY else "bemai_session"
SESSION_SECONDS = 8 * 3600
MAX_BODY = 512 * 1024
MAX_UPLOAD_BODY = 12 * 1024 * 1024
ENABLE_STUDENT_DEMO_LOGIN = os.getenv("ENABLE_STUDENT_DEMO_LOGIN", "false").strip().lower() == "true"
if HTTPS_ONLY and (
    not ORIGINS
    or any(not x.startswith("https://") for x in ORIGINS)
    or "*" in HOSTS
    or "testserver" in HOSTS
):
    raise RuntimeError(
        "Produksi memerlukan APP_ORIGINS HTTPS dan ALLOWED_HOSTS eksplisit"
    )

if PRODUCTION and not os.getenv("DATABASE_URL", "").startswith(
    ("postgresql://", "postgresql+psycopg://")
):
    raise RuntimeError("Produksi memerlukan DATABASE_URL PostgreSQL eksplisit")

# ── Retensi data belajar ─────────────────────────────────────────────
# Nilai latihan disimpan lama supaya bisa dipakai untuk rapor; aktivitas
# (log tanya-jawab) cukup lebih pendek.
RETENSI_NILAI_HARI = int(os.getenv("RETENSI_NILAI_HARI", "180"))
RETENSI_AKTIVITAS_HARI = int(os.getenv("RETENSI_AKTIVITAS_HARI", "90"))

# ── Asisten AI (MugaMind) ────────────────────────────────────────────
AI_ENABLED = os.getenv("AI_ENABLED", "true").strip().lower() == "true"
AI_API_KEY = os.getenv("AI_API_KEY", "") or os.getenv("DEEPSEEK_API_KEY", "")
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://api.deepseek.com").rstrip("/")
AI_MODEL = os.getenv("AI_MODEL", "deepseek-flash")
AI_TIMEOUT = int(os.getenv("AI_TIMEOUT", "25"))
AI_MAX_TOKENS = int(os.getenv("AI_MAX_TOKENS", "220"))
AI_KUOTA_HARIAN = int(os.getenv("AI_KUOTA_HARIAN", "10"))
AI_MAKS_KONTEKS = int(os.getenv("AI_MAKS_KONTEKS", "7000"))

CUSTOMER_SERVICE_URL = os.getenv("CUSTOMER_SERVICE_URL", "").strip()
if CUSTOMER_SERVICE_URL and not CUSTOMER_SERVICE_URL.startswith("https://"):
    raise RuntimeError("CUSTOMER_SERVICE_URL harus berupa URL HTTPS resmi")
