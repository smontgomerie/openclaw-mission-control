"""Schemas for gateway-scoped filesystem memory views."""

from __future__ import annotations

from uuid import UUID

from sqlmodel import Field, SQLModel

RUNTIME_ANNOTATION_TYPES = (UUID,)


class GatewayFilesystemMemoryFileRead(SQLModel):
    """Metadata for a memory file in the gateway-main workspace."""

    path: str
    kind: str
    label: str
    date: str | None = None


class GatewayFilesystemMemoryContentRead(GatewayFilesystemMemoryFileRead):
    """Memory file metadata plus markdown content."""

    content: str


class GatewayFilesystemMemoryOverviewRead(SQLModel):
    """Gateway-scoped overview of filesystem memory for the gateway main agent."""

    gateway_id: UUID
    gateway_name: str
    main_agent_id: str
    main_agent_name: str
    long_term_memory: GatewayFilesystemMemoryContentRead | None = None
    daily_files: list[GatewayFilesystemMemoryFileRead] = Field(default_factory=list)
    latest_daily_path: str | None = None
