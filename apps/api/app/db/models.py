from typing import Optional, List
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, ForeignKey, UniqueConstraint, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base

class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    barcode: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)

    name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    brand: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)

    # OFF cached fields (safe defaults handled in API even if DB has NULL)
    ingredients_text: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    allergens: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)     # list[str]
    traces: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)        # list[str]
    additives: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)     # list[str]
    analysis: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)      # list[str]
    diet_flags: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)    # {vegan, vegetarian}

    nutriscore_grade: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    ecoscore_grade: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    ecoscore_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    off_last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    scores: Mapped["ProductScore"] = relationship(
        back_populates="product",
        uselist=False,
        cascade="all, delete-orphan",
    )

class ProductScore(Base):
    __tablename__ = "product_scores"
    __table_args__ = (UniqueConstraint("product_id", name="uq_product_scores_product_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)

    health_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    eco_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    additive_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    model_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    product: Mapped["Product"] = relationship(back_populates="scores")
