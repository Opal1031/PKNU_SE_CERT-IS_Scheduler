"""테이블 생성과 시연용 샘플 데이터 입력.

실행: python -m app.seed
이미 사용자가 있으면 샘플을 다시 넣지 않는다(여러 번 실행해도 안전).
샘플 활동은 프론트엔드 src/seed.json의 활동·구성원 구성을 그대로 옮겼다.
"""

import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models import User, Workspace, WorkspaceMember

DEFAULT_PASSWORD = "certis1234!"

# (아이디, 표시 이름, 역할) — 프론트 데모 사용자 '나'(me)는 demo 계정으로 옮김
DEMO_USERS = [
    ("admin", "운영진", "officer"),
    ("demo", "데모 사용자", "member"),
    ("gitae", "기태", "member"),
    ("minseo", "민서", "member"),
    ("hyelim", "혜림", "member"),
    ("jisu", "지수", "member"),
    ("doyun", "도윤", "member"),
    ("subin", "수빈", "member"),
]

# (유형, 이름, 약칭, 분야, 목표, 팀장, 구성원)
DEMO_WORKSPACES = [
    (
        "project",
        "CERT-IS 통합 관리",
        "CI",
        "웹 보안",
        "동아리 운영을 하나의 공간으로",
        "demo",
        ["demo", "gitae", "minseo", "hyelim"],
    ),
    ("project", "웹 취약점 연구", "WS", "웹 보안", "웹 취약점 분석과 실습", "minseo", ["demo", "minseo", "gitae"]),
    (
        "study",
        "네트워크 보안",
        "NS",
        "네트워크",
        "네트워크 기본기와 보안 학습",
        "hyelim",
        ["demo", "gitae", "minseo", "hyelim"],
    ),
    (
        "project",
        "침해 대응 연구",
        "IR",
        "웹 보안",
        "로그 분석과 침해 대응 시나리오 연구",
        "jisu",
        ["jisu", "doyun", "subin"],
    ),
    ("study", "암호학 기초", "CR", "암호학", "암호 알고리즘과 기초 수학 학습", "doyun", ["jisu", "doyun"]),
]


def seed(db: Session, password: str = DEFAULT_PASSWORD) -> bool:
    """샘플을 넣었으면 True, 이미 데이터가 있어 건너뛰었으면 False."""
    if db.scalar(select(User.id).limit(1)) is not None:
        return False
    users = {
        username: User(username=username, name=name, role=role, password_hash=hash_password(password))
        for username, name, role in DEMO_USERS
    }
    db.add_all(users.values())
    db.flush()
    for kind, name, initial, field, goal, leader, members in DEMO_WORKSPACES:
        ws = Workspace(
            type=kind,
            name=name,
            initial=initial,
            field=field,
            goal=goal,
            status="진행 중",
            leader_id=users[leader].id,
            created_by=users[leader].id,
        )
        ws.memberships = [WorkspaceMember(user_id=users[m].id) for m in members]
        db.add(ws)
    db.commit()
    return True


def main() -> None:
    settings.check()  # 배포 빌드에서 DB 주소·비밀키가 빠졌으면 여기서 멈춘다.
    Base.metadata.create_all(engine)
    password = os.getenv("SEED_PASSWORD", DEFAULT_PASSWORD)
    with SessionLocal() as db:
        if seed(db, password):
            print(f"샘플 계정 {len(DEMO_USERS)}개와 활동 {len(DEMO_WORKSPACES)}개를 만들었음 (임원진: admin)")
        else:
            print("이미 데이터가 있어 샘플 입력을 건너뜀")


if __name__ == "__main__":
    main()
