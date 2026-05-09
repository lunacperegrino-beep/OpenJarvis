"""Extended API routes for agents, workflows, memory, traces, etc."""

from __future__ import annotations

import inspect
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

# ---- Request/Response models ----


class AgentCreateRequest(BaseModel):
    agent_type: str
    tools: Optional[List[str]] = None
    agent_id: Optional[str] = None


class AgentMessageRequest(BaseModel):
    message: str


class MemoryStoreRequest(BaseModel):
    content: str
    metadata: Optional[Dict[str, Any]] = None


class MemorySearchRequest(BaseModel):
    query: str
    top_k: int = 5


class MemoryIndexRequest(BaseModel):
    path: str


class BudgetLimitsRequest(BaseModel):
    max_tokens_per_day: Optional[int] = None
    max_requests_per_hour: Optional[int] = None


class FeedbackScoreRequest(BaseModel):
    trace_id: str
    score: float
    source: str = "api"


class OptimizeRunRequest(BaseModel):
    benchmark: str
    max_trials: int = 20
    optimizer_model: str = "claude-sonnet-4-6"
    max_samples: int = 50


class SkillRunRequest(BaseModel):
    context: Optional[Dict[str, Any]] = None


# ---- Agent routes ----

agents_router = APIRouter(prefix="/v1/agents", tags=["agents"])


@agents_router.get("")
async def list_agents(request: Request):
    """List available agent types and running agents."""
    registered = []
    try:
        import openjarvis.agents  # noqa: F401 — side-effect registration
        from openjarvis.core.registry import AgentRegistry

        for key in sorted(AgentRegistry.keys()):
            cls = AgentRegistry.get(key)
            registered.append(
                {
                    "key": key,
                    "class": cls.__name__,
                    "accepts_tools": getattr(cls, "accepts_tools", False),
                }
            )
    except Exception as exc:
        logger.warning("Failed to list registered agents: %s", exc)

    running = []
    try:
        from openjarvis.tools.agent_tools import _SPAWNED_AGENTS

        running = [{"id": k, **v} for k, v in _SPAWNED_AGENTS.items()]
    except ImportError:
        pass

    return {"registered": registered, "running": running}


@agents_router.post("")
async def create_agent(req: AgentCreateRequest, request: Request):
    """Spawn a new agent."""
    try:
        from openjarvis.tools.agent_tools import AgentSpawnTool

        tool = AgentSpawnTool()
        params = {"agent_type": req.agent_type}
        if req.tools:
            params["tools"] = ",".join(req.tools)
        if req.agent_id:
            params["agent_id"] = req.agent_id
        result = tool.execute(**params)
        if not result.success:
            raise HTTPException(status_code=400, detail=result.content)
        return {
            "status": "created",
            "content": result.content,
            "metadata": result.metadata,
        }
    except ImportError:
        raise HTTPException(status_code=501, detail="Agent tools not available")


@agents_router.delete("/{agent_id}")
async def kill_agent(agent_id: str, request: Request):
    """Kill a running agent."""
    try:
        from openjarvis.tools.agent_tools import AgentKillTool

        tool = AgentKillTool()
        result = tool.execute(agent_id=agent_id)
        if not result.success:
            raise HTTPException(status_code=404, detail=result.content)
        return {"status": "stopped", "agent_id": agent_id}
    except ImportError:
        raise HTTPException(status_code=501, detail="Agent tools not available")


@agents_router.post("/{agent_id}/message")
async def message_agent(agent_id: str, req: AgentMessageRequest, request: Request):
    """Send a message to a running agent."""
    try:
        from openjarvis.tools.agent_tools import AgentSendTool

        tool = AgentSendTool()
        result = tool.execute(agent_id=agent_id, message=req.message)
        if not result.success:
            raise HTTPException(status_code=404, detail=result.content)
        return {"status": "sent", "content": result.content}
    except ImportError:
        raise HTTPException(status_code=501, detail="Agent tools not available")


# ---- Memory routes ----

memory_router = APIRouter(prefix="/v1/memory", tags=["memory"])


def _get_memory_backend(request: Request):
    """Return the app-level memory backend, falling back to a fresh SQLiteMemory."""
    backend = getattr(request.app.state, "memory_backend", None)
    if backend is None:
        try:
            from openjarvis.tools.storage.sqlite import SQLiteMemory

            backend = SQLiteMemory()
        except Exception:
            return None
    return backend


