from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.db.session import Base
from typing import Optional

class Additive(Base):
    __tablename__ = "additives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    e_number: Mapped[str] = mapped_column(String(16), nullable=False, unique=True, index=True)  # e.g. E102
    name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)

    # e.g. Low / Medium / High (or numeric later)
    risk_level: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    # short explanation shown in app
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class EvidenceSource(Base):
    __tablename__ = "evidence_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(256), nullable=False)  # display name
    url: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)

    publisher: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)

    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InteractionRule(Base):
    __tablename__ = "interaction_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    title: Mapped[str] = mapped_column(String(256), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)     # Low/Medium/High
    confidence: Mapped[str] = mapped_column(String(32), nullable=False)   # Low/Medium/High

    why: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    what_to_do: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InteractionRuleItem(Base):
    __tablename__ = "interaction_rule_items"
    __table_args__ = (UniqueConstraint("rule_id", "item_type", "item_key", name="uq_rule_item"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("interaction_rules.id", ondelete="CASCADE"), nullable=False)

    # "additive" or "ingredient"
    item_type: Mapped[str] = mapped_column(String(32), nullable=False)

    # e.g. "E102" or "sucrose"
    item_key: Mapped[str] = mapped_column(String(256), nullable=False)


class InteractionRuleSource(Base):
    __tablename__ = "interaction_rule_sources"
    __table_args__ = (UniqueConstraint("rule_id", "source_id", name="uq_rule_source"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("interaction_rules.id", ondelete="CASCADE"), nullable=False)
    source_id: Mapped[int] = mapped_column(ForeignKey("evidence_sources.id", ondelete="CASCADE"), nullable=False)