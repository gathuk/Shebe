"""SQLAlchemy models for the NetLimit internet usage control system."""
import datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from netlimit.db import Base

# Rule actions
ACTION_ALLOW = "allow"
ACTION_BLOCK = "block"
ACTION_TIME_RESTRICTED = "time_restricted"


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), unique=True, nullable=False)
    daily_time_quota_minutes = Column(Integer, nullable=False, default=180)
    daily_data_quota_mb = Column(Integer, nullable=False, default=2048)

    users = relationship("User", back_populates="department")
    rules = relationship("PolicyRule", back_populates="department")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True)
    name = Column(String(80), unique=True, nullable=False)
    description = Column(String(255), default="")

    domains = relationship("CategoryDomain", back_populates="category", cascade="all, delete-orphan")
    rules = relationship("PolicyRule", back_populates="category")


class CategoryDomain(Base):
    __tablename__ = "category_domains"
    __table_args__ = (UniqueConstraint("domain", name="uq_category_domain"),)

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    domain = Column(String(255), nullable=False)

    category = relationship("Category", back_populates="domains")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(80), unique=True, nullable=False)
    full_name = Column(String(150), nullable=False)
    email = Column(String(150), nullable=True)
    ip_address = Column(String(45), unique=True, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)

    is_exempt = Column(Boolean, default=False)  # exempt from all limits (e.g. IT admins)
    custom_time_quota_minutes = Column(Integer, nullable=True)  # overrides department quota
    custom_data_quota_mb = Column(Integer, nullable=True)

    department = relationship("Department", back_populates="users")
    rules = relationship("PolicyRule", back_populates="user")
    usage_records = relationship("UsageRecord", back_populates="user")
    alerts = relationship("Alert", back_populates="user")


class PolicyRule(Base):
    """A block/allow/time-restricted rule for a category, scoped to a user or a department.

    Resolution precedence: user-level rule > department-level rule > default allow.
    """

    __tablename__ = "policy_rules"

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    action = Column(String(20), nullable=False, default=ACTION_BLOCK)
    # Used only when action == ACTION_TIME_RESTRICTED: the window during which
    # the category is BLOCKED (e.g. 09:00-17:00 blocks it during work hours).
    restricted_start = Column(Time, nullable=True)
    restricted_end = Column(Time, nullable=True)

    category = relationship("Category", back_populates="rules")
    department = relationship("Department", back_populates="rules")
    user = relationship("User", back_populates="rules")


class UsageRecord(Base):
    """Aggregated per-user, per-category, per-day usage."""

    __tablename__ = "usage_records"
    __table_args__ = (
        UniqueConstraint("user_id", "category_id", "date", name="uq_usage_user_category_date"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    date = Column(Date, nullable=False, default=datetime.date.today)

    minutes_used = Column(Integer, nullable=False, default=0)
    data_mb_used = Column(Float, nullable=False, default=0.0)
    blocked_attempts = Column(Integer, nullable=False, default=0)

    user = relationship("User", back_populates="usage_records")
    category = relationship("Category")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False, default=datetime.date.today)
    alert_type = Column(String(40), nullable=False)  # e.g. quota_warning, quota_exceeded
    message = Column(String(500), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="alerts")
