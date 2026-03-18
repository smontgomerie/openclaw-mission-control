"""Read-only access to board lead workspace memory files."""

from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException, status
from sqlmodel import col

from app.models.agents import Agent
from app.models.boards import Board
from app.models.gateways import Gateway
from app.schemas.board_filesystem_memory import (
    BoardFilesystemMemoryContentRead,
    BoardFilesystemMemoryFileRead,
    BoardFilesystemMemoryOverviewRead,
)
from app.schemas.gateway_filesystem_memory import (
    GatewayFilesystemMemoryContentRead,
    GatewayFilesystemMemoryFileRead,
    GatewayFilesystemMemoryOverviewRead,
)
from app.services.openclaw.db_service import OpenClawDBService
from app.services.openclaw.gateway_dispatch import GatewayDispatchService
from app.services.openclaw.gateway_rpc import GatewayConfig as GatewayClientConfig
from app.services.openclaw.gateway_rpc import OpenClawGatewayError, openclaw_call
from app.services.openclaw.internal.agent_key import agent_key
from app.services.openclaw.internal.retry import with_coordination_gateway_retry
from app.services.openclaw.shared import GatewayAgentIdentity

MEMORY_FILE_NAME = "MEMORY.md"
DAILY_MEMORY_RE = re.compile(r"^memory/(?P<date>\d{4}-\d{2}-\d{2})\.md$")
_MISSING_FILE_MARKERS = (
    "not found",
    "no such file",
    "enoent",
    "missing file",
    "does not exist",
)


def _extract_content(payload: object) -> str | None:
    if isinstance(payload, str):
        return payload
    if isinstance(payload, dict):
        content = payload.get("content")
        if isinstance(content, str):
            return content
        file_obj = payload.get("file")
        if isinstance(file_obj, dict):
            nested = file_obj.get("content")
            if isinstance(nested, str):
                return nested
    return None


def _daily_file_read(path: str) -> BoardFilesystemMemoryFileRead | None:
    match = DAILY_MEMORY_RE.fullmatch(path)
    if not match:
        return None
    date_value = match.group("date")
    return BoardFilesystemMemoryFileRead(
        path=path,
        kind="daily",
        label=date_value,
        date=date_value,
    )


def _long_term_file_read(content: str) -> BoardFilesystemMemoryContentRead:
    return BoardFilesystemMemoryContentRead(
        path=MEMORY_FILE_NAME,
        kind="long_term",
        label="Long-term memory",
        content=content,
    )


def _gateway_long_term_file_read(content: str) -> GatewayFilesystemMemoryContentRead:
    return GatewayFilesystemMemoryContentRead(
        path=MEMORY_FILE_NAME,
        kind="long_term",
        label="Long-term memory",
        content=content,
    )


def _is_missing_file_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(marker in message for marker in _MISSING_FILE_MARKERS)


class BoardFilesystemMemoryService(OpenClawDBService):
    """Read lead workspace memory files through gateway file APIs."""

    async def _require_board_lead(self, board: Board) -> Agent:
        lead = (
            await Agent.objects.filter_by(board_id=board.id)
            .filter(col(Agent.is_board_lead).is_(True))
            .first(self.session)
        )
        if lead is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Board lead agent is required",
            )
        return lead

    async def _gateway_config(self, board: Board) -> GatewayClientConfig:
        _gateway, config = await GatewayDispatchService(
            self.session,
        ).require_gateway_config_for_board(board)
        return config

    async def _list_agent_files(self, lead: Agent, board: Board) -> dict[str, dict[str, Any]]:
        config = await self._gateway_config(board)

        async def _do_list() -> object:
            return await openclaw_call(
                "agents.files.list",
                {"agentId": agent_key(lead)},
                config=config,
            )

        payload = await with_coordination_gateway_retry(_do_list)
        if not isinstance(payload, dict):
            return {}
        files = payload.get("files") or []
        if not isinstance(files, list):
            return {}
        by_name: dict[str, dict[str, Any]] = {}
        for item in files:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            if not isinstance(name, str) or not name:
                path = item.get("path")
                if isinstance(path, str) and path:
                    name = path
            if isinstance(name, str) and name:
                by_name[name] = dict(item)
        return by_name

    async def _read_file(self, lead: Agent, board: Board, path: str) -> str | None:
        config = await self._gateway_config(board)

        async def _do_get() -> object:
            return await openclaw_call(
                "agents.files.get",
                {"agentId": agent_key(lead), "name": path},
                config=config,
            )

        try:
            payload = await with_coordination_gateway_retry(_do_get)
        except OpenClawGatewayError as exc:
            if _is_missing_file_error(exc):
                return None
            raise
        content = _extract_content(payload)
        if content is None:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Invalid gateway response",
            )
        return content

    async def get_overview(self, board: Board) -> BoardFilesystemMemoryOverviewRead:
        try:
            lead = await self._require_board_lead(board)
            files = await self._list_agent_files(lead, board)
            long_term_content = await self._read_file(lead, board, MEMORY_FILE_NAME)
            daily_files = [
                daily
                for daily in (_daily_file_read(path) for path in files)
                if daily is not None
            ]
            daily_files.sort(key=lambda item: item.date or "", reverse=True)
            latest_daily_path = daily_files[0].path if daily_files else None
            return BoardFilesystemMemoryOverviewRead(
                lead_agent_id=lead.id,
                lead_agent_name=lead.name,
                long_term_memory=(
                    _long_term_file_read(long_term_content)
                    if long_term_content is not None
                    else None
                ),
                daily_files=daily_files,
                latest_daily_path=latest_daily_path,
            )
        except OpenClawGatewayError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gateway filesystem memory read failed: {exc}",
            ) from exc


