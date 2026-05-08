"""Workflow loader — load workflows from TOML files."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from openjarvis.workflow.graph import WorkflowGraph
from openjarvis.workflow.types import NodeType, WorkflowEdge, WorkflowNode

try:
    import tomllib
except ModuleNotFoundError:
    import tomli as tomllib  # type: ignore[no-redef]


def load_workflow(path: str | Path) -> WorkflowGraph:
    """Load a workflow definition from a TOML file.

    Expected format:
    ```toml
    [workflow]
    name = "my_workflow"

    [[workflow.nodes]]
    id = "researcher"
    type = "agent"
    agent = "orchestrator"
    tools = ["web_search"]

    [[workflow.nodes]]
    id = "summarizer"
    type = "agent"
    agent = "simple"

    [[workflow.edges]]
    source = "researcher"
    target = "summarizer"
    ```
    """
    path = Path(path)
    with open(path, "rb") as fh:
        data = tomllib.load(fh)

    wf_data = data.get("workflow", {})
    name = wf_data.get("name", path.stem)

    graph = WorkflowGraph(name=name)

    for node_data in wf_data.get("nodes", []):
        node = _parse_node(node_data)
        graph.add_node(node)

    for edge_data in wf_data.get("edges", []):
        edge = WorkflowEdge(
            source=edge_data["source"],
            target=edge_data["target"],
            condition=edge_data.get("condition", ""),
        )
        graph.add_edge(edge)

    valid, msg = graph.validate()
    if not valid:
        raise ValueError(f"Invalid workflow in {path}: {msg}")

    return graph


def _parse_node(data: Dict[str, Any]) -> WorkflowNode:
    """Parse a single node from TOML data."""
    node_type = NodeType(data.get("type", "agent"))
    return WorkflowNode(
        id=data["id"],
        node_type=node_type,
        agent=data.get("agent", ""),
        tools=data.get("tools", []),
        config=data.get("config", {}),
        condition_expr=data.get("condition_expr", data.get("condition", "")),
        max_iterations=data.get("max_iterations", 10),
        transform_expr=data.get("transform_expr", data.get("transform", "")),
    )


def discover_workflows(
    paths: list[str | Path] | None = None,
) -> dict[str, WorkflowGraph]:
    """Discover workflow TOML files from standard user/workspace locations.

    First-seen workflow names win so workspace definitions can override user
    definitions when both are present.
    """
    if paths is None:
        paths = [Path("./workflows"), Path("~/.openjarvis/workflows/").expanduser()]

    workflows: dict[str, WorkflowGraph] = {}
    for raw_path in paths:
        root = Path(raw_path).expanduser()
        if not root.exists():
            continue
        candidates = [root] if root.is_file() else sorted(root.rglob("*.toml"))
        for candidate in candidates:
            try:
                graph = load_workflow(candidate)
            except Exception:
                continue
            if graph.name not in workflows:
                workflows[graph.name] = graph
    return workflows


__all__ = ["load_workflow", "discover_workflows"]
