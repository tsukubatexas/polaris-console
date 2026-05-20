FROM node:24-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM python:3.12-slim AS runtime
LABEL org.opencontainers.image.title="Polaris Console" \
    org.opencontainers.image.description="Dynamic Apache Polaris web console with a hardened FastAPI backend." \
    org.opencontainers.image.source="https://github.com/tsukubatexas/polaris-console" \
    org.opencontainers.image.licenses="Apache-2.0"
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN groupadd --gid 10001 polaris \
    && useradd --uid 10001 --gid 10001 --home-dir /app --shell /usr/sbin/nologin --no-create-home polaris
COPY pyproject.toml README.md ./
COPY backend ./backend
COPY --from=frontend /src/frontend/dist ./frontend/dist
RUN python -m pip install --no-cache-dir --root-user-action=ignore . \
    && chown -R polaris:polaris /app
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).read()"
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
