# Reference Dockerfile for ai-service
# Mirrors ../ai-service/Dockerfile

FROM python:3.9.20-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        cmake \
        libgl1-mesa-glx \
        libglib2.0-0 \
        libopenblas-dev \
        liblapack-dev \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --uid 10001 --create-home appuser

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p /app/data /app/models /app/dataset \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 5000

CMD ["python", "main.py"]