class GatewayFilesystemMemoryService(OpenClawDBService):
    """Read-only access to gateway-main workspace memory files."""

    async def _gateway_config(self, gateway: Gateway) -> GatewayClientConfig:
        return GatewayClientConfig(
            url=gateway.url,
            token=gateway.token,
            allow_insecure_tls=gateway.allow_insecure_tls,
            disable_device_pairing=gateway.disable_device_pairing,
        )

    async def _list_gateway_files(self, gateway: Gateway) -> dict[str, dict[str, Any]]:
        config = await self._gateway_config(gateway)

        async def _do_list() -> object:
            return await openclaw_call(
                "agents.files.list",
                {"agentId": GatewayAgentIdentity.openclaw_agent_id(gateway)},
                config=config,
            )

        payload = await with_coordination_gateway_retry(_do_list)
        if not isinstance(payload, dict):
            return {}
        files = payload.get("files") or []
        if not isinstance(files, list):
            return {}
        by_name: dict[str, dict[str, Any]] = {}
        for item in files:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            if not isinstance(name, str) or not name:
                path = item.get("path")
                if isinstance(path, str) and path:
                    name = path
            if isinstance(name, str) and name:
                by_name[name] = dict(item)
        return by_name

    async def _read_gateway_file(self, gateway: Gateway, path: str) -> str | None:
        config = await self._gateway_config(gateway)

        async def _do_get() -> object:
            return await openclaw_call(
                "agents.files.get",
                {
                    "agentId": GatewayAgentIdentity.openclaw_agent_id(gateway),
                    "name": path,
                },
                config=config,
            )

        try:
            payload = await with_coordination_gateway_retry(_do_get)
        except OpenClawGatewayError as exc:
            if _is_missing_file_error(exc):
                return None
            raise
        content = _extract_content(payload)
        if content is None:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Invalid gateway response",
            )
        return content

    async def get_overview(self, gateway: Gateway) -> GatewayFilesystemMemoryOverviewRead:
        try:
            files = await self._list_gateway_files(gateway)
            long_term_content = await self._read_gateway_file(gateway, MEMORY_FILE_NAME)
            daily_files = [
                daily
                for daily in (_daily_file_read(path) for path in files)
                if daily is not None
            ]
            daily_files.sort(key=lambda item: item.date or "", reverse=True)
            latest_daily_path = daily_files[0].path if daily_files else None
            return GatewayFilesystemMemoryOverviewRead(
                gateway_id=gateway.id,
                gateway_name=gateway.name,
                main_agent_id=GatewayAgentIdentity.openclaw_agent_id(gateway),
                main_agent_name=f"{gateway.name} main",
                long_term_memory=(
                    _gateway_long_term_file_read(long_term_content)
                    if long_term_content is not None
                    else None
                ),
                daily_files=[
                    GatewayFilesystemMemoryFileRead.model_validate(
                        daily.model_dump(),
                    )
                    for daily in daily_files
                ],
                latest_daily_path=latest_daily_path,
            )
        except OpenClawGatewayError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gateway filesystem memory read failed: {exc}",
            ) from exc

    async def get_file(
        self,
        *,
        gateway: Gateway,
        path: str,
    ) -> GatewayFilesystemMemoryContentRead:
        normalized = path.strip()
        daily_file = _daily_file_read(normalized)
        if normalized != MEMORY_FILE_NAME and daily_file is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Memory file not found",
            )
        try:
            content = await self._read_gateway_file(gateway, normalized)
            if content is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Memory file not found",
                )
            if normalized == MEMORY_FILE_NAME:
                return _gateway_long_term_file_read(content)
            assert daily_file is not None
            return GatewayFilesystemMemoryContentRead(
                **daily_file.model_dump(),
                content=content,
            )
        except OpenClawGatewayError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gateway filesystem memory read failed: {exc}",
            ) from exc

    async def get_file(
        self,
        *,
        board: Board,
        path: str,
    ) -> BoardFilesystemMemoryContentRead:
        normalized = path.strip()
        daily_file = _daily_file_read(normalized)
        if normalized != MEMORY_FILE_NAME and daily_file is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Memory file not found",
            )
        try:
            lead = await self._require_board_lead(board)
            content = await self._read_file(lead, board, normalized)
            if content is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Memory file not found",
                )
            if normalized == MEMORY_FILE_NAME:
                return _long_term_file_read(content)
            assert daily_file is not None
            return BoardFilesystemMemoryContentRead(
                **daily_file.model_dump(),
                content=content,
            )
        except OpenClawGatewayError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gateway filesystem memory read failed: {exc}",
            ) from exc
