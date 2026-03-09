# Provider prerequisites

## Codex

- Install the Codex CLI so `codex` is on your PATH (minimum version enforced at session start).
- Authenticate before running Agents (via API key or ChatGPT auth supported by Codex).
- Agents starts `codex app-server` per session (JSON-RPC over stdio).

## Gemini

- Install the Gemini CLI so `gemini` is on your PATH.
- Authenticate before running Agents.
- Agents starts `gemini app-server` per session (JSON-RPC over stdio).

## Claude Code

- Install the Claude Code CLI so `claude` is on your PATH.
- Minimum supported version: **v2.0.0** (older versions will be rejected at session start with an upgrade message).
- Authenticate via `claude` (API key or Claude.ai login).
- Unlike Codex/Gemini, Claude Code does **not** use a persistent daemon. Agents spawns `claude -p --output-format stream-json` per turn and resumes sessions via `--resume <session_id>`.
- Session state is stored by the Claude CLI in `~/.claude/projects/`.
