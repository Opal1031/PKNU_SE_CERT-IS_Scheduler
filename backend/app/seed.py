"""테이블 생성과 시연용 샘플 데이터 입력.

실행: python -m app.seed
이미 사용자가 있으면 샘플을 다시 넣지 않는다(여러 번 실행해도 안전).
샘플 활동은 프론트엔드 src/seed.json의 활동을 옮기고, 구성원은 실제 팀원 계정으로 정리했다.
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

# (아이디, 표시 이름, 역할) — 운영진 계정과 팀원 계정
DEMO_USERS = [
    ("admin", "운영진", "officer"),
    ("kitae", "기태", "member"),
    ("minseo", "민서", "member"),
    ("hyerim", "혜림", "member"),
    ("yeonwoo", "연우", "member"),
]

# (유형, 이름, 약칭, 분야, 목표, 팀장, 구성원)
DEMO_WORKSPACES = [
    (
        "project",
        "CERT-IS 통합 관리",
        "CI",
        "웹 보안",
        "동아리 운영을 하나의 공간으로",
        "minseo",
        ["minseo", "kitae", "hyerim", "yeonwoo"],
    ),
    ("project", "웹 취약점 연구", "WS", "웹 보안", "웹 취약점 분석과 실습", "minseo", ["minseo", "kitae"]),
    (
        "study",
        "네트워크 보안",
        "NS",
        "네트워크",
        "네트워크 기본기와 보안 학습",
        "hyerim",
        ["kitae", "minseo", "hyerim"],
    ),
    ("project", "침해 대응 연구", "IR", "웹 보안", "로그 분석과 침해 대응 시나리오 연구", "yeonwoo", ["yeonwoo"]),
    ("study", "암호학 기초", "CR", "암호학", "암호 알고리즘과 기초 수학 학습", "yeonwoo", ["yeonwoo"]),
]


def seed(db: Session, password: str = DEFAULT_PASSWORD) -> bool:
    """샘플을 넣었으면 True, 이미 데이터가 있어 건너뛰었으면 False."""
    # 사용자가 한 명이라도 있으면 이미 초기화된 DB로 보고 건너뛴다.
    if db.scalar(select(User.id).limit(1)) is not None:
        return False

    # 샘플 계정을 같은 비밀번호로 만들고, 활동에 연결할 수 있게 flush로 ID를 먼저 받는다.
    users = {
        username: User(username=username, name=name, role=role, password_hash=hash_password(password))
        for username, name, role in DEMO_USERS
    }
    db.add_all(users.values())
    db.flush()

    # 샘플 활동을 '진행 중' 상태로 만들고 팀장(생성자)과 구성원을 연결한다.
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
    """없는 테이블을 만들고 샘플 데이터를 넣는다. 샘플 계정 비밀번호는 SEED_PASSWORD로 바꿀 수 있다."""
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
