import logging
import re
import uuid
from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from pathlib import Path
from app.config import ORIGINS, HOSTS, PRODUCTION, HTTPS_ONLY, MAX_BODY, MAX_UPLOAD_BODY, ENABLE_STUDENT_DEMO_LOGIN, CUSTOMER_SERVICE_URL
from app.security import audit
from app.routers import auth, materi, soal, latihan, belajar, admin, penilaian, materi_gambar, notifikasi

logging.basicConfig(level=logging.INFO)
app = FastAPI(
    title="MugaMind",
    docs_url=None if HTTPS_ONLY else "/docs",
    redoc_url=None,
    openapi_url=None if HTTPS_ONLY else "/openapi.json",
)
for router in (
    auth.router,
    materi.router,
    materi_gambar.router,
    notifikasi.router,
    soal.router,
    latihan.router,
    penilaian.router,
    belajar.router,
    admin.router,
):
    app.include_router(router)


def error(status, message, headers=None):
    return JSONResponse(
        status_code=status, content={"error": {"pesan": message}}, headers=headers
    )


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    if exc.status_code == 403:
        audit(
            "access_denied",
            actor=getattr(request.state, "user_id", None),
            request_id=request.state.request_id,
        )
    return error(exc.status_code, str(exc.detail), exc.headers)


@app.exception_handler(RequestValidationError)
async def invalid(request, exc):
    return error(
        400, "Data tidak valid; periksa panjang, format, dan kelengkapan isian"
    )


@app.exception_handler(IntegrityError)
async def constraint(request, exc):
    audit("constraint_error", request_id=request.state.request_id)
    return error(
        409, "Data bertentangan atau masih digunakan; muat ulang dan periksa isian"
    )


@app.exception_handler(SQLAlchemyError)
async def database_error(request, exc):
    audit("database_error", request_id=request.state.request_id)
    return error(503, "Layanan data sementara tidak tersedia")


@app.exception_handler(Exception)
async def unexpected(request, exc):
    audit("unexpected_error", request_id=getattr(request.state, "request_id", None))
    return error(500, "Terjadi kesalahan internal")


# ASGI middleware reads a bounded body, including requests without Content-Length.
class SecurityMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        request = Request(scope)
        rid = uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = rid

        async def safe_send(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(
                    [
                        (b"x-content-type-options", b"nosniff"),
                        (b"x-frame-options", b"DENY"),
                        (b"referrer-policy", b"same-origin"),
                        (b"x-request-id", rid.encode()),
                        (b"cache-control", b"no-store"),
                        (
                            b"permissions-policy",
                            b"camera=(), microphone=(), geolocation=()",
                        ),
                        (
                            b"content-security-policy",
                            b"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
                        ),
                    ]
                )
                if PRODUCTION or HTTPS_ONLY:
                    headers.append((b"strict-transport-security", b"max-age=31536000"))
                message["headers"] = headers
            await send(message)

        async def reject(status, msg):
            await error(status, msg)(scope, receive, safe_send)

        if (PRODUCTION or HTTPS_ONLY) and scope.get("scheme") != "https":
            return await reject(400, "HTTPS diperlukan")
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            asal = request.headers.get("origin")
            asal_dev = (
                not PRODUCTION
                and asal
                and re.fullmatch(r"http://(127\.0\.0\.1|localhost)(:\d+)?", asal)
            )
            if asal not in ORIGINS and not asal_dev:
                return await reject(403, "Origin tidak diizinkan")
            content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
            is_ocr_upload = request.url.path == "/api/soal/ekstrak-ocr" and content_type == "application/octet-stream"
            if content_type != "application/json" and not is_ocr_upload:
                return await reject(415, "Gunakan application/json atau unggahan berkas OCR yang didukung")
        unggah_gambar = request.url.path.startswith("/api/materi/") and "/gambar" in request.url.path
        max_body = (
            MAX_UPLOAD_BODY
            if request.url.path == "/api/soal/ekstrak-ocr" or unggah_gambar
            else MAX_BODY
        )
        size = 0
        chunks = []
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body = message.get("body", b"")
            size += len(body)
            if size > max_body:
                return await reject(413, "Ukuran permintaan melebihi batas yang diizinkan")
            chunks.append(body)
            if not message.get("more_body", False):
                break
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {
                    "type": "http.request",
                    "body": b"".join(chunks),
                    "more_body": False,
                }
            return await receive()

        await self.app(scope, replay, safe_send)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/info")
def info():
    return {
        "studentTrialEnabled": ENABLE_STUDENT_DEMO_LOGIN,
        "customerServiceUrl": CUSTOMER_SERVICE_URL or None,
    }


# Same-origin hosting works both locally and through nginx; no hardcoded API host.
frontend = Path(__file__).resolve().parents[2] / "frontend"
if frontend.exists():
    app.mount("/src", StaticFiles(directory=frontend / "src"), name="src")
    app.mount("/assets", StaticFiles(directory=frontend / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(frontend / "index.html")


app.add_middleware(SecurityMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=600)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_origin_regex=None
    if PRODUCTION
    else r"^http://(127\.0\.0\.1|localhost)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=HOSTS)
