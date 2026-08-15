export const getListActivityApiV1ActivityGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/activity?${stringifiedParams}`
        : `/api/v1/activity`;
};
export const listActivityApiV1ActivityGet = async (params, options) => {
    const res = await fetch(getListActivityApiV1ActivityGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListTaskCommentFeedApiV1ActivityTaskCommentsGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/activity/task-comments?${stringifiedParams}`
        : `/api/v1/activity/task-comments`;
};
export const listTaskCommentFeedApiV1ActivityTaskCommentsGet = async (params, options) => {
    const res = await fetch(getListTaskCommentFeedApiV1ActivityTaskCommentsGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getStreamTaskCommentFeedApiV1ActivityTaskCommentsStreamGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/activity/task-comments/stream?${stringifiedParams}`
        : `/api/v1/activity/task-comments/stream`;
};
export const streamTaskCommentFeedApiV1ActivityTaskCommentsStreamGet = async (params, options) => {
    const res = await fetch(getStreamTaskCommentFeedApiV1ActivityTaskCommentsStreamGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListAgentsApiV1AgentAgentsGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/agent/agents?${stringifiedParams}`
        : `/api/v1/agent/agents`;
};
export const listAgentsApiV1AgentAgentsGet = async (params, options) => {
    const res = await fetch(getListAgentsApiV1AgentAgentsGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getAgentLeadCreateAgentUrl = () => {
    return `/api/v1/agent/agents`;
};
export const agentLeadCreateAgent = async (agentCreate, options) => {
    const res = await fetch(getAgentLeadCreateAgentUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(agentCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListBoardsApiV1AgentBoardsGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/agent/boards?${stringifiedParams}`
        : `/api/v1/agent/boards`;
};
export const listBoardsApiV1AgentBoardsGet = async (params, options) => {
    const res = await fetch(getListBoardsApiV1AgentBoardsGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetBoardApiV1AgentBoardsBoardIdGetUrl = (boardId) => {
    return `/api/v1/agent/boards/${boardId}`;
};
export const getBoardApiV1AgentBoardsBoardIdGet = async (boardId, options) => {
    const res = await fetch(getGetBoardApiV1AgentBoardsBoardIdGetUrl(boardId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getAgentLeadDeleteBoardAgentUrl = (boardId, agentId) => {
    return `/api/v1/agent/boards/${boardId}/agents/${agentId}`;
};
export const agentLeadDeleteBoardAgent = async (boardId, agentId, options) => {
    const res = await fetch(getAgentLeadDeleteBoardAgentUrl(boardId, agentId), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getAgentLeadNudgeAgentUrl = (boardId, agentId) => {
    return `/api/v1/agent/boards/${boardId}/agents/${agentId}/nudge`;
};
export const agentLeadNudgeAgent = async (boardId, agentId, agentNudge, options) => {
    const res = await fetch(getAgentLeadNudgeAgentUrl(boardId, agentId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(agentNudge),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetAgentSoulApiV1AgentBoardsBoardIdAgentsAgentIdSoulGetUrl = (boardId, agentId) => {
    return `/api/v1/agent/boards/${boardId}/agents/${agentId}/soul`;
};
export const getAgentSoulApiV1AgentBoardsBoardIdAgentsAgentIdSoulGet = async (boardId, agentId, options) => {
    const res = await fetch(getGetAgentSoulApiV1AgentBoardsBoardIdAgentsAgentIdSoulGetUrl(boardId, agentId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getAgentLeadUpdateAgentSoulUrl = (boardId, agentId) => {
    return `/api/v1/agent/boards/${boardId}/agents/${agentId}/soul`;
};
export const agentLeadUpdateAgentSoul = async (boardId, agentId, soulUpdateRequest, options) => {
    const res = await fetch(getAgentLeadUpdateAgentSoulUrl(boardId, agentId), {
        ...options,
        method: "PUT",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(soulUpdateRequest),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListApprovalsApiV1AgentBoardsBoardIdApprovalsGetUrl = (boardId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/agent/boards/${boardId}/approvals?${stringifiedParams}`
        : `/api/v1/agent/boards/${boardId}/approvals`;
};
export const listApprovalsApiV1AgentBoardsBoardIdApprovalsGet = async (boardId, params, options) => {
    const res = await fetch(getListApprovalsApiV1AgentBoardsBoardIdApprovalsGetUrl(boardId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateApprovalApiV1AgentBoardsBoardIdApprovalsPostUrl = (boardId) => {
    return `/api/v1/agent/boards/${boardId}/approvals`;
};
export const createApprovalApiV1AgentBoardsBoardIdApprovalsPost = async (boardId, approvalCreate, options) => {
    const res = await fetch(getCreateApprovalApiV1AgentBoardsBoardIdApprovalsPostUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(approvalCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getAgentLeadAskUserViaGatewayMainUrl = (boardId) => {
    return `/api/v1/agent/boards/${boardId}/gateway/main/ask-user`;
};
export const agentLeadAskUserViaGatewayMain = async (boardId, gatewayMainAskUserRequest, options) => {
    const res = await fetch(getAgentLeadAskUserViaGatewayMainUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(gatewayMainAskUserRequest),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListBoardMemoryApiV1AgentBoardsBoardIdMemoryGetUrl = (boardId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/agent/boards/${boardId}/memory?${stringifiedParams}`
        : `/api/v1/agent/boards/${boardId}/memory`;
};
export const listBoardMemoryApiV1AgentBoardsBoardIdMemoryGet = async (boardId, params, options) => {
    const res = await fetch(getListBoardMemoryApiV1AgentBoardsBoardIdMemoryGetUrl(boardId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateBoardMemoryApiV1AgentBoardsBoardIdMemoryPostUrl = (boardId) => {
    return `/api/v1/agent/boards/${boardId}/memory`;
};
export const createBoardMemoryApiV1AgentBoardsBoardIdMemoryPost = async (boardId, boardMemoryCreate, options) => {
    const res = await fetch(getCreateBoardMemoryApiV1AgentBoardsBoardIdMemoryPostUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardMemoryCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateOnboardingApiV1AgentBoardsBoardIdOnboardingPostUrl = (boardId) => {
    return `/api/v1/agent/boards/${boardId}/onboarding`;
};
export const updateOnboardingApiV1AgentBoardsBoardIdOnboardingPost = async (boardId, boardOnboardingAgentCompleteBoardOnboardingAgentQuestion, options) => {
    const res = await fetch(getUpdateOnboardingApiV1AgentBoardsBoardIdOnboardingPostUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardOnboardingAgentCompleteBoardOnboardingAgentQuestion),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListTagsApiV1AgentBoardsBoardIdTagsGetUrl = (boardId) => {
    return `/api/v1/agent/boards/${boardId}/tags`;
};
export const listTagsApiV1AgentBoardsBoardIdTagsGet = async (boardId, options) => {
    const res = await fetch(getListTagsApiV1AgentBoardsBoardIdTagsGetUrl(boardId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListTasksApiV1AgentBoardsBoardIdTasksGetUrl = (boardId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/agent/boards/${boardId}/tasks?${stringifiedParams}`
        : `/api/v1/agent/boards/${boardId}/tasks`;
};
export const listTasksApiV1AgentBoardsBoardIdTasksGet = async (boardId, params, options) => {
    const res = await fetch(getListTasksApiV1AgentBoardsBoardIdTasksGetUrl(boardId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getAgentLeadCreateTaskUrl = (boardId) => {
    return `/api/v1/agent/boards/${boardId}/tasks`;
};
export const agentLeadCreateTask = async (boardId, taskCreate, options) => {
    const res = await fetch(getAgentLeadCreateTaskUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(taskCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getDeleteTaskApiV1AgentBoardsBoardIdTasksTaskIdDeleteUrl = (boardId, taskId) => {
    return `/api/v1/agent/boards/${boardId}/tasks/${taskId}`;
};
export const deleteTaskApiV1AgentBoardsBoardIdTasksTaskIdDelete = async (boardId, taskId, options) => {
    const res = await fetch(getDeleteTaskApiV1AgentBoardsBoardIdTasksTaskIdDeleteUrl(boardId, taskId), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateTaskApiV1AgentBoardsBoardIdTasksTaskIdPatchUrl = (boardId, taskId) => {
    return `/api/v1/agent/boards/${boardId}/tasks/${taskId}`;
};
export const updateTaskApiV1AgentBoardsBoardIdTasksTaskIdPatch = async (boardId, taskId, taskUpdate, options) => {
    const res = await fetch(getUpdateTaskApiV1AgentBoardsBoardIdTasksTaskIdPatchUrl(boardId, taskId), {
        ...options,
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(taskUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListTaskCommentsApiV1AgentBoardsBoardIdTasksTaskIdCommentsGetUrl = (boardId, taskId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/agent/boards/${boardId}/tasks/${taskId}/comments?${stringifiedParams}`
        : `/api/v1/agent/boards/${boardId}/tasks/${taskId}/comments`;
};
export const listTaskCommentsApiV1AgentBoardsBoardIdTasksTaskIdCommentsGet = async (boardId, taskId, params, options) => {
    const res = await fetch(getListTaskCommentsApiV1AgentBoardsBoardIdTasksTaskIdCommentsGetUrl(boardId, taskId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateTaskCommentApiV1AgentBoardsBoardIdTasksTaskIdCommentsPostUrl = (boardId, taskId) => {
    return `/api/v1/agent/boards/${boardId}/tasks/${taskId}/comments`;
};
export const createTaskCommentApiV1AgentBoardsBoardIdTasksTaskIdCommentsPost = async (boardId, taskId, taskCommentCreate, options) => {
    const res = await fetch(getCreateTaskCommentApiV1AgentBoardsBoardIdTasksTaskIdCommentsPostUrl(boardId, taskId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(taskCommentCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetWebhookPayloadApiV1AgentBoardsBoardIdWebhooksWebhookIdPayloadsPayloadIdGetUrl = (boardId, webhookId, payloadId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/agent/boards/${boardId}/webhooks/${webhookId}/payloads/${payloadId}?${stringifiedParams}`
        : `/api/v1/agent/boards/${boardId}/webhooks/${webhookId}/payloads/${payloadId}`;
};
export const getWebhookPayloadApiV1AgentBoardsBoardIdWebhooksWebhookIdPayloadsPayloadIdGet = async (boardId, webhookId, payloadId, params, options) => {
    const res = await fetch(getGetWebhookPayloadApiV1AgentBoardsBoardIdWebhooksWebhookIdPayloadsPayloadIdGetUrl(boardId, webhookId, payloadId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getAgentMainMessageBoardLeadUrl = (boardId) => {
    return `/api/v1/agent/gateway/boards/${boardId}/lead/message`;
};
export const agentMainMessageBoardLead = async (boardId, gatewayLeadMessageRequest, options) => {
    const res = await fetch(getAgentMainMessageBoardLeadUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(gatewayLeadMessageRequest),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getAgentMainBroadcastLeadMessageUrl = () => {
    return `/api/v1/agent/gateway/leads/broadcast`;
};
export const agentMainBroadcastLeadMessage = async (gatewayLeadBroadcastRequest, options) => {
    const res = await fetch(getAgentMainBroadcastLeadMessageUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(gatewayLeadBroadcastRequest),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getAgentHealthzApiV1AgentHealthzGetUrl = () => {
    return `/api/v1/agent/healthz`;
};
export const agentHealthzApiV1AgentHealthzGet = async (options) => {
    const res = await fetch(getAgentHealthzApiV1AgentHealthzGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getAgentHeartbeatApiV1AgentHeartbeatPostUrl = () => {
    return `/api/v1/agent/heartbeat`;
};
export const agentHeartbeatApiV1AgentHeartbeatPost = async (options) => {
    const res = await fetch(getAgentHeartbeatApiV1AgentHeartbeatPostUrl(), {
        ...options,
        method: "POST",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListAgentsApiV1AgentsGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/agents?${stringifiedParams}`
        : `/api/v1/agents`;
};
export const listAgentsApiV1AgentsGet = async (params, options) => {
    const res = await fetch(getListAgentsApiV1AgentsGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateAgentApiV1AgentsPostUrl = () => {
    return `/api/v1/agents`;
};
export const createAgentApiV1AgentsPost = async (agentCreate, options) => {
    const res = await fetch(getCreateAgentApiV1AgentsPostUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(agentCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getHeartbeatOrCreateAgentApiV1AgentsHeartbeatPostUrl = () => {
    return `/api/v1/agents/heartbeat`;
};
export const heartbeatOrCreateAgentApiV1AgentsHeartbeatPost = async (agentHeartbeatCreate, options) => {
    const res = await fetch(getHeartbeatOrCreateAgentApiV1AgentsHeartbeatPostUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(agentHeartbeatCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getStreamAgentsApiV1AgentsStreamGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/agents/stream?${stringifiedParams}`
        : `/api/v1/agents/stream`;
};
export const streamAgentsApiV1AgentsStreamGet = async (params, options) => {
    const res = await fetch(getStreamAgentsApiV1AgentsStreamGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getDeleteAgentApiV1AgentsAgentIdDeleteUrl = (agentId) => {
    return `/api/v1/agents/${agentId}`;
};
export const deleteAgentApiV1AgentsAgentIdDelete = async (agentId, options) => {
    const res = await fetch(getDeleteAgentApiV1AgentsAgentIdDeleteUrl(agentId), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetAgentApiV1AgentsAgentIdGetUrl = (agentId) => {
    return `/api/v1/agents/${agentId}`;
};
export const getAgentApiV1AgentsAgentIdGet = async (agentId, options) => {
    const res = await fetch(getGetAgentApiV1AgentsAgentIdGetUrl(agentId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateAgentApiV1AgentsAgentIdPatchUrl = (agentId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/agents/${agentId}?${stringifiedParams}`
        : `/api/v1/agents/${agentId}`;
};
export const updateAgentApiV1AgentsAgentIdPatch = async (agentId, agentUpdate, params, options) => {
    const res = await fetch(getUpdateAgentApiV1AgentsAgentIdPatchUrl(agentId, params), {
        ...options,
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(agentUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getHeartbeatAgentApiV1AgentsAgentIdHeartbeatPostUrl = (agentId) => {
    return `/api/v1/agents/${agentId}/heartbeat`;
};
export const heartbeatAgentApiV1AgentsAgentIdHeartbeatPost = async (agentId, agentHeartbeat, options) => {
    const res = await fetch(getHeartbeatAgentApiV1AgentsAgentIdHeartbeatPostUrl(agentId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(agentHeartbeat),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getBootstrapUserApiV1AuthBootstrapPostUrl = () => {
    return `/api/v1/auth/bootstrap`;
};
export const bootstrapUserApiV1AuthBootstrapPost = async (options) => {
    const res = await fetch(getBootstrapUserApiV1AuthBootstrapPostUrl(), {
        ...options,
        method: "POST",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListBoardGroupsApiV1BoardGroupsGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/board-groups?${stringifiedParams}`
        : `/api/v1/board-groups`;
};
export const listBoardGroupsApiV1BoardGroupsGet = async (params, options) => {
    const res = await fetch(getListBoardGroupsApiV1BoardGroupsGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateBoardGroupApiV1BoardGroupsPostUrl = () => {
    return `/api/v1/board-groups`;
};
export const createBoardGroupApiV1BoardGroupsPost = async (boardGroupCreate, options) => {
    const res = await fetch(getCreateBoardGroupApiV1BoardGroupsPostUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardGroupCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getDeleteBoardGroupApiV1BoardGroupsGroupIdDeleteUrl = (groupId) => {
    return `/api/v1/board-groups/${groupId}`;
};
export const deleteBoardGroupApiV1BoardGroupsGroupIdDelete = async (groupId, options) => {
    const res = await fetch(getDeleteBoardGroupApiV1BoardGroupsGroupIdDeleteUrl(groupId), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetBoardGroupApiV1BoardGroupsGroupIdGetUrl = (groupId) => {
    return `/api/v1/board-groups/${groupId}`;
};
export const getBoardGroupApiV1BoardGroupsGroupIdGet = async (groupId, options) => {
    const res = await fetch(getGetBoardGroupApiV1BoardGroupsGroupIdGetUrl(groupId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateBoardGroupApiV1BoardGroupsGroupIdPatchUrl = (groupId) => {
    return `/api/v1/board-groups/${groupId}`;
};
export const updateBoardGroupApiV1BoardGroupsGroupIdPatch = async (groupId, boardGroupUpdate, options) => {
    const res = await fetch(getUpdateBoardGroupApiV1BoardGroupsGroupIdPatchUrl(groupId), {
        ...options,
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardGroupUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getApplyBoardGroupHeartbeatApiV1BoardGroupsGroupIdHeartbeatPostUrl = (groupId) => {
    return `/api/v1/board-groups/${groupId}/heartbeat`;
};
export const applyBoardGroupHeartbeatApiV1BoardGroupsGroupIdHeartbeatPost = async (groupId, boardGroupHeartbeatApply, options) => {
    const res = await fetch(getApplyBoardGroupHeartbeatApiV1BoardGroupsGroupIdHeartbeatPostUrl(groupId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardGroupHeartbeatApply),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListBoardGroupMemoryApiV1BoardGroupsGroupIdMemoryGetUrl = (groupId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/board-groups/${groupId}/memory?${stringifiedParams}`
        : `/api/v1/board-groups/${groupId}/memory`;
};
export const listBoardGroupMemoryApiV1BoardGroupsGroupIdMemoryGet = async (groupId, params, options) => {
    const res = await fetch(getListBoardGroupMemoryApiV1BoardGroupsGroupIdMemoryGetUrl(groupId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateBoardGroupMemoryApiV1BoardGroupsGroupIdMemoryPostUrl = (groupId) => {
    return `/api/v1/board-groups/${groupId}/memory`;
};
export const createBoardGroupMemoryApiV1BoardGroupsGroupIdMemoryPost = async (groupId, boardGroupMemoryCreate, options) => {
    const res = await fetch(getCreateBoardGroupMemoryApiV1BoardGroupsGroupIdMemoryPostUrl(groupId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardGroupMemoryCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getStreamBoardGroupMemoryApiV1BoardGroupsGroupIdMemoryStreamGetUrl = (groupId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/board-groups/${groupId}/memory/stream?${stringifiedParams}`
        : `/api/v1/board-groups/${groupId}/memory/stream`;
};
export const streamBoardGroupMemoryApiV1BoardGroupsGroupIdMemoryStreamGet = async (groupId, params, options) => {
    const res = await fetch(getStreamBoardGroupMemoryApiV1BoardGroupsGroupIdMemoryStreamGetUrl(groupId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetBoardGroupSnapshotApiV1BoardGroupsGroupIdSnapshotGetUrl = (groupId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/board-groups/${groupId}/snapshot?${stringifiedParams}`
        : `/api/v1/board-groups/${groupId}/snapshot`;
};
export const getBoardGroupSnapshotApiV1BoardGroupsGroupIdSnapshotGet = async (groupId, params, options) => {
    const res = await fetch(getGetBoardGroupSnapshotApiV1BoardGroupsGroupIdSnapshotGetUrl(groupId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListBoardsApiV1BoardsGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/boards?${stringifiedParams}`
        : `/api/v1/boards`;
};
export const listBoardsApiV1BoardsGet = async (params, options) => {
    const res = await fetch(getListBoardsApiV1BoardsGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateBoardApiV1BoardsPostUrl = () => {
    return `/api/v1/boards`;
};
export const createBoardApiV1BoardsPost = async (boardCreate, options) => {
    const res = await fetch(getCreateBoardApiV1BoardsPostUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getDeleteBoardApiV1BoardsBoardIdDeleteUrl = (boardId) => {
    return `/api/v1/boards/${boardId}`;
};
export const deleteBoardApiV1BoardsBoardIdDelete = async (boardId, options) => {
    const res = await fetch(getDeleteBoardApiV1BoardsBoardIdDeleteUrl(boardId), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetBoardApiV1BoardsBoardIdGetUrl = (boardId) => {
    return `/api/v1/boards/${boardId}`;
};
export const getBoardApiV1BoardsBoardIdGet = async (boardId, options) => {
    const res = await fetch(getGetBoardApiV1BoardsBoardIdGetUrl(boardId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateBoardApiV1BoardsBoardIdPatchUrl = (boardId) => {
    return `/api/v1/boards/${boardId}`;
};
export const updateBoardApiV1BoardsBoardIdPatch = async (boardId, boardUpdate, options) => {
    const res = await fetch(getUpdateBoardApiV1BoardsBoardIdPatchUrl(boardId), {
        ...options,
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListApprovalsApiV1BoardsBoardIdApprovalsGetUrl = (boardId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/boards/${boardId}/approvals?${stringifiedParams}`
        : `/api/v1/boards/${boardId}/approvals`;
};
export const listApprovalsApiV1BoardsBoardIdApprovalsGet = async (boardId, params, options) => {
    const res = await fetch(getListApprovalsApiV1BoardsBoardIdApprovalsGetUrl(boardId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateApprovalApiV1BoardsBoardIdApprovalsPostUrl = (boardId) => {
    return `/api/v1/boards/${boardId}/approvals`;
};
export const createApprovalApiV1BoardsBoardIdApprovalsPost = async (boardId, approvalCreate, options) => {
    const res = await fetch(getCreateApprovalApiV1BoardsBoardIdApprovalsPostUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(approvalCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getStreamApprovalsApiV1BoardsBoardIdApprovalsStreamGetUrl = (boardId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/boards/${boardId}/approvals/stream?${stringifiedParams}`
        : `/api/v1/boards/${boardId}/approvals/stream`;
};
export const streamApprovalsApiV1BoardsBoardIdApprovalsStreamGet = async (boardId, params, options) => {
    const res = await fetch(getStreamApprovalsApiV1BoardsBoardIdApprovalsStreamGetUrl(boardId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateApprovalApiV1BoardsBoardIdApprovalsApprovalIdPatchUrl = (boardId, approvalId) => {
    return `/api/v1/boards/${boardId}/approvals/${approvalId}`;
};
export const updateApprovalApiV1BoardsBoardIdApprovalsApprovalIdPatch = async (boardId, approvalId, approvalUpdate, options) => {
    const res = await fetch(getUpdateApprovalApiV1BoardsBoardIdApprovalsApprovalIdPatchUrl(boardId, approvalId), {
        ...options,
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(approvalUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetBoardFilesystemMemoryApiV1BoardsBoardIdFilesystemMemoryGetUrl = (boardId) => {
    return `/api/v1/boards/${boardId}/filesystem-memory`;
};
export const getBoardFilesystemMemoryApiV1BoardsBoardIdFilesystemMemoryGet = async (boardId, options) => {
    const res = await fetch(getGetBoardFilesystemMemoryApiV1BoardsBoardIdFilesystemMemoryGetUrl(boardId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetBoardFilesystemMemoryFileApiV1BoardsBoardIdFilesystemMemoryFileGetUrl = (boardId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/boards/${boardId}/filesystem-memory/file?${stringifiedParams}`
        : `/api/v1/boards/${boardId}/filesystem-memory/file`;
};
export const getBoardFilesystemMemoryFileApiV1BoardsBoardIdFilesystemMemoryFileGet = async (boardId, params, options) => {
    const res = await fetch(getGetBoardFilesystemMemoryFileApiV1BoardsBoardIdFilesystemMemoryFileGetUrl(boardId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListBoardGroupMemoryForBoardApiV1BoardsBoardIdGroupMemoryGetUrl = (boardId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/boards/${boardId}/group-memory?${stringifiedParams}`
        : `/api/v1/boards/${boardId}/group-memory`;
};
export const listBoardGroupMemoryForBoardApiV1BoardsBoardIdGroupMemoryGet = async (boardId, params, options) => {
    const res = await fetch(getListBoardGroupMemoryForBoardApiV1BoardsBoardIdGroupMemoryGetUrl(boardId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateBoardGroupMemoryForBoardApiV1BoardsBoardIdGroupMemoryPostUrl = (boardId) => {
    return `/api/v1/boards/${boardId}/group-memory`;
};
export const createBoardGroupMemoryForBoardApiV1BoardsBoardIdGroupMemoryPost = async (boardId, boardGroupMemoryCreate, options) => {
    const res = await fetch(getCreateBoardGroupMemoryForBoardApiV1BoardsBoardIdGroupMemoryPostUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardGroupMemoryCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getStreamBoardGroupMemoryForBoardApiV1BoardsBoardIdGroupMemoryStreamGetUrl = (boardId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/boards/${boardId}/group-memory/stream?${stringifiedParams}`
        : `/api/v1/boards/${boardId}/group-memory/stream`;
};
export const streamBoardGroupMemoryForBoardApiV1BoardsBoardIdGroupMemoryStreamGet = async (boardId, params, options) => {
    const res = await fetch(getStreamBoardGroupMemoryForBoardApiV1BoardsBoardIdGroupMemoryStreamGetUrl(boardId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetBoardGroupSnapshotApiV1BoardsBoardIdGroupSnapshotGetUrl = (boardId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/boards/${boardId}/group-snapshot?${stringifiedParams}`
        : `/api/v1/boards/${boardId}/group-snapshot`;
};
export const getBoardGroupSnapshotApiV1BoardsBoardIdGroupSnapshotGet = async (boardId, params, options) => {
    const res = await fetch(getGetBoardGroupSnapshotApiV1BoardsBoardIdGroupSnapshotGetUrl(boardId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListBoardMemoryApiV1BoardsBoardIdMemoryGetUrl = (boardId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/boards/${boardId}/memory?${stringifiedParams}`
        : `/api/v1/boards/${boardId}/memory`;
};
export const listBoardMemoryApiV1BoardsBoardIdMemoryGet = async (boardId, params, options) => {
    const res = await fetch(getListBoardMemoryApiV1BoardsBoardIdMemoryGetUrl(boardId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateBoardMemoryApiV1BoardsBoardIdMemoryPostUrl = (boardId) => {
    return `/api/v1/boards/${boardId}/memory`;
};
export const createBoardMemoryApiV1BoardsBoardIdMemoryPost = async (boardId, boardMemoryCreate, options) => {
    const res = await fetch(getCreateBoardMemoryApiV1BoardsBoardIdMemoryPostUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardMemoryCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getStreamBoardMemoryApiV1BoardsBoardIdMemoryStreamGetUrl = (boardId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/boards/${boardId}/memory/stream?${stringifiedParams}`
        : `/api/v1/boards/${boardId}/memory/stream`;
};
export const streamBoardMemoryApiV1BoardsBoardIdMemoryStreamGet = async (boardId, params, options) => {
    const res = await fetch(getStreamBoardMemoryApiV1BoardsBoardIdMemoryStreamGetUrl(boardId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetOnboardingApiV1BoardsBoardIdOnboardingGetUrl = (boardId) => {
    return `/api/v1/boards/${boardId}/onboarding`;
};
export const getOnboardingApiV1BoardsBoardIdOnboardingGet = async (boardId, options) => {
    const res = await fetch(getGetOnboardingApiV1BoardsBoardIdOnboardingGetUrl(boardId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getAgentOnboardingUpdateApiV1BoardsBoardIdOnboardingAgentPostUrl = (boardId) => {
    return `/api/v1/boards/${boardId}/onboarding/agent`;
};
export const agentOnboardingUpdateApiV1BoardsBoardIdOnboardingAgentPost = async (boardId, boardOnboardingAgentCompleteBoardOnboardingAgentQuestion, options) => {
    const res = await fetch(getAgentOnboardingUpdateApiV1BoardsBoardIdOnboardingAgentPostUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardOnboardingAgentCompleteBoardOnboardingAgentQuestion),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getAnswerOnboardingApiV1BoardsBoardIdOnboardingAnswerPostUrl = (boardId) => {
    return `/api/v1/boards/${boardId}/onboarding/answer`;
};
export const answerOnboardingApiV1BoardsBoardIdOnboardingAnswerPost = async (boardId, boardOnboardingAnswer, options) => {
    const res = await fetch(getAnswerOnboardingApiV1BoardsBoardIdOnboardingAnswerPostUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardOnboardingAnswer),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getConfirmOnboardingApiV1BoardsBoardIdOnboardingConfirmPostUrl = (boardId) => {
    return `/api/v1/boards/${boardId}/onboarding/confirm`;
};
export const confirmOnboardingApiV1BoardsBoardIdOnboardingConfirmPost = async (boardId, boardOnboardingConfirm, options) => {
    const res = await fetch(getConfirmOnboardingApiV1BoardsBoardIdOnboardingConfirmPostUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardOnboardingConfirm),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getStartOnboardingApiV1BoardsBoardIdOnboardingStartPostUrl = (boardId) => {
    return `/api/v1/boards/${boardId}/onboarding/start`;
};
export const startOnboardingApiV1BoardsBoardIdOnboardingStartPost = async (boardId, boardOnboardingStart, options) => {
    const res = await fetch(getStartOnboardingApiV1BoardsBoardIdOnboardingStartPostUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardOnboardingStart),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetBoardSnapshotApiV1BoardsBoardIdSnapshotGetUrl = (boardId) => {
    return `/api/v1/boards/${boardId}/snapshot`;
};
export const getBoardSnapshotApiV1BoardsBoardIdSnapshotGet = async (boardId, options) => {
    const res = await fetch(getGetBoardSnapshotApiV1BoardsBoardIdSnapshotGetUrl(boardId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListTasksApiV1BoardsBoardIdTasksGetUrl = (boardId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/boards/${boardId}/tasks?${stringifiedParams}`
        : `/api/v1/boards/${boardId}/tasks`;
};
export const listTasksApiV1BoardsBoardIdTasksGet = async (boardId, params, options) => {
    const res = await fetch(getListTasksApiV1BoardsBoardIdTasksGetUrl(boardId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateTaskApiV1BoardsBoardIdTasksPostUrl = (boardId) => {
    return `/api/v1/boards/${boardId}/tasks`;
};
export const createTaskApiV1BoardsBoardIdTasksPost = async (boardId, taskCreate, options) => {
    const res = await fetch(getCreateTaskApiV1BoardsBoardIdTasksPostUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(taskCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getStreamTasksApiV1BoardsBoardIdTasksStreamGetUrl = (boardId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/boards/${boardId}/tasks/stream?${stringifiedParams}`
        : `/api/v1/boards/${boardId}/tasks/stream`;
};
export const streamTasksApiV1BoardsBoardIdTasksStreamGet = async (boardId, params, options) => {
    const res = await fetch(getStreamTasksApiV1BoardsBoardIdTasksStreamGetUrl(boardId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getDeleteTaskApiV1BoardsBoardIdTasksTaskIdDeleteUrl = (boardId, taskId) => {
    return `/api/v1/boards/${boardId}/tasks/${taskId}`;
};
export const deleteTaskApiV1BoardsBoardIdTasksTaskIdDelete = async (boardId, taskId, options) => {
    const res = await fetch(getDeleteTaskApiV1BoardsBoardIdTasksTaskIdDeleteUrl(boardId, taskId), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateTaskApiV1BoardsBoardIdTasksTaskIdPatchUrl = (boardId, taskId) => {
    return `/api/v1/boards/${boardId}/tasks/${taskId}`;
};
export const updateTaskApiV1BoardsBoardIdTasksTaskIdPatch = async (boardId, taskId, taskUpdate, options) => {
    const res = await fetch(getUpdateTaskApiV1BoardsBoardIdTasksTaskIdPatchUrl(boardId, taskId), {
        ...options,
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(taskUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListTaskCommentsApiV1BoardsBoardIdTasksTaskIdCommentsGetUrl = (boardId, taskId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/boards/${boardId}/tasks/${taskId}/comments?${stringifiedParams}`
        : `/api/v1/boards/${boardId}/tasks/${taskId}/comments`;
};
export const listTaskCommentsApiV1BoardsBoardIdTasksTaskIdCommentsGet = async (boardId, taskId, params, options) => {
    const res = await fetch(getListTaskCommentsApiV1BoardsBoardIdTasksTaskIdCommentsGetUrl(boardId, taskId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateTaskCommentApiV1BoardsBoardIdTasksTaskIdCommentsPostUrl = (boardId, taskId) => {
    return `/api/v1/boards/${boardId}/tasks/${taskId}/comments`;
};
export const createTaskCommentApiV1BoardsBoardIdTasksTaskIdCommentsPost = async (boardId, taskId, taskCommentCreate, options) => {
    const res = await fetch(getCreateTaskCommentApiV1BoardsBoardIdTasksTaskIdCommentsPostUrl(boardId, taskId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(taskCommentCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListBoardWebhooksApiV1BoardsBoardIdWebhooksGetUrl = (boardId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/boards/${boardId}/webhooks?${stringifiedParams}`
        : `/api/v1/boards/${boardId}/webhooks`;
};
export const listBoardWebhooksApiV1BoardsBoardIdWebhooksGet = async (boardId, params, options) => {
    const res = await fetch(getListBoardWebhooksApiV1BoardsBoardIdWebhooksGetUrl(boardId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateBoardWebhookApiV1BoardsBoardIdWebhooksPostUrl = (boardId) => {
    return `/api/v1/boards/${boardId}/webhooks`;
};
export const createBoardWebhookApiV1BoardsBoardIdWebhooksPost = async (boardId, boardWebhookCreate, options) => {
    const res = await fetch(getCreateBoardWebhookApiV1BoardsBoardIdWebhooksPostUrl(boardId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardWebhookCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getDeleteBoardWebhookApiV1BoardsBoardIdWebhooksWebhookIdDeleteUrl = (boardId, webhookId) => {
    return `/api/v1/boards/${boardId}/webhooks/${webhookId}`;
};
export const deleteBoardWebhookApiV1BoardsBoardIdWebhooksWebhookIdDelete = async (boardId, webhookId, options) => {
    const res = await fetch(getDeleteBoardWebhookApiV1BoardsBoardIdWebhooksWebhookIdDeleteUrl(boardId, webhookId), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetBoardWebhookApiV1BoardsBoardIdWebhooksWebhookIdGetUrl = (boardId, webhookId) => {
    return `/api/v1/boards/${boardId}/webhooks/${webhookId}`;
};
export const getBoardWebhookApiV1BoardsBoardIdWebhooksWebhookIdGet = async (boardId, webhookId, options) => {
    const res = await fetch(getGetBoardWebhookApiV1BoardsBoardIdWebhooksWebhookIdGetUrl(boardId, webhookId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateBoardWebhookApiV1BoardsBoardIdWebhooksWebhookIdPatchUrl = (boardId, webhookId) => {
    return `/api/v1/boards/${boardId}/webhooks/${webhookId}`;
};
export const updateBoardWebhookApiV1BoardsBoardIdWebhooksWebhookIdPatch = async (boardId, webhookId, boardWebhookUpdate, options) => {
    const res = await fetch(getUpdateBoardWebhookApiV1BoardsBoardIdWebhooksWebhookIdPatchUrl(boardId, webhookId), {
        ...options,
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(boardWebhookUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getIngestBoardWebhookApiV1BoardsBoardIdWebhooksWebhookIdPostUrl = (boardId, webhookId) => {
    return `/api/v1/boards/${boardId}/webhooks/${webhookId}`;
};
export const ingestBoardWebhookApiV1BoardsBoardIdWebhooksWebhookIdPost = async (boardId, webhookId, options) => {
    const res = await fetch(getIngestBoardWebhookApiV1BoardsBoardIdWebhooksWebhookIdPostUrl(boardId, webhookId), {
        ...options,
        method: "POST",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListBoardWebhookPayloadsApiV1BoardsBoardIdWebhooksWebhookIdPayloadsGetUrl = (boardId, webhookId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/boards/${boardId}/webhooks/${webhookId}/payloads?${stringifiedParams}`
        : `/api/v1/boards/${boardId}/webhooks/${webhookId}/payloads`;
};
export const listBoardWebhookPayloadsApiV1BoardsBoardIdWebhooksWebhookIdPayloadsGet = async (boardId, webhookId, params, options) => {
    const res = await fetch(getListBoardWebhookPayloadsApiV1BoardsBoardIdWebhooksWebhookIdPayloadsGetUrl(boardId, webhookId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetBoardWebhookPayloadApiV1BoardsBoardIdWebhooksWebhookIdPayloadsPayloadIdGetUrl = (boardId, webhookId, payloadId) => {
    return `/api/v1/boards/${boardId}/webhooks/${webhookId}/payloads/${payloadId}`;
};
export const getBoardWebhookPayloadApiV1BoardsBoardIdWebhooksWebhookIdPayloadsPayloadIdGet = async (boardId, webhookId, payloadId, options) => {
    const res = await fetch(getGetBoardWebhookPayloadApiV1BoardsBoardIdWebhooksWebhookIdPayloadsPayloadIdGetUrl(boardId, webhookId, payloadId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListGatewaysApiV1GatewaysGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/gateways?${stringifiedParams}`
        : `/api/v1/gateways`;
};
export const listGatewaysApiV1GatewaysGet = async (params, options) => {
    const res = await fetch(getListGatewaysApiV1GatewaysGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateGatewayApiV1GatewaysPostUrl = () => {
    return `/api/v1/gateways`;
};
export const createGatewayApiV1GatewaysPost = async (gatewayCreate, options) => {
    const res = await fetch(getCreateGatewayApiV1GatewaysPostUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(gatewayCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetGatewayBrandApiV1GatewaysBrandGetUrl = () => {
    return `/api/v1/gateways/brand`;
};
export const getGatewayBrandApiV1GatewaysBrandGet = async (options) => {
    const res = await fetch(getGetGatewayBrandApiV1GatewaysBrandGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGatewayCommandsApiV1GatewaysCommandsGetUrl = () => {
    return `/api/v1/gateways/commands`;
};
export const gatewayCommandsApiV1GatewaysCommandsGet = async (options) => {
    const res = await fetch(getGatewayCommandsApiV1GatewaysCommandsGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListGatewaySessionsApiV1GatewaysSessionsGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/gateways/sessions?${stringifiedParams}`
        : `/api/v1/gateways/sessions`;
};
export const listGatewaySessionsApiV1GatewaysSessionsGet = async (params, options) => {
    const res = await fetch(getListGatewaySessionsApiV1GatewaysSessionsGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetGatewaySessionApiV1GatewaysSessionsSessionIdGetUrl = (sessionId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/gateways/sessions/${sessionId}?${stringifiedParams}`
        : `/api/v1/gateways/sessions/${sessionId}`;
};
export const getGatewaySessionApiV1GatewaysSessionsSessionIdGet = async (sessionId, params, options) => {
    const res = await fetch(getGetGatewaySessionApiV1GatewaysSessionsSessionIdGetUrl(sessionId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetSessionHistoryApiV1GatewaysSessionsSessionIdHistoryGetUrl = (sessionId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/gateways/sessions/${sessionId}/history?${stringifiedParams}`
        : `/api/v1/gateways/sessions/${sessionId}/history`;
};
export const getSessionHistoryApiV1GatewaysSessionsSessionIdHistoryGet = async (sessionId, params, options) => {
    const res = await fetch(getGetSessionHistoryApiV1GatewaysSessionsSessionIdHistoryGetUrl(sessionId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getSendGatewaySessionMessageApiV1GatewaysSessionsSessionIdMessagePostUrl = (sessionId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/gateways/sessions/${sessionId}/message?${stringifiedParams}`
        : `/api/v1/gateways/sessions/${sessionId}/message`;
};
export const sendGatewaySessionMessageApiV1GatewaysSessionsSessionIdMessagePost = async (sessionId, gatewaySessionMessageRequest, params, options) => {
    const res = await fetch(getSendGatewaySessionMessageApiV1GatewaysSessionsSessionIdMessagePostUrl(sessionId, params), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(gatewaySessionMessageRequest),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGatewaysStatusApiV1GatewaysStatusGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/gateways/status?${stringifiedParams}`
        : `/api/v1/gateways/status`;
};
export const gatewaysStatusApiV1GatewaysStatusGet = async (params, options) => {
    const res = await fetch(getGatewaysStatusApiV1GatewaysStatusGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getDeleteGatewayApiV1GatewaysGatewayIdDeleteUrl = (gatewayId) => {
    return `/api/v1/gateways/${gatewayId}`;
};
export const deleteGatewayApiV1GatewaysGatewayIdDelete = async (gatewayId, options) => {
    const res = await fetch(getDeleteGatewayApiV1GatewaysGatewayIdDeleteUrl(gatewayId), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetGatewayApiV1GatewaysGatewayIdGetUrl = (gatewayId) => {
    return `/api/v1/gateways/${gatewayId}`;
};
export const getGatewayApiV1GatewaysGatewayIdGet = async (gatewayId, options) => {
    const res = await fetch(getGetGatewayApiV1GatewaysGatewayIdGetUrl(gatewayId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateGatewayApiV1GatewaysGatewayIdPatchUrl = (gatewayId) => {
    return `/api/v1/gateways/${gatewayId}`;
};
export const updateGatewayApiV1GatewaysGatewayIdPatch = async (gatewayId, gatewayUpdate, options) => {
    const res = await fetch(getUpdateGatewayApiV1GatewaysGatewayIdPatchUrl(gatewayId), {
        ...options,
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(gatewayUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetGatewayFilesystemMemoryApiV1GatewaysGatewayIdFilesystemMemoryGetUrl = (gatewayId) => {
    return `/api/v1/gateways/${gatewayId}/filesystem-memory`;
};
export const getGatewayFilesystemMemoryApiV1GatewaysGatewayIdFilesystemMemoryGet = async (gatewayId, options) => {
    const res = await fetch(getGetGatewayFilesystemMemoryApiV1GatewaysGatewayIdFilesystemMemoryGetUrl(gatewayId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetGatewayFilesystemMemoryFileApiV1GatewaysGatewayIdFilesystemMemoryFileGetUrl = (gatewayId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/gateways/${gatewayId}/filesystem-memory/file?${stringifiedParams}`
        : `/api/v1/gateways/${gatewayId}/filesystem-memory/file`;
};
export const getGatewayFilesystemMemoryFileApiV1GatewaysGatewayIdFilesystemMemoryFileGet = async (gatewayId, params, options) => {
    const res = await fetch(getGetGatewayFilesystemMemoryFileApiV1GatewaysGatewayIdFilesystemMemoryFileGetUrl(gatewayId, params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getSyncGatewayTemplatesApiV1GatewaysGatewayIdTemplatesSyncPostUrl = (gatewayId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/gateways/${gatewayId}/templates/sync?${stringifiedParams}`
        : `/api/v1/gateways/${gatewayId}/templates/sync`;
};
export const syncGatewayTemplatesApiV1GatewaysGatewayIdTemplatesSyncPost = async (gatewayId, params, options) => {
    const res = await fetch(getSyncGatewayTemplatesApiV1GatewaysGatewayIdTemplatesSyncPostUrl(gatewayId, params), {
        ...options,
        method: "POST",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getDashboardMetricsApiV1MetricsDashboardGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/metrics/dashboard?${stringifiedParams}`
        : `/api/v1/metrics/dashboard`;
};
export const dashboardMetricsApiV1MetricsDashboardGet = async (params, options) => {
    const res = await fetch(getDashboardMetricsApiV1MetricsDashboardGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateOrganizationApiV1OrganizationsPostUrl = () => {
    return `/api/v1/organizations`;
};
export const createOrganizationApiV1OrganizationsPost = async (organizationCreate, options) => {
    const res = await fetch(getCreateOrganizationApiV1OrganizationsPostUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(organizationCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getAcceptOrgInviteApiV1OrganizationsInvitesAcceptPostUrl = () => {
    return `/api/v1/organizations/invites/accept`;
};
export const acceptOrgInviteApiV1OrganizationsInvitesAcceptPost = async (organizationInviteAccept, options) => {
    const res = await fetch(getAcceptOrgInviteApiV1OrganizationsInvitesAcceptPostUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(organizationInviteAccept),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getDeleteMyOrgApiV1OrganizationsMeDeleteUrl = () => {
    return `/api/v1/organizations/me`;
};
export const deleteMyOrgApiV1OrganizationsMeDelete = async (options) => {
    const res = await fetch(getDeleteMyOrgApiV1OrganizationsMeDeleteUrl(), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetMyOrgApiV1OrganizationsMeGetUrl = () => {
    return `/api/v1/organizations/me`;
};
export const getMyOrgApiV1OrganizationsMeGet = async (options) => {
    const res = await fetch(getGetMyOrgApiV1OrganizationsMeGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getSetActiveOrgApiV1OrganizationsMeActivePatchUrl = () => {
    return `/api/v1/organizations/me/active`;
};
export const setActiveOrgApiV1OrganizationsMeActivePatch = async (organizationActiveUpdate, options) => {
    const res = await fetch(getSetActiveOrgApiV1OrganizationsMeActivePatchUrl(), {
        ...options,
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(organizationActiveUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListOrgCustomFieldsApiV1OrganizationsMeCustomFieldsGetUrl = () => {
    return `/api/v1/organizations/me/custom-fields`;
};
export const listOrgCustomFieldsApiV1OrganizationsMeCustomFieldsGet = async (options) => {
    const res = await fetch(getListOrgCustomFieldsApiV1OrganizationsMeCustomFieldsGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateOrgCustomFieldApiV1OrganizationsMeCustomFieldsPostUrl = () => {
    return `/api/v1/organizations/me/custom-fields`;
};
export const createOrgCustomFieldApiV1OrganizationsMeCustomFieldsPost = async (taskCustomFieldDefinitionCreate, options) => {
    const res = await fetch(getCreateOrgCustomFieldApiV1OrganizationsMeCustomFieldsPostUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(taskCustomFieldDefinitionCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getDeleteOrgCustomFieldApiV1OrganizationsMeCustomFieldsTaskCustomFieldDefinitionIdDeleteUrl = (taskCustomFieldDefinitionId) => {
    return `/api/v1/organizations/me/custom-fields/${taskCustomFieldDefinitionId}`;
};
export const deleteOrgCustomFieldApiV1OrganizationsMeCustomFieldsTaskCustomFieldDefinitionIdDelete = async (taskCustomFieldDefinitionId, options) => {
    const res = await fetch(getDeleteOrgCustomFieldApiV1OrganizationsMeCustomFieldsTaskCustomFieldDefinitionIdDeleteUrl(taskCustomFieldDefinitionId), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateOrgCustomFieldApiV1OrganizationsMeCustomFieldsTaskCustomFieldDefinitionIdPatchUrl = (taskCustomFieldDefinitionId) => {
    return `/api/v1/organizations/me/custom-fields/${taskCustomFieldDefinitionId}`;
};
export const updateOrgCustomFieldApiV1OrganizationsMeCustomFieldsTaskCustomFieldDefinitionIdPatch = async (taskCustomFieldDefinitionId, taskCustomFieldDefinitionUpdate, options) => {
    const res = await fetch(getUpdateOrgCustomFieldApiV1OrganizationsMeCustomFieldsTaskCustomFieldDefinitionIdPatchUrl(taskCustomFieldDefinitionId), {
        ...options,
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(taskCustomFieldDefinitionUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListOrgInvitesApiV1OrganizationsMeInvitesGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/organizations/me/invites?${stringifiedParams}`
        : `/api/v1/organizations/me/invites`;
};
export const listOrgInvitesApiV1OrganizationsMeInvitesGet = async (params, options) => {
    const res = await fetch(getListOrgInvitesApiV1OrganizationsMeInvitesGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateOrgInviteApiV1OrganizationsMeInvitesPostUrl = () => {
    return `/api/v1/organizations/me/invites`;
};
export const createOrgInviteApiV1OrganizationsMeInvitesPost = async (organizationInviteCreate, options) => {
    const res = await fetch(getCreateOrgInviteApiV1OrganizationsMeInvitesPostUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(organizationInviteCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getRevokeOrgInviteApiV1OrganizationsMeInvitesInviteIdDeleteUrl = (inviteId) => {
    return `/api/v1/organizations/me/invites/${inviteId}`;
};
export const revokeOrgInviteApiV1OrganizationsMeInvitesInviteIdDelete = async (inviteId, options) => {
    const res = await fetch(getRevokeOrgInviteApiV1OrganizationsMeInvitesInviteIdDeleteUrl(inviteId), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListMyOrganizationsApiV1OrganizationsMeListGetUrl = () => {
    return `/api/v1/organizations/me/list`;
};
export const listMyOrganizationsApiV1OrganizationsMeListGet = async (options) => {
    const res = await fetch(getListMyOrganizationsApiV1OrganizationsMeListGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetMyMembershipApiV1OrganizationsMeMemberGetUrl = () => {
    return `/api/v1/organizations/me/member`;
};
export const getMyMembershipApiV1OrganizationsMeMemberGet = async (options) => {
    const res = await fetch(getGetMyMembershipApiV1OrganizationsMeMemberGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListOrgMembersApiV1OrganizationsMeMembersGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/organizations/me/members?${stringifiedParams}`
        : `/api/v1/organizations/me/members`;
};
export const listOrgMembersApiV1OrganizationsMeMembersGet = async (params, options) => {
    const res = await fetch(getListOrgMembersApiV1OrganizationsMeMembersGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getRemoveOrgMemberApiV1OrganizationsMeMembersMemberIdDeleteUrl = (memberId) => {
    return `/api/v1/organizations/me/members/${memberId}`;
};
export const removeOrgMemberApiV1OrganizationsMeMembersMemberIdDelete = async (memberId, options) => {
    const res = await fetch(getRemoveOrgMemberApiV1OrganizationsMeMembersMemberIdDeleteUrl(memberId), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetOrgMemberApiV1OrganizationsMeMembersMemberIdGetUrl = (memberId) => {
    return `/api/v1/organizations/me/members/${memberId}`;
};
export const getOrgMemberApiV1OrganizationsMeMembersMemberIdGet = async (memberId, options) => {
    const res = await fetch(getGetOrgMemberApiV1OrganizationsMeMembersMemberIdGetUrl(memberId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateOrgMemberApiV1OrganizationsMeMembersMemberIdPatchUrl = (memberId) => {
    return `/api/v1/organizations/me/members/${memberId}`;
};
export const updateOrgMemberApiV1OrganizationsMeMembersMemberIdPatch = async (memberId, organizationMemberUpdate, options) => {
    const res = await fetch(getUpdateOrgMemberApiV1OrganizationsMeMembersMemberIdPatchUrl(memberId), {
        ...options,
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(organizationMemberUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateMemberAccessApiV1OrganizationsMeMembersMemberIdAccessPutUrl = (memberId) => {
    return `/api/v1/organizations/me/members/${memberId}/access`;
};
export const updateMemberAccessApiV1OrganizationsMeMembersMemberIdAccessPut = async (memberId, organizationMemberAccessUpdate, options) => {
    const res = await fetch(getUpdateMemberAccessApiV1OrganizationsMeMembersMemberIdAccessPutUrl(memberId), {
        ...options,
        method: "PUT",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(organizationMemberAccessUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListPortfolioPositionsApiV1PortfolioPositionsGetUrl = () => {
    return `/api/v1/portfolio/positions`;
};
export const listPortfolioPositionsApiV1PortfolioPositionsGet = async (options) => {
    const res = await fetch(getListPortfolioPositionsApiV1PortfolioPositionsGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetPortfolioPositionApiV1PortfolioPositionsPositionKeyGetUrl = (positionKey) => {
    return `/api/v1/portfolio/positions/${positionKey}`;
};
export const getPortfolioPositionApiV1PortfolioPositionsPositionKeyGet = async (positionKey, options) => {
    const res = await fetch(getGetPortfolioPositionApiV1PortfolioPositionsPositionKeyGetUrl(positionKey), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdatePortfolioRationaleApiV1PortfolioPositionsPositionKeyRationalePutUrl = (positionKey) => {
    return `/api/v1/portfolio/positions/${positionKey}/rationale`;
};
export const updatePortfolioRationaleApiV1PortfolioPositionsPositionKeyRationalePut = async (positionKey, portfolioRationaleUpdate, options) => {
    const res = await fetch(getUpdatePortfolioRationaleApiV1PortfolioPositionsPositionKeyRationalePutUrl(positionKey), {
        ...options,
        method: "PUT",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(portfolioRationaleUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getRunPortfolioReviewEndpointApiV1PortfolioReviewRunPostUrl = () => {
    return `/api/v1/portfolio/review/run`;
};
export const runPortfolioReviewEndpointApiV1PortfolioReviewRunPost = async (portfolioReviewRunRequest, options) => {
    const res = await fetch(getRunPortfolioReviewEndpointApiV1PortfolioReviewRunPostUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(portfolioReviewRunRequest),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListPortfolioReviewsApiV1PortfolioReviewsGetUrl = () => {
    return `/api/v1/portfolio/reviews`;
};
export const listPortfolioReviewsApiV1PortfolioReviewsGet = async (options) => {
    const res = await fetch(getListPortfolioReviewsApiV1PortfolioReviewsGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetPortfolioReviewApiV1PortfolioReviewsReviewIdGetUrl = (reviewId) => {
    return `/api/v1/portfolio/reviews/${reviewId}`;
};
export const getPortfolioReviewApiV1PortfolioReviewsReviewIdGet = async (reviewId, options) => {
    const res = await fetch(getGetPortfolioReviewApiV1PortfolioReviewsReviewIdGetUrl(reviewId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListPortfolioRollEventsApiV1PortfolioRollEventsGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/portfolio/roll-events?${stringifiedParams}`
        : `/api/v1/portfolio/roll-events`;
};
export const listPortfolioRollEventsApiV1PortfolioRollEventsGet = async (params, options) => {
    const res = await fetch(getListPortfolioRollEventsApiV1PortfolioRollEventsGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUndoPortfolioRollEventApiV1PortfolioRollEventsEventIdUndoPostUrl = (eventId) => {
    return `/api/v1/portfolio/roll-events/${eventId}/undo`;
};
export const undoPortfolioRollEventApiV1PortfolioRollEventsEventIdUndoPost = async (eventId, options) => {
    const res = await fetch(getUndoPortfolioRollEventApiV1PortfolioRollEventsEventIdUndoPostUrl(eventId), {
        ...options,
        method: "POST",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getSyncPortfolioNowApiV1PortfolioSyncPostUrl = () => {
    return `/api/v1/portfolio/sync`;
};
export const syncPortfolioNowApiV1PortfolioSyncPost = async (options) => {
    const res = await fetch(getSyncPortfolioNowApiV1PortfolioSyncPostUrl(), {
        ...options,
        method: "POST",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListMarketplaceSkillsApiV1SkillsMarketplaceGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/skills/marketplace?${stringifiedParams}`
        : `/api/v1/skills/marketplace`;
};
export const listMarketplaceSkillsApiV1SkillsMarketplaceGet = async (params, options) => {
    const res = await fetch(getListMarketplaceSkillsApiV1SkillsMarketplaceGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateMarketplaceSkillApiV1SkillsMarketplacePostUrl = () => {
    return `/api/v1/skills/marketplace`;
};
export const createMarketplaceSkillApiV1SkillsMarketplacePost = async (marketplaceSkillCreate, options) => {
    const res = await fetch(getCreateMarketplaceSkillApiV1SkillsMarketplacePostUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(marketplaceSkillCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getDeleteMarketplaceSkillApiV1SkillsMarketplaceSkillIdDeleteUrl = (skillId) => {
    return `/api/v1/skills/marketplace/${skillId}`;
};
export const deleteMarketplaceSkillApiV1SkillsMarketplaceSkillIdDelete = async (skillId, options) => {
    const res = await fetch(getDeleteMarketplaceSkillApiV1SkillsMarketplaceSkillIdDeleteUrl(skillId), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getInstallMarketplaceSkillApiV1SkillsMarketplaceSkillIdInstallPostUrl = (skillId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/skills/marketplace/${skillId}/install?${stringifiedParams}`
        : `/api/v1/skills/marketplace/${skillId}/install`;
};
export const installMarketplaceSkillApiV1SkillsMarketplaceSkillIdInstallPost = async (skillId, params, options) => {
    const res = await fetch(getInstallMarketplaceSkillApiV1SkillsMarketplaceSkillIdInstallPostUrl(skillId, params), {
        ...options,
        method: "POST",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUninstallMarketplaceSkillApiV1SkillsMarketplaceSkillIdUninstallPostUrl = (skillId, params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/skills/marketplace/${skillId}/uninstall?${stringifiedParams}`
        : `/api/v1/skills/marketplace/${skillId}/uninstall`;
};
export const uninstallMarketplaceSkillApiV1SkillsMarketplaceSkillIdUninstallPost = async (skillId, params, options) => {
    const res = await fetch(getUninstallMarketplaceSkillApiV1SkillsMarketplaceSkillIdUninstallPostUrl(skillId, params), {
        ...options,
        method: "POST",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListSkillPacksApiV1SkillsPacksGetUrl = () => {
    return `/api/v1/skills/packs`;
};
export const listSkillPacksApiV1SkillsPacksGet = async (options) => {
    const res = await fetch(getListSkillPacksApiV1SkillsPacksGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateSkillPackApiV1SkillsPacksPostUrl = () => {
    return `/api/v1/skills/packs`;
};
export const createSkillPackApiV1SkillsPacksPost = async (skillPackCreate, options) => {
    const res = await fetch(getCreateSkillPackApiV1SkillsPacksPostUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(skillPackCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getDeleteSkillPackApiV1SkillsPacksPackIdDeleteUrl = (packId) => {
    return `/api/v1/skills/packs/${packId}`;
};
export const deleteSkillPackApiV1SkillsPacksPackIdDelete = async (packId, options) => {
    const res = await fetch(getDeleteSkillPackApiV1SkillsPacksPackIdDeleteUrl(packId), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetSkillPackApiV1SkillsPacksPackIdGetUrl = (packId) => {
    return `/api/v1/skills/packs/${packId}`;
};
export const getSkillPackApiV1SkillsPacksPackIdGet = async (packId, options) => {
    const res = await fetch(getGetSkillPackApiV1SkillsPacksPackIdGetUrl(packId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateSkillPackApiV1SkillsPacksPackIdPatchUrl = (packId) => {
    return `/api/v1/skills/packs/${packId}`;
};
export const updateSkillPackApiV1SkillsPacksPackIdPatch = async (packId, skillPackCreate, options) => {
    const res = await fetch(getUpdateSkillPackApiV1SkillsPacksPackIdPatchUrl(packId), {
        ...options,
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(skillPackCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getSyncSkillPackApiV1SkillsPacksPackIdSyncPostUrl = (packId) => {
    return `/api/v1/skills/packs/${packId}/sync`;
};
export const syncSkillPackApiV1SkillsPacksPackIdSyncPost = async (packId, options) => {
    const res = await fetch(getSyncSkillPackApiV1SkillsPacksPackIdSyncPostUrl(packId), {
        ...options,
        method: "POST",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getSearchApiV1SoulsDirectorySearchGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/souls-directory/search?${stringifiedParams}`
        : `/api/v1/souls-directory/search`;
};
export const searchApiV1SoulsDirectorySearchGet = async (params, options) => {
    const res = await fetch(getSearchApiV1SoulsDirectorySearchGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetMarkdownApiV1SoulsDirectoryHandleSlugGetUrl = (handle, slug) => {
    return `/api/v1/souls-directory/${handle}/${slug}`;
};
export const getMarkdownApiV1SoulsDirectoryHandleSlugGet = async (handle, slug, options) => {
    const res = await fetch(getGetMarkdownApiV1SoulsDirectoryHandleSlugGetUrl(handle, slug), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetMarkdownApiV1SoulsDirectoryHandleSlugMdGetUrl = (handle, slug) => {
    return `/api/v1/souls-directory/${handle}/${slug}.md`;
};
export const getMarkdownApiV1SoulsDirectoryHandleSlugMdGet = async (handle, slug, options) => {
    const res = await fetch(getGetMarkdownApiV1SoulsDirectoryHandleSlugMdGetUrl(handle, slug), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListTagsApiV1TagsGetUrl = (params) => {
    const normalizedParams = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined) {
            normalizedParams.append(key, value === null ? "null" : value.toString());
        }
    });
    const stringifiedParams = normalizedParams.toString();
    return stringifiedParams.length > 0
        ? `/api/v1/tags?${stringifiedParams}`
        : `/api/v1/tags`;
};
export const listTagsApiV1TagsGet = async (params, options) => {
    const res = await fetch(getListTagsApiV1TagsGetUrl(params), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getCreateTagApiV1TagsPostUrl = () => {
    return `/api/v1/tags`;
};
export const createTagApiV1TagsPost = async (tagCreate, options) => {
    const res = await fetch(getCreateTagApiV1TagsPostUrl(), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(tagCreate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getDeleteTagApiV1TagsTagIdDeleteUrl = (tagId) => {
    return `/api/v1/tags/${tagId}`;
};
export const deleteTagApiV1TagsTagIdDelete = async (tagId, options) => {
    const res = await fetch(getDeleteTagApiV1TagsTagIdDeleteUrl(tagId), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetTagApiV1TagsTagIdGetUrl = (tagId) => {
    return `/api/v1/tags/${tagId}`;
};
export const getTagApiV1TagsTagIdGet = async (tagId, options) => {
    const res = await fetch(getGetTagApiV1TagsTagIdGetUrl(tagId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateTagApiV1TagsTagIdPatchUrl = (tagId) => {
    return `/api/v1/tags/${tagId}`;
};
export const updateTagApiV1TagsTagIdPatch = async (tagId, tagUpdate, options) => {
    const res = await fetch(getUpdateTagApiV1TagsTagIdPatchUrl(tagId), {
        ...options,
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(tagUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getListTranscriptionsApiV1TranscriptionsGetUrl = () => {
    return `/api/v1/transcriptions`;
};
export const listTranscriptionsApiV1TranscriptionsGet = async (options) => {
    const res = await fetch(getListTranscriptionsApiV1TranscriptionsGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getReprocessTranscriptionsMetadataApiV1TranscriptionsReprocessMetadataPostUrl = () => {
    return `/api/v1/transcriptions/reprocess-metadata`;
};
export const reprocessTranscriptionsMetadataApiV1TranscriptionsReprocessMetadataPost = async (options) => {
    const res = await fetch(getReprocessTranscriptionsMetadataApiV1TranscriptionsReprocessMetadataPostUrl(), {
        ...options,
        method: "POST",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getSyncTranscriptionsNowApiV1TranscriptionsSyncPostUrl = () => {
    return `/api/v1/transcriptions/sync`;
};
export const syncTranscriptionsNowApiV1TranscriptionsSyncPost = async (options) => {
    const res = await fetch(getSyncTranscriptionsNowApiV1TranscriptionsSyncPostUrl(), {
        ...options,
        method: "POST",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetTranscriptionApiV1TranscriptionsEntryIdGetUrl = (entryId) => {
    return `/api/v1/transcriptions/${entryId}`;
};
export const getTranscriptionApiV1TranscriptionsEntryIdGet = async (entryId, options) => {
    const res = await fetch(getGetTranscriptionApiV1TranscriptionsEntryIdGetUrl(entryId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetTranscriptionAudioApiV1TranscriptionsEntryIdAudioGetUrl = (entryId) => {
    return `/api/v1/transcriptions/${entryId}/audio`;
};
export const getTranscriptionAudioApiV1TranscriptionsEntryIdAudioGet = async (entryId, options) => {
    const res = await fetch(getGetTranscriptionAudioApiV1TranscriptionsEntryIdAudioGetUrl(entryId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getExportTranscriptionDocxApiV1TranscriptionsEntryIdExportDocxGetUrl = (entryId) => {
    return `/api/v1/transcriptions/${entryId}/export.docx`;
};
export const exportTranscriptionDocxApiV1TranscriptionsEntryIdExportDocxGet = async (entryId, options) => {
    const res = await fetch(getExportTranscriptionDocxApiV1TranscriptionsEntryIdExportDocxGetUrl(entryId), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getRenameTranscriptionSpeakerApiV1TranscriptionsEntryIdSpeakersRenamePostUrl = (entryId) => {
    return `/api/v1/transcriptions/${entryId}/speakers/rename`;
};
export const renameTranscriptionSpeakerApiV1TranscriptionsEntryIdSpeakersRenamePost = async (entryId, transcriptionSpeakerRenameRequest, options) => {
    const res = await fetch(getRenameTranscriptionSpeakerApiV1TranscriptionsEntryIdSpeakersRenamePostUrl(entryId), {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(transcriptionSpeakerRenameRequest),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getDeleteMeApiV1UsersMeDeleteUrl = () => {
    return `/api/v1/users/me`;
};
export const deleteMeApiV1UsersMeDelete = async (options) => {
    const res = await fetch(getDeleteMeApiV1UsersMeDeleteUrl(), {
        ...options,
        method: "DELETE",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getGetMeApiV1UsersMeGetUrl = () => {
    return `/api/v1/users/me`;
};
export const getMeApiV1UsersMeGet = async (options) => {
    const res = await fetch(getGetMeApiV1UsersMeGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getUpdateMeApiV1UsersMePatchUrl = () => {
    return `/api/v1/users/me`;
};
export const updateMeApiV1UsersMePatch = async (userUpdate, options) => {
    const res = await fetch(getUpdateMeApiV1UsersMePatchUrl(), {
        ...options,
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...options?.headers },
        body: JSON.stringify(userUpdate),
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body
        ? JSON.parse(body)
        : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getHealthHealthGetUrl = () => {
    return `/health`;
};
export const healthHealthGet = async (options) => {
    const res = await fetch(getHealthHealthGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getHealthzHealthzGetUrl = () => {
    return `/healthz`;
};
export const healthzHealthzGet = async (options) => {
    const res = await fetch(getHealthzHealthzGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
export const getReadyzReadyzGetUrl = () => {
    return `/readyz`;
};
export const readyzReadyzGet = async (options) => {
    const res = await fetch(getReadyzReadyzGetUrl(), {
        ...options,
        method: "GET",
    });
    const body = [204, 205, 304].includes(res.status) ? null : await res.text();
    const data = body ? JSON.parse(body) : {};
    return {
        data,
        status: res.status,
        headers: res.headers,
    };
};
