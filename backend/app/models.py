from __future__ import annotations

from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .db import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(64), index=True)

    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    current_state: Mapped[str] = mapped_column(String(64), default="DRAFT", index=True)

    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    submissions: Mapped[list["Submission"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), index=True)

    gate_id: Mapped[str] = mapped_column(String(64), index=True)
    gate_version: Mapped[str] = mapped_column(String(32))
    state_at_submit: Mapped[str] = mapped_column(String(64))

    # store JSON as text in SQLite MVP
    artifacts_payload: Mapped[str] = mapped_column(Text)
    result_payload: Mapped[str] = mapped_column(Text)

    decision: Mapped[str] = mapped_column(String(16), index=True)

    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="submissions")

