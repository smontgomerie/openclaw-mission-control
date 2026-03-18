"""Schemas for board-scoped filesystem memory views."""

from __future__ import annotations

from uuid import UUID

from sqlmodel import Field, SQLModel

RUNTIME_ANNOTATION_TYPES = (UUID,)


class BoardFilesystemMemoryFileRead(SQLModel):
    """Metadata for a memory file in the board lead workspace."""

    path: str
    kind: str
    label: str
    date: str | None = None


class BoardFilesystemMemoryContentRead(BoardFilesystemMemoryFileRead):
    """Memory file metadata plus markdown content."""

    content: str


class BoardFilesystemMemoryOverviewRead(SQLModel):
    """Board-scoped overview of filesystem memory for the lead agent."""

    lead_agent_id: UUID
    lead_agent_name: str
    long_term_memory: BoardFilesystemMemoryContentRead | None = None
    daily_files: list[BoardFilesystemMemoryFileRead] = Field(default_factory=list)
    latest_daily_path: str | None = None
