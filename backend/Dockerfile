FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

# 컨테이너 안에서 root 권한으로 서버를 돌리지 않는다.
RUN useradd --create-home --uid 10001 certis && chown certis /app
USER certis

EXPOSE 8000
# 시작할 때 테이블 생성·샘플 입력(이미 있으면 건너뜀) 후 서버 실행
CMD ["sh", "-c", "python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
