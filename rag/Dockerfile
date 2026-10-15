# The knowledge MCP server as a shared HTTP endpoint (streamable HTTP on :8765/mcp),
# for teams' AI tools to query business context. Build from the repo root:
#
#   docker build -f rag/Dockerfile -t knowledge-mcp .
#   docker run -p 8765:8765 -e NEO4J_URI=… -e NEO4J_PASSWORD=… knowledge-mcp
#
# Deploys as-is to Azure Container Apps (see README › Shared MCP endpoint).
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /uvx /usr/local/bin/
WORKDIR /srv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy HOST=0.0.0.0 PORT=8765

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY rag/ rag/
COPY knowledge/ knowledge/
COPY tests/ tests/
# Index at build time: the image starts serving straight away (embedding model included).
RUN uv run python -m rag.build

EXPOSE 8765
CMD ["uv", "run", "--no-sync", "python", "-m", "rag.server", "--http"]
