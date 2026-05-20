FROM node:24-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
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
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
