"""AI 보안 분야 설문 결과와 변경 기록."""

from typing import Any

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, BigId, CreatedAtMixin


class SurveyResult(CreatedAtMixin, Base):
    """15문항 응답, 분야별 점수, Gemini 추천 문장을 함께 보관한다(AI 담당 기능)."""

    __tablename__ = "survey_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    answers: Mapped[list[Any]] = mapped_column(JSON)  # 문항별 0~4 또는 '잘 모르겠다'
    scores: Mapped[dict[str, Any]] = mapped_column(JSON)  # 분야 ID(W/R/S/F/C)별 점수
    recommendation: Mapped[str | None] = mapped_column(Text)


class AuditLog(CreatedAtMixin, Base):
    """계정 발급·역할 변경 같은 운영 변경을 누가 언제 했는지 남긴다."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(100))
    target_type: Mapped[str | None] = mapped_column(String(30))
    target_id: Mapped[str | None] = mapped_column(String(64))