@memory_router.post("/store")
async def memory_store(req: MemoryStoreRequest, request: Request):
    """Store content in memory."""
    backend = _get_memory_backend(request)
    if backend is None:
        return {"status": "stored", "note": "no backend available"}
    try:
        backend.store(req.content, metadata=req.metadata or {})
        return {"status": "stored"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@memory_router.post("/search")
async def memory_search(req: MemorySearchRequest, request: Request):
    """Search memory for relevant content."""
    backend = _get_memory_backend(request)
    if backend is None:
        return {"results": []}
    try:
        results = backend.retrieve(req.query, top_k=req.top_k)
        items = [
            {
                "content": r.content,
                "score": getattr(r, "score", 0.0),
                "metadata": getattr(r, "metadata", {}),
            }
            for r in results
        ]
        return {"results": items}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@memory_router.get("/stats")
async def memory_stats(request: Request):
    """Get memory backend statistics."""
    backend = _get_memory_backend(request)
    if backend is None:
        return {"entries": 0, "backend": "none", "status": "not_configured"}
    try:
        return {
            "entries": backend.count(),
            "backend": getattr(backend, "backend_id", "unknown"),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@memory_router.get("/config")
async def memory_config(request: Request):
    """Return current memory configuration."""
    try:
        config = getattr(request.app.state, "config", None)
        if config is None:
            from openjarvis.core.config import load_config

            config = load_config()
        backend = getattr(request.app.state, "memory_backend", None)
        return {
            "backend_type": (
                backend.backend_id
                if backend is not None
                else config.memory.default_backend
            ),
            "context_top_k": config.memory.context_top_k,
            "context_min_score": config.memory.context_min_score,
            "context_max_tokens": config.memory.context_max_tokens,
            "context_from_memory": config.agent.context_from_memory,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@memory_router.post("/index")
async def memory_index(req: MemoryIndexRequest, request: Request):
    """Index files from a path into memory."""
    try:
        from pathlib import Path

        from openjarvis.tools.storage.ingest import ingest_path

        target = Path(req.path).expanduser().resolve()
        if not target.exists():
            raise HTTPException(status_code=404, detail=f"Path not found: {req.path}")

        backend = _get_memory_backend(request)
        if backend is None:
            raise HTTPException(status_code=503, detail="No memory backend available")

        chunks = ingest_path(target)
        stored = 0
        for chunk in chunks:
            metadata = {"source": getattr(chunk, "source", str(target))}
            if hasattr(chunk, "metadata") and chunk.metadata:
                metadata.update(chunk.metadata)
            backend.store(chunk.content, metadata=metadata)
            stored += 1

        return {"status": "indexed", "chunks_indexed": stored}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Traces routes ----

traces_router = APIRouter(prefix="/v1/traces", tags=["traces"])


def _serialise_trace(trace) -> dict:
    """Convert a Trace dataclass to a frontend-friendly dict."""
    import datetime
    from dataclasses import asdict

    d = asdict(trace)
    d["id"] = d.pop("trace_id", "")
    started = d.pop("started_at", 0.0)
    d["created_at"] = (
        datetime.datetime.fromtimestamp(started, tz=datetime.timezone.utc).isoformat()
        if started
        else None
    )
    dur = d.pop("total_latency_seconds", 0.0)
    d["duration_ms"] = round(dur * 1000)
    for step in d.get("steps", []):
        st = step.get("step_type")
        if hasattr(st, "value"):
            step["step_type"] = st.value
    return d


@traces_router.get("")
async def list_traces(request: Request, limit: int = 20):
    """List recent traces."""
    try:
        store = getattr(request.app.state, "trace_store", None)
        if store is None:
            return {"traces": []}
        traces = store.list_traces(limit=limit)
        items = [_serialise_trace(t) for t in traces]
        return {"traces": items}
    except Exception as exc:
        return {"traces": [], "error": str(exc)}


@traces_router.get("/{trace_id}")
async def get_trace(trace_id: str, request: Request):
    """Get a specific trace by ID."""
    try:
        store = getattr(request.app.state, "trace_store", None)
        if store is None:
            raise HTTPException(status_code=404, detail="Trace not found")
        trace = store.get(trace_id)
        if trace is None:
            raise HTTPException(status_code=404, detail="Trace not found")
        return _serialise_trace(trace)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Telemetry routes ----

telemetry_router = APIRouter(prefix="/v1/telemetry", tags=["telemetry"])


@telemetry_router.get("/stats")
async def telemetry_stats(request: Request):
    """Get aggregated telemetry statistics."""
    try:
        from dataclasses import asdict

        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.telemetry.aggregator import TelemetryAggregator

        db_path = DEFAULT_CONFIG_DIR / "telemetry.db"
        if not db_path.exists():
            return {"total_requests": 0, "total_tokens": 0}

        session_start = getattr(request.app.state, "session_start", None)
        agg = TelemetryAggregator(db_path)
        try:
            stats = agg.summary(since=session_start)
            d = asdict(stats)
            d.pop("per_model", None)
            d.pop("per_engine", None)
            d["total_requests"] = d.pop("total_calls", 0)
            return d
        finally:
            agg.close()
    except Exception as exc:
        return {"error": str(exc)}


@telemetry_router.get("/energy")
async def telemetry_energy(request: Request):
    """Get energy monitoring data."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.telemetry.aggregator import TelemetryAggregator

        db_path = DEFAULT_CONFIG_DIR / "telemetry.db"
        if not db_path.exists():
            return {
                "total_energy_j": 0,
                "energy_per_token_j": 0,
                "avg_power_w": 0,
                "cpu_temp_c": None,
                "gpu_temp_c": None,
            }

        session_start = getattr(request.app.state, "session_start", None)
        agg = TelemetryAggregator(db_path)
        try:
            stats = agg.summary(since=session_start)
            total_energy = stats.total_energy_joules
            total_tokens = stats.total_tokens
            total_latency = stats.total_latency
            return {
                "total_energy_j": total_energy,
                "energy_per_token_j": (
                    total_energy / total_tokens if total_tokens > 0 else 0
                ),
                "avg_power_w": (
                    total_energy / total_latency if total_latency > 0 else 0
                ),
                "cpu_temp_c": None,
                "gpu_temp_c": None,
            }
        finally:
            agg.close()
    except Exception as exc:
        return {"error": str(exc)}


# ---- Skills routes ----

skills_router = APIRouter(prefix="/v1/skills", tags=["skills"])
workflows_router = APIRouter(prefix="/v1/workflows", tags=["workflows"])

_SKILL_TEMPLATE_RE = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")
_DESKTOP_SAFE_SKILL_TOOLS = {
    "calculator",
    "code_interpreter",
    "file_read",
    "http_request",
    "llm_call",
    "llm",
    "memory_index",
    "memory_retrieve",
    "memory_search",
    "memory_store",
    "pdf_extract",
    "shell_exec",
    "think",
    "web_search",
}
_DESKTOP_SKILL_TOOL_MODULES = {
    "calculator": "openjarvis.tools.calculator",
    "code_interpreter": "openjarvis.tools.code_interpreter",
    "file_read": "openjarvis.tools.file_read",
    "http_request": "openjarvis.tools.http_request",
    "llm_call": "openjarvis.tools.llm_tool",
    "llm": "openjarvis.tools.llm_tool",
    "memory_index": "openjarvis.tools.storage_tools",
    "memory_retrieve": "openjarvis.tools.storage_tools",
    "memory_search": "openjarvis.tools.storage_tools",
    "memory_store": "openjarvis.tools.storage_tools",
    "pdf_extract": "openjarvis.tools.pdf_tool",
    "shell_exec": "openjarvis.tools.shell_exec",
    "think": "openjarvis.tools.think",
    "web_search": "openjarvis.tools.web_search",
}


def _configured_skill_dir(request: Request) -> Path:
    config = getattr(request.app.state, "config", None)
    skills_config = getattr(config, "skills", None)
    raw_dir = getattr(skills_config, "skills_dir", "~/.openjarvis/skills/")
    return Path(raw_dir).expanduser()


def _skill_search_roots(request: Request) -> list[tuple[str, Path]]:
    builtin = Path(__file__).resolve().parents[1] / "skills" / "data"
    roots = [
        ("workspace", Path("./skills")),
        ("user", _configured_skill_dir(request)),
        ("built-in", builtin),
    ]
    deduped: list[tuple[str, Path]] = []
    seen: set[str] = set()
    for label, root in roots:
        key = (
            str(root.expanduser().resolve())
            if root.exists()
            else str(root.expanduser())
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append((label, root.expanduser()))
    return deduped


def _discover_skill_records(request: Request) -> list[tuple[Any, str, Path]]:
    from openjarvis.skills.loader import discover_skills

    records: list[tuple[Any, str, Path]] = []
    seen: set[str] = set()
    for source, root in _skill_search_roots(request):
        for manifest in discover_skills(root):
            if manifest.name in seen:
                continue
            seen.add(manifest.name)
            records.append((manifest, source, root))
    return records


def _skill_tool_names(manifest: Any) -> list[str]:
    names: list[str] = []
    for step in getattr(manifest, "steps", []) or []:
        tool_name = getattr(step, "tool_name", "")
        if tool_name:
            names.append(tool_name)
    return sorted(set(names))


def _skill_input_keys(manifest: Any) -> list[str]:
    output_keys = {
        getattr(step, "output_key", "")
        for step in getattr(manifest, "steps", []) or []
        if getattr(step, "output_key", "")
    }
    keys: set[str] = set()
    for step in getattr(manifest, "steps", []) or []:
        template = getattr(step, "arguments_template", "") or ""
        keys.update(_SKILL_TEMPLATE_RE.findall(template))
    return sorted(k for k in keys if k not in output_keys)


def _workflow_roots() -> list[tuple[str, Path]]:
    return [
        ("workspace", Path("./workflows")),
        ("user", Path("~/.openjarvis/workflows/").expanduser()),
    ]


def _serialize_skill(
    manifest: Any,
    source: str,
    root: Path,
    *,
    available_names: set[str],
    executable_tools: set[str],
) -> dict[str, Any]:
    tool_names = _skill_tool_names(manifest)
    missing_dependencies = [
        dep
        for dep in getattr(manifest, "depends", []) or []
        if dep not in available_names
    ]
    missing_runtime_tools = [
        name for name in tool_names if name not in executable_tools
    ]
    return {
        "name": manifest.name,
        "version": getattr(manifest, "version", ""),
        "description": getattr(manifest, "description", ""),
        "author": getattr(manifest, "author", ""),
        "source": source,
        "root": str(root),
        "tags": list(getattr(manifest, "tags", []) or []),
        "required_capabilities": list(
            getattr(manifest, "required_capabilities", []) or []
        ),
        "depends": list(getattr(manifest, "depends", []) or []),
        "missing_dependencies": missing_dependencies,
        "input_keys": _skill_input_keys(manifest),
        "tool_names": tool_names,
        "missing_runtime_tools": missing_runtime_tools,
        "run_ready": not missing_dependencies and not missing_runtime_tools,
        "user_invocable": bool(getattr(manifest, "user_invocable", True)),
        "disable_model_invocation": bool(
            getattr(manifest, "disable_model_invocation", False)
        ),
        "markdown_content": getattr(manifest, "markdown_content", ""),
        "steps": [
            {
                "tool_name": getattr(step, "tool_name", ""),
                "skill_name": getattr(step, "skill_name", ""),
                "arguments_template": getattr(step, "arguments_template", "{}"),
                "output_key": getattr(step, "output_key", ""),
            }
            for step in getattr(manifest, "steps", []) or []
        ],
    }


def _build_skill_tool_executor(request: Request):
    cached = getattr(request.app.state, "_desktop_skill_tool_executor", None)
    if cached is not None:
        return cached

    import importlib

    import openjarvis.tools  # noqa: F401
    from openjarvis.core.registry import ToolRegistry
    from openjarvis.tools._stubs import BaseTool, ToolExecutor

    for name, module_name in _DESKTOP_SKILL_TOOL_MODULES.items():
        if ToolRegistry.contains(name):
            continue
        module = importlib.import_module(module_name)
        if not ToolRegistry.contains(name):
            try:
                importlib.reload(module)
            except ValueError:
                pass

    tools = []
    memory_backend = getattr(request.app.state, "memory_backend", None)
    knowledge_store = getattr(request.app.state, "knowledge_store", None)
    engine = getattr(request.app.state, "engine", None)
    model = getattr(request.app.state, "model", "")
    bus = getattr(request.app.state, "bus", None)

    for name in sorted(_DESKTOP_SAFE_SKILL_TOOLS):
        if not ToolRegistry.contains(name):
            continue
        tool_cls = ToolRegistry.get(name)
        try:
            if name in {
                "memory_index",
                "memory_retrieve",
                "memory_search",
                "memory_store",
            }:
                tool = tool_cls(memory_backend or knowledge_store)
            elif name in {"llm", "llm_call"}:
                tool = tool_cls(engine, model=model)
            elif isinstance(tool_cls, type) and issubclass(tool_cls, BaseTool):
                tool = tool_cls()
            elif isinstance(tool_cls, BaseTool):
                tool = tool_cls
            else:
                continue
        except Exception:
            continue
        tools.append(tool)

    executor = ToolExecutor(
        tools,
        bus,
        interactive=True,
        confirm_callback=lambda _prompt: True,
    )
    request.app.state._desktop_skill_tool_executor = executor
    request.app.state._desktop_skill_tool_names = sorted(
        {tool.spec.name for tool in tools}
    )
    return executor


def _desktop_executable_tool_names(request: Request) -> set[str]:
    _build_skill_tool_executor(request)
    return set(getattr(request.app.state, "_desktop_skill_tool_names", []) or [])


def _get_skill_record(request: Request, skill_name: str) -> tuple[Any, str, Path]:
    for manifest, source, root in _discover_skill_records(request):
        if manifest.name == skill_name:
            return manifest, source, root
    raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")


@skills_router.get("")
async def list_skills(request: Request):
    """List installed and built-in skills with desktop-ready metadata."""
    try:
        records = _discover_skill_records(request)
        available_names = {manifest.name for manifest, _, _ in records}
        executable_tools = _desktop_executable_tool_names(request)
        skills = [
            _serialize_skill(
                manifest,
                source,
                root,
                available_names=available_names,
                executable_tools=executable_tools,
            )
            for manifest, source, root in records
        ]
        return {
            "skills": sorted(skills, key=lambda item: item["name"]),
            "roots": [
                {
                    "source": source,
                    "path": str(root),
                    "exists": root.exists(),
                }
                for source, root in _skill_search_roots(request)
            ],
            "execution": {
                "available_tools": sorted(executable_tools),
                "blocked_tools": sorted(
                    {
                        name
                        for manifest, _, _ in records
                        for name in _skill_tool_names(manifest)
                        if name not in executable_tools
                    }
                ),
            },
        }
    except Exception as exc:
        logger.warning("Failed to list skills: %s", exc)
        return {"skills": [], "roots": [], "execution": {"available_tools": []}}


@skills_router.get("/{skill_name}")
async def get_skill(skill_name: str, request: Request):
    """Return details for a single skill."""
    manifest, source, root = _get_skill_record(request, skill_name)
    records = _discover_skill_records(request)
    return _serialize_skill(
        manifest,
        source,
        root,
        available_names={record[0].name for record in records},
        executable_tools=_desktop_executable_tool_names(request),
    )


@skills_router.post("/{skill_name}/run")
async def run_skill(skill_name: str, req: SkillRunRequest, request: Request):
    """Run a user-invocable skill when all required runtime tools are safe."""
    manifest, _, _ = _get_skill_record(request, skill_name)
    if not getattr(manifest, "user_invocable", True):
        raise HTTPException(status_code=409, detail="Skill is not user-invocable")

    executable_tools = _desktop_executable_tool_names(request)
    missing_runtime_tools = [
        name for name in _skill_tool_names(manifest) if name not in executable_tools
    ]
    if missing_runtime_tools:
        raise HTTPException(
            status_code=409,
            detail={
                "message": (
                    "Skill needs tools that are not enabled for"
                    " desktop execution"
                ),
                "missing_runtime_tools": missing_runtime_tools,
            },
        )

    def _run() -> dict[str, Any]:
        from openjarvis.core.events import EventBus
        from openjarvis.skills.manager import SkillManager

        bus = getattr(request.app.state, "bus", None) or EventBus()
        manager = SkillManager(bus=bus)
        manager.discover(paths=[root for _, root in _skill_search_roots(request)])
        manager.set_tool_executor(_build_skill_tool_executor(request))
        result = manager.execute(skill_name, req.context or {})
        return {
            "skill_name": result.skill_name,
            "success": result.success,
            "context": result.context,
            "step_results": [
                {
                    "tool_name": step.tool_name,
                    "content": step.content,
                    "success": step.success,
                    "usage": step.usage,
                    "cost_usd": step.cost_usd,
                    "latency_seconds": step.latency_seconds,
                    "metadata": step.metadata,
                }
                for step in result.step_results
            ],
        }

    return await run_in_threadpool(_run)


@skills_router.post("")
async def install_skill(request: Request):
    """Install a skill (placeholder)."""
    return {
        "status": "not_implemented",
        "message": "Use TOML files in ~/.openjarvis/skills/",
    }


@skills_router.delete("/{skill_name}")
async def remove_skill(skill_name: str, request: Request):
    """Remove a skill (placeholder)."""
    return {
        "status": "not_implemented",
        "message": "Skill removal not yet supported via API",
    }


@workflows_router.get("")
async def list_workflows(request: Request):
    """List workflow graph definitions available to the desktop app."""
    try:
        from openjarvis.workflow.loader import discover_workflows

        roots = _workflow_roots()
        workflows = []
        seen: set[str] = set()
        for source, root in roots:
            for name, graph in discover_workflows([root]).items():
                if name in seen:
                    continue
                seen.add(name)
                workflows.append(
                    {
                        "name": name,
                        "source": source,
                        "root": str(root),
                        "nodes": [
                            {
                                "id": node.id,
                                "type": node.node_type.value,
                                "agent": node.agent,
                                "tools": node.tools,
                                "config": node.config,
                                "condition_expr": node.condition_expr,
                                "max_iterations": node.max_iterations,
                                "transform_expr": node.transform_expr,
                            }
                            for node in graph.nodes
                        ],
                        "edges": [
                            {
                                "source": edge.source,
                                "target": edge.target,
                                "condition": edge.condition,
                            }
                            for edge in graph.edges
                        ],
                        "execution_stages": graph.execution_stages(),
                    }
                )
        return {
            "workflows": sorted(workflows, key=lambda item: item["name"]),
            "roots": [
                {"source": source, "path": str(root), "exists": root.exists()}
                for source, root in roots
            ],
            "execution": {
                "status": "catalog_only",
                "detail": (
                    "CLI workflow execution is currently a system-level"
                    " operation."
                ),
            },
        }
    except Exception as exc:
        logger.warning("Failed to list workflows: %s", exc)
        return {"workflows": [], "roots": [], "execution": {"status": "error"}}


# ---- Sessions routes ----

sessions_router = APIRouter(prefix="/v1/sessions", tags=["sessions"])


@sessions_router.get("")
async def list_sessions(request: Request, limit: int = 20):
    """List active sessions."""
    try:
        from openjarvis.sessions.store import SessionStore

        store = SessionStore()
        sessions = store.recent(limit=limit)
        items = [s.to_dict() if hasattr(s, "to_dict") else str(s) for s in sessions]
        return {"sessions": items}
    except Exception as exc:
        return {"sessions": [], "error": str(exc)}


@sessions_router.get("/{session_id}")
async def get_session(session_id: str, request: Request):
    """Get a specific session."""
    try:
        from openjarvis.sessions.store import SessionStore

        store = SessionStore()
        session = store.get(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        return session.to_dict() if hasattr(session, "to_dict") else {"id": session_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---- Budget routes ----

budget_router = APIRouter(prefix="/v1/budget", tags=["budget"])

_budget_limits: Dict[str, Any] = {
    "max_tokens_per_day": None,
    "max_requests_per_hour": None,
}
_budget_usage: Dict[str, int] = {
    "tokens_today": 0,
    "requests_this_hour": 0,
}


@budget_router.get("")
async def get_budget(request: Request):
    """Get current budget usage and limits."""
    return {"limits": _budget_limits, "usage": _budget_usage}


@budget_router.put("/limits")
async def set_budget_limits(req: BudgetLimitsRequest, request: Request):
    """Update budget limits."""
    if req.max_tokens_per_day is not None:
        _budget_limits["max_tokens_per_day"] = req.max_tokens_per_day
    if req.max_requests_per_hour is not None:
        _budget_limits["max_requests_per_hour"] = req.max_requests_per_hour
    return {"status": "updated", "limits": _budget_limits}


# ---- Prometheus metrics ----

metrics_router = APIRouter(tags=["metrics"])


@metrics_router.get("/metrics")
async def prometheus_metrics(request: Request):
    """Prometheus-compatible metrics endpoint."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.telemetry.aggregator import TelemetryAggregator

        db_path = DEFAULT_CONFIG_DIR / "telemetry.db"
        if not db_path.exists():
            from starlette.responses import PlainTextResponse

            return PlainTextResponse("# no telemetry data\n", media_type="text/plain")

        agg = TelemetryAggregator(db_path)
        stats = agg.summary()

        lines = [
            "# HELP openjarvis_requests_total Total requests processed",
            "# TYPE openjarvis_requests_total counter",
            f"openjarvis_requests_total {stats.get('total_requests', 0)}",
            "# HELP openjarvis_tokens_total Total tokens generated",
            "# TYPE openjarvis_tokens_total counter",
            f"openjarvis_tokens_total {stats.get('total_tokens', 0)}",
            "# HELP openjarvis_latency_avg_ms Average latency in milliseconds",
            "# TYPE openjarvis_latency_avg_ms gauge",
            f"openjarvis_latency_avg_ms {stats.get('avg_latency_ms', 0)}",
        ]
        from starlette.responses import PlainTextResponse

        return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain")
    except Exception as exc:
        logger.warning("Failed to collect Prometheus metrics: %s", exc)
        from starlette.responses import PlainTextResponse

        return PlainTextResponse("# No metrics available\n", media_type="text/plain")


# ---- WebSocket streaming routes ----

websocket_router = APIRouter(tags=["websocket"])


@websocket_router.websocket("/v1/chat/stream")
async def websocket_chat_stream(websocket: WebSocket):
    """Stream chat responses over a WebSocket connection.

    Accepts JSON messages of the form::

        {"message": "...", "model": "...", "agent": "..."}

    Sends back JSON chunks::

        {"type": "chunk", "content": "..."}   -- per-token streaming
        {"type": "done",  "content": "..."}   -- final assembled response
        {"type": "error", "detail": "..."}    -- on failure
    """
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                await websocket.send_json(
                    {"type": "error", "detail": "Invalid JSON"},
                )
                continue

            message = data.get("message")
            if not message:
                await websocket.send_json(
                    {"type": "error", "detail": "Missing 'message' field"},
                )
                continue

            model = data.get("model") or getattr(
                websocket.app.state,
                "model",
                "default",
            )
            engine = getattr(websocket.app.state, "engine", None)
            if engine is None:
                await websocket.send_json(
                    {"type": "error", "detail": "No engine configured"},
                )
                continue

            messages = [{"role": "user", "content": message}]

            try:
                # Prefer streaming if the engine supports it
                stream_fn = getattr(engine, "stream", None)
                if stream_fn is not None and (
                    inspect.isasyncgenfunction(stream_fn) or callable(stream_fn)
                ):
                    full_content = ""
                    try:
                        gen = stream_fn(messages, model=model)
                        # Handle both async and sync generators
                        if inspect.isasyncgen(gen):
                            async for token in gen:
                                full_content += token
                                await websocket.send_json(
                                    {"type": "chunk", "content": token},
                                )
                        else:
                            # Sync generator — iterate in a thread to avoid
                            # blocking the event loop
                            for token in gen:
                                full_content += token
                                await websocket.send_json(
                                    {"type": "chunk", "content": token},
                                )
                    except TypeError:
                        # stream() didn't return an iterable; fall back to
                        # generate()
                        result = engine.generate(messages, model=model)
                        content = (
                            result.get("content", "")
                            if isinstance(
                                result,
                                dict,
                            )
                            else str(result)
                        )
                        full_content = content
                        await websocket.send_json(
                            {"type": "chunk", "content": content},
                        )
                    await websocket.send_json(
                        {"type": "done", "content": full_content},
                    )
                else:
                    # No stream method — single-shot generate
                    result = engine.generate(messages, model=model)
                    content = (
                        result.get("content", "")
                        if isinstance(
                            result,
                            dict,
                        )
                        else str(result)
                    )
                    await websocket.send_json(
                        {"type": "chunk", "content": content},
                    )
                    await websocket.send_json(
                        {"type": "done", "content": content},
                    )
            except WebSocketDisconnect:
                raise
            except Exception as exc:
                await websocket.send_json(
                    {"type": "error", "detail": str(exc)},
                )
    except WebSocketDisconnect:
        pass  # Client disconnected — nothing to clean up


# ---- Learning routes ----

learning_router = APIRouter(prefix="/v1/learning", tags=["learning"])


@learning_router.get("/stats")
async def learning_stats(request: Request):
    """Return learning system statistics across all sub-policies."""
    result: Dict[str, Any] = {}

    # Skill discovery
    try:
        from openjarvis.learning.agents.skill_discovery import SkillDiscovery

        discovery = SkillDiscovery()
        result["skill_discovery"] = {
            "available": True,
            "discovered_count": len(discovery.discovered_skills),
        }
    except Exception as exc:
        logger.warning("Failed to load skill discovery stats: %s", exc)
        result["skill_discovery"] = {"available": False}

    return result


@learning_router.get("/policy")
async def learning_policy(request: Request):
    """Return current routing policy configuration."""
    result: Dict[str, Any] = {}

    # Load config and extract learning section
    try:
        from openjarvis.core.config import load_config

        config = load_config()
        lc = config.learning
        result["enabled"] = lc.enabled
        result["update_interval"] = lc.update_interval
        result["auto_update"] = lc.auto_update
        result["routing"] = {
            "policy": lc.routing.policy,
            "min_samples": lc.routing.min_samples,
        }
        result["intelligence"] = {
            "policy": lc.intelligence.policy,
        }
        result["agent"] = {
            "policy": lc.agent.policy,
        }
        result["metrics"] = {
            "accuracy_weight": lc.metrics.accuracy_weight,
            "latency_weight": lc.metrics.latency_weight,
            "cost_weight": lc.metrics.cost_weight,
            "efficiency_weight": lc.metrics.efficiency_weight,
        }
    except Exception as exc:
        logger.warning("Failed to load learning config: %s", exc)
        result["enabled"] = False
        result["routing"] = {"policy": "heuristic", "min_samples": 5}
        result["intelligence"] = {"policy": "none"}
        result["agent"] = {"policy": "none"}
        result["metrics"] = {}

    return result


# ---- Speech routes ----

speech_router = APIRouter(prefix="/v1/speech", tags=["speech"])


def _speech_attr(backend: Any, name: str, default: Any = None) -> Any:
    value = getattr(backend, name, None)
    return value if isinstance(value, str) and value else default


def _normalize_speech_language(language: Any) -> str:
    value = str(language or "").strip()
    if value.lower() in {"auto", "autodetect", "auto-detect", "detect"}:
        return ""
    return value


@speech_router.post("/transcribe")
async def transcribe_speech(request: Request):
    """Transcribe uploaded audio to text."""
    backend = getattr(request.app.state, "speech_backend", None)
    if backend is None:
        raise HTTPException(status_code=501, detail="Speech backend not configured")

    form = await request.form()
    audio_file = form.get("file")
    if audio_file is None:
        raise HTTPException(status_code=400, detail="Missing 'file' field")

    audio_bytes = await audio_file.read()
    language = _normalize_speech_language(form.get("language"))
    if not language:
        config = getattr(request.app.state, "config", None)
        speech_config = getattr(config, "speech", None)
        language = _normalize_speech_language(getattr(speech_config, "language", ""))

    # Detect format from filename
    filename = getattr(audio_file, "filename", "audio.wav")
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "wav"

    try:
        result = await run_in_threadpool(
            backend.transcribe,
            audio_bytes,
            format=ext,
            language=language or None,
        )
    except Exception as exc:
        logger.exception("Speech transcription failed")
        raise HTTPException(
            status_code=500,
            detail=f"Speech transcription failed: {exc}",
        ) from exc

    return {
        "text": result.text,
        "language": result.language,
        "confidence": result.confidence,
        "duration_seconds": result.duration_seconds,
    }


@speech_router.get("/health")
async def speech_health(request: Request):
    """Check if a speech backend is available."""
    backend = getattr(request.app.state, "speech_backend", None)
    if backend is None:
        return {"available": False, "reason": "No speech backend configured"}
    config = getattr(request.app.state, "config", None)
    speech_config = getattr(config, "speech", None)
    return {
        "available": backend.health(),
        "backend": backend.backend_id,
        "model": _speech_attr(
            backend,
            "_model_size",
            getattr(speech_config, "model", None),
        ),
        "language": getattr(speech_config, "language", ""),
        "device": _speech_attr(
            backend,
            "_device",
            getattr(speech_config, "device", None),
        ),
        "compute_type": _speech_attr(
            backend,
            "_compute_type",
            getattr(speech_config, "compute_type", None),
        ),
    }


# ---- Feedback routes ----

feedback_router = APIRouter(prefix="/v1/feedback", tags=["feedback"])


@feedback_router.post("")
async def submit_feedback(req: FeedbackScoreRequest, request: Request):
    """Submit feedback for a trace."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.traces.store import TraceStore

        db_path = DEFAULT_CONFIG_DIR / "traces.db"
        if not db_path.exists():
            raise HTTPException(status_code=404, detail="No trace database")

        store = TraceStore(db_path)
        updated = store.update_feedback(req.trace_id, req.score)
        store.close()

        if not updated:
            raise HTTPException(
                status_code=404, detail=f"Trace '{req.trace_id}' not found"
            )
        return {"status": "recorded", "trace_id": req.trace_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@feedback_router.get("/stats")
async def feedback_stats(request: Request):
    """Get feedback statistics."""
    return {"total": 0, "mean_score": 0.0}


# ---- Optimize routes ----

optimize_router = APIRouter(prefix="/v1/optimize", tags=["optimize"])


@optimize_router.get("/runs")
async def list_optimize_runs(request: Request):
    """List optimization runs."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.learning.optimize.store import OptimizationStore

        db_path = DEFAULT_CONFIG_DIR / "optimize.db"
        if not db_path.exists():
            return {"runs": []}

        store = OptimizationStore(db_path)
        runs = store.list_runs()
        store.close()
        return {"runs": runs}
    except Exception as exc:
        logger.warning("Failed to list optimization runs: %s", exc)
        return {"runs": []}


@optimize_router.get("/runs/{run_id}")
async def get_optimize_run(run_id: str, request: Request):
    """Get optimization run details."""
    try:
        from openjarvis.core.config import DEFAULT_CONFIG_DIR
        from openjarvis.learning.optimize.store import OptimizationStore

        db_path = DEFAULT_CONFIG_DIR / "optimize.db"
        if not db_path.exists():
            return {"run_id": run_id, "status": "not_found"}

        store = OptimizationStore(db_path)
        run = store.get_run(run_id)
        store.close()

        if run is None:
            return {"run_id": run_id, "status": "not_found"}

        return {
            "run_id": run.run_id,
            "status": run.status,
            "benchmark": run.benchmark,
            "trials": len(run.trials),
            "best_trial_id": (run.best_trial.trial_id if run.best_trial else None),
        }
    except Exception as exc:
        logger.warning("Failed to get optimization run %s: %s", run_id, exc)
        return {"run_id": run_id, "status": "not_found"}


@optimize_router.post("/runs")
async def start_optimize_run(req: OptimizeRunRequest, request: Request):
    """Start a new optimization run."""
    return {"status": "started", "run_id": "placeholder"}


def include_all_routes(app) -> None:
    """Include all extended API routers in a FastAPI app."""
    app.include_router(agents_router)
    app.include_router(memory_router)
    app.include_router(traces_router)
    app.include_router(telemetry_router)
    app.include_router(skills_router)
    app.include_router(workflows_router)
    app.include_router(sessions_router)
    app.include_router(budget_router)
    app.include_router(metrics_router)
    app.include_router(websocket_router)
    app.include_router(learning_router)
    app.include_router(speech_router)
    app.include_router(feedback_router)
    app.include_router(optimize_router)

    # Agent Manager routes (if available)
    try:
        if hasattr(app.state, "agent_manager") and app.state.agent_manager:
            from openjarvis.server.agent_manager_routes import (  # noqa: PLC0415
                create_agent_manager_router,
            )

            (
                agents_r,
                templates_r,
                global_r,
                tools_r,
            ) = create_agent_manager_router(app.state.agent_manager)
            app.include_router(agents_r)
            app.include_router(templates_r)
            app.include_router(global_r)
            app.include_router(tools_r)
    except ImportError:
        pass

    # WebSocket bridge for real-time agent events
    try:
        from openjarvis.core.events import get_event_bus
        from openjarvis.server.ws_bridge import create_ws_router

        ws_router = create_ws_router(get_event_bus())
        app.include_router(ws_router)
    except Exception:
        logger.debug("WebSocket bridge not available", exc_info=True)


__all__ = [
    "include_all_routes",
    "agents_router",
    "memory_router",
    "traces_router",
    "telemetry_router",
    "skills_router",
    "workflows_router",
    "sessions_router",
    "budget_router",
    "metrics_router",
    "websocket_router",
    "learning_router",
    "speech_router",
    "feedback_router",
    "optimize_router",
]
