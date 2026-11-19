"""OpenAI 설정 점검 (WBS 6.1).

실행: cd backend && python scripts/check_openai.py

backend/.env 의 OPENAI_API_KEY 를 읽어 형식을 확인하고, 실제로 OpenAI에 연결되는지
가벼운 요청 한 번으로 확인한다. 키 값은 어디에도 출력하지 않는다(길이와 앞 3자만 표시).
"""

import os
import pathlib
import sys

ENV_PATH = pathlib.Path(__file__).resolve().parents[1] / ".env"


def load_env(path: pathlib.Path) -> dict[str, str]:
    """.env 를 읽어 key=value 를 돌려준다. 주석과 빈 줄은 건너뛴다."""
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value
    return values


def check_format(raw: str) -> list[str]:
    """키 문자열에서 흔한 실수를 찾아 메시지 목록으로 돌려준다."""
    problems: list[str] = []
    value = raw.strip()
    if not value:
        problems.append("값이 비어 있음 — backend/.env 의 OPENAI_API_KEY= 뒤에 키를 넣어야 함")
        return problems
    if raw != value:
        problems.append("값 앞뒤에 공백이 있음 — 공백을 지울 것")
    if value[0] in "\"'" or value[-1] in "\"'":
        problems.append("따옴표로 감싸져 있음 — 따옴표 없이 넣을 것")
    if " " in value:
        problems.append("값 중간에 공백이 있음 — 붙여넣다가 잘렸을 수 있음")
    if not value.startswith("sk-"):
        problems.append("'sk-' 로 시작하지 않음 — OpenAI 키가 맞는지 확인할 것")
    if len(value) < 40:
        problems.append(f"길이가 {len(value)}자로 짧음 — 복사가 잘렸을 수 있음")
    return problems


def main() -> int:
    env = load_env(ENV_PATH)
    raw = env.get("OPENAI_API_KEY", os.getenv("OPENAI_API_KEY", ""))

    print(f"[1] 파일: {ENV_PATH}")
    if not ENV_PATH.exists():
        print("    없음 — cp .env.example .env 로 만들고 키를 넣을 것")
        return 1
    print("    있음")

    print("[2] 키 형식")
    problems = check_format(raw)
    key = raw.strip()
    if key:
        print(f"    길이 {len(key)}자, 앞 3자 {key[:3]}…")
    for problem in problems:
        print(f"    ! {problem}")
    if not problems:
        print("    문제 없음")
    if not key:
        return 1

    model = (env.get("OPENAI_MODEL") or "gpt-4o-mini").strip()
    print(f"[3] 연결 확인 (모델 {model})")
    try:
        from openai import OpenAI
    except ImportError:
        print("    openai 패키지 없음 — pip install -r requirements.txt 먼저 실행할 것")
        return 1

    base_url = (env.get("OPENAI_BASE_URL") or "").strip() or None
    client = OpenAI(api_key=key, base_url=base_url, timeout=20)
    try:
        # 사용 가능한 모델 목록을 받아 키가 실제로 통하는지 본다(토큰 비용 없음).
        names = {m.id for m in client.models.list()}
    except Exception as error:  # noqa: BLE001 - 어떤 실패든 사람이 읽을 메시지로 바꾼다
        name = type(error).__name__
        if "Authentication" in name:
            print("    실패: 키가 거부됨(401) — 키가 틀렸거나 폐기되었음")
        elif "PermissionDenied" in name:
            print("    실패: 권한 없음(403) — 조직·프로젝트 설정 확인")
        elif "RateLimit" in name:
            print("    실패: 한도 초과(429) — 결제·사용량 확인")
        elif "APIConnection" in name or "Timeout" in name:
            print("    실패: 연결 불가 — 네트워크 또는 방화벽 확인")
        else:
            print(f"    실패: {name}")
        return 1

    print(f"    성공 — 사용 가능한 모델 {len(names)}개")
    if model in names:
        print(f"    '{model}' 사용 가능")
    else:
        print(f"    ! '{model}' 이(가) 목록에 없음 — OPENAI_MODEL 값을 확인할 것")
        return 1

    print("\n모두 통과. AI 추천 기능을 붙일 수 있음.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
