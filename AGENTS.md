# Agent Notes

## Testing

- Use `./scripts/test.sh ...` for Python tests.
- Do not manually install `pytest` into `.venv` for routine testing.
- The desktop app runs `uv sync` for runtime extras and may prune dev-only packages from `.venv`.
- `./scripts/test.sh` runs `uv run --extra dev pytest "$@"`, so pytest is available when needed without fighting the app runtime environment.

## Build Hygiene

- Frontend builds may modify `frontend/tsconfig.tsbuildinfo`; restore it before committing unless the change is intentional.
