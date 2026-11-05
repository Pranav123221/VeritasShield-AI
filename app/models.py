
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Investigation(Base):
    __tablename__ = "investigations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)

    user_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        index=True,
    )

    investigation_type: Mapped[str] = mapped_column(
        String(20), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="running", index=True
    )

    input_text: Mapped[str | None] = mapped_column(Text)
    submitted_url: Mapped[str | None] = mapped_column(Text)

    verdict: Mapped[str | None] = mapped_column(String(30))
    assessment: Mapped[str | None] = mapped_column(Text)
    evidence_summary: Mapped[str | None] = mapped_column(Text)
    uncertainty: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(String(160))

    result_json: Mapped[dict | list | None] = mapped_column(JSON)
    error_code: Mapped[str | None] = mapped_column(String(80))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    sources: Mapped[list["EvidenceSource"]] = relationship(
        back_populates="investigation",
        cascade="all, delete-orphan",
    )

    events: Mapped[list["InvestigationEvent"]] = relationship(
        back_populates="investigation",
        cascade="all, delete-orphan",
    )

    files: Mapped[list["EvidenceFile"]] = relationship(
        back_populates="investigation",
        cascade="all, delete-orphan",
    )


class EvidenceSource(Base):
    __tablename__ = "evidence_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    investigation_id: Mapped[str] = mapped_column(
        ForeignKey("investigations.id", ondelete="CASCADE"),
        index=True,
    )

    title: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    publisher: Mapped[str | None] = mapped_column(String(300))

    relationship_type: Mapped[str] = mapped_column(
        String(30),
        default="Neutral",
    )

    evidence: Mapped[str | None] = mapped_column(Text)
    relevance: Mapped[str | None] = mapped_column(Text)
    reliability: Mapped[str | None] = mapped_column(String(30))
    reliability_reason: Mapped[str | None] = mapped_column(Text)
    limitations: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
    )

    investigation: Mapped["Investigation"] = relationship(
        back_populates="sources"
    )


class InvestigationEvent(Base):
    __tablename__ = "investigation_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    investigation_id: Mapped[str] = mapped_column(
        ForeignKey("investigations.id", ondelete="CASCADE"),
        index=True,
    )

    event_type: Mapped[str] = mapped_column(String(80))
    message: Mapped[str] = mapped_column(Text)
    details: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
    )

    investigation: Mapped["Investigation"] = relationship(
        back_populates="events"
    )


class EvidenceFile(Base):
    __tablename__ = "evidence_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    investigation_id: Mapped[str] = mapped_column(
        ForeignKey("investigations.id", ondelete="CASCADE"),
        index=True,
    )

    original_filename: Mapped[str | None] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str | None] = mapped_column(Text)

    # Fixed: matching relationship for Investigation.files
    investigation: Mapped["Investigation"] = relationship(
        back_populates="files"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
    )


Index(
    "ix_investigations_created_at",
    Investigation.created_at,
)
