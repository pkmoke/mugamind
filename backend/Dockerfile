FROM python:3.14-slim

# tesseract untuk OCR gambar/PDF pindaian, poppler untuk pdftotext/pdftoppm
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       tesseract-ocr tesseract-ocr-ind poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements.txt \
    && groupadd --system bemai \
    && useradd --system --gid bemai --home-dir /app bemai

COPY app ./app
COPY manage.py maintenance.py create_admin.py ./

RUN mkdir -p /app/data/materi && chown -R bemai:bemai /app/data

USER bemai
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
