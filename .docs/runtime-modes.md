# Runtime modes

Agents has a global runtime mode switch in the chat toolbar. The mode is passed to the provider at session start and affects how tool use is handled.

## Full access (default)

- **Codex/Gemini**: starts sessions with `approvalPolicy: never` and `sandboxMode: danger-full-access`.
- **Claude Code**: passes `--dangerously-skip-permissions` to the CLI subprocess. No control protocol is used.

## Supervised (approval-required)

- **Codex/Gemini**: starts sessions with `approvalPolicy: on-request` and `sandboxMode: workspace-write`. The provider requests approval for each tool use via the control protocol.
- **Claude Code**: uses a lightweight stdin/stdout control protocol. Before executing a tool, the CLI sends a `can_use_tool` request; Agents responds with allow or block. The user is prompted in-app.

## Interaction modes

In addition to runtime mode, Agents supports a per-turn interaction mode:

- **Default**: standard agentic execution.
- **Plan**: prompts the agent to produce a plan before acting (provider-dependent behavior).
