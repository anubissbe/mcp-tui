# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP TUI Runner is an architecture specification for a Model Context Protocol (MCP) server that provides robust, OCR-free control of terminal UI applications (TUIs). The project aims to enable IDE agents to launch, observe, and drive text-mode terminal UIs via MCP tools by parsing ANSI/VT sequences into semantic screen buffers.

### Current State

This is an early-stage project containing:
- Comprehensive architecture specification (`idea.md`)
- Agent OS framework for AI-assisted development
- No implementation code yet - this is a planning/design phase

## Agent OS Commands

This repository uses Agent OS for AI-assisted development workflows. Key commands available:

### Product Planning & Analysis
```bash
# Plan a new product (if starting fresh)
@.claude/commands/plan-product.md

# Analyze existing codebase and install Agent OS
@.claude/commands/analyze-product.md
```

### Development Workflow
```bash
# Create detailed specifications for features
@.claude/commands/create-spec.md

# Generate task breakdown from specifications
@.claude/commands/create-tasks.md

# Execute planned tasks
@.claude/commands/execute-tasks.md
```

### Agent OS Sub-Agents
- `context-fetcher`: Retrieve relevant information from Agent OS documentation
- `file-creator`: Create files, directories, and apply templates
- `git-workflow`: Handle git operations, branch management, commits
- `project-manager`: Check task completeness and update tracking docs
- `test-runner`: Run tests and analyze failures
- `date-checker`: Determine current date for context

## Architecture Components

Based on the specification in `idea.md`, the system will consist of:

### Core Components
1. **MCP Adapter**: HTTP/WebSocket JSON-RPC interface with auth and rate limiting
2. **Session Manager**: TUI session lifecycle management with backend routing
3. **PTY Bridge**: Process spawning in pseudo-terminals (local/SSH/docker/k8s)
4. **Terminal Parser**: ANSI/VT sequence decoder into structured screen buffers
5. **Screen Buffer**: Semantic grid maintaining canonical terminal state
6. **Renderers**: Text and PNG output with frame diffing

### MCP Tool Surface (Planned)
- `tui.start` - Start TUI session in PTY
- `tui.read_frame` - Get current screen state
- `tui.send_keys` - Send key events to PTY
- `tui.expect` - Wait for screen patterns
- `tui.resize` - Resize PTY dimensions
- `tui.screenshot` - PNG snapshot for preview
- `tui.close` - Terminate session

### Technology Stack (Proposed)
The architecture document suggests multiple implementation options:
- **Node.js**: `node-pty`, `@xterm/parser`, `xterm-headless`, WebSocket/Express
- **Python**: `pexpect`/`ptyprocess`, `pyte` parser, FastAPI + WebSocket
- **Go**: `creack/pty`, `vt100`/`tcell`, gRPC/JSON-RPC

## Development Phases

Per the roadmap in `idea.md`:
- **v0.1**: Local backend, basic tools, text frames, auth, logs
- **v0.2**: PNG renderer, SSH backend, ttyrec, metrics
- **v0.3**: Docker/k8s exec, region detectors, diff streaming
- **v0.4**: tmux orchestration, replay, secret redaction
- **v1.0**: Multi-tenant, RBAC, mTLS, HA, autoscaling

## Key Use Cases

The system will enable AI agents to:
- Drive interactive TUIs like `htop`, `gitui`, `plato`, ncurses apps
- Perform cross-browser testing with real browser automation
- Execute system administration tasks via terminal interfaces
- Automate deployment workflows through terminal-based tools
- Debug applications by interacting with TUI debuggers

## Testing Strategy

When implementation begins:
- **Unit tests**: ANSI sequence parsing, key encoding, regex matching
- **Integration tests**: Drive known TUIs and assert screen states
- **Golden frame tests**: Snapshot canonical buffers for regression testing
- **Replay tests**: Feed recorded VT streams and verify identical outputs

## Security Considerations

The architecture includes:
- API key or mTLS authentication
- Session isolation under restricted users/namespaces
- SSH key/credential storage in OS keyring or KMS
- Audit logging with sensitive data redaction
- Rate limiting and resource constraints per session