# Technical Stack

> Last Updated: 2025-09-16
> Version: 1.0.0

## Application Framework

- **Protocol:** Model Context Protocol (MCP) JSON-RPC over HTTP/WebSocket
- **Architecture:** Server-side terminal control with semantic ANSI parsing
- **Deployment:** Containerized service with multi-backend execution support

## Backend Runtime Options

**Primary Options (choose one):**
- **Node.js**: `node-pty`, `@xterm/parser`, `xterm-headless` for rendering
- **Python**: `pexpect`/`ptyprocess`, `pyte` parser, FastAPI + WebSocket
- **Go**: `creack/pty`, `vt100`/`tcell` parsing, gRPC/JSON-RPC

## Terminal Processing Stack

**PTY Management:**
- **Local Execution:** OS-native pseudo-terminal with process isolation
- **SSH Backend:** ControlMaster connection pooling, agent forwarding
- **Container Integration:** Docker exec -it, kubectl exec -it interfaces

**ANSI/VT Parsing:**
- **Sequence Parsing:** VT100/VT220/xterm escape sequence interpretation
- **Screen Buffer:** Semantic grid with cell attributes (fg/bg, bold, cursor)
- **Region Detection:** Status bars, focused elements, application-specific areas

## Data Storage

**Session State:**
- **Memory:** In-memory session tracking with persistent metadata
- **Recording:** ttyrec/asciinema format for session replay
- **Caching:** Frame content hashing for efficient diff streaming

**Configuration Storage:**
- **Local:** JSON/YAML configuration files
- **Secrets:** OS keyring integration, KMS support for SSH keys
- **Session Persistence:** Optional tmux integration for resilient sessions

## Security & Authentication

**Access Control:**
- **API Authentication:** API key or mutual TLS (mTLS)
- **Rate Limiting:** Per-tool request throttling
- **Process Isolation:** Dedicated user contexts, cgroups/ulimits

**Credential Management:**
- **SSH Keys:** OS keyring storage, KMS integration
- **Secret Redaction:** Configurable regex patterns for sensitive content
- **Audit Logging:** Comprehensive keystroke and frame logging

## Observability Stack

**Monitoring & Metrics:**
- **Telemetry:** OpenTelemetry spans and metrics
- **Performance:** Frame FPS, parse latency, session lifecycle tracking
- **Health Checks:** Session status, backend connectivity monitoring

**Logging & Recording:**
- **Structured Logging:** JSON format with correlation IDs
- **Session Recording:** ttyrec/asciinema with retention policies
- **Debug Artifacts:** PNG screenshots for human inspection

## Network & Communication

**MCP Integration:**
- **Transport:** HTTP/WebSocket JSON-RPC
- **Schema Validation:** Request/response schema enforcement
- **Streaming:** Incremental frame diff streaming support

**Backend Connectivity:**
- **SSH:** Connection multiplexing, agent forwarding
- **Container APIs:** Docker daemon, Kubernetes API integration
- **Network Security:** Configurable egress policies, firewall integration

## Development & Testing

**Testing Framework:**
- **Unit Testing:** ANSI sequence parsing, buffer state validation
- **Integration Testing:** Known TUI application automation (htop, gitui)
- **Golden Frame Testing:** Snapshot-based buffer validation
- **Fuzz Testing:** Random escape sequence robustness testing

**Development Tools:**
- **Hot Reload:** Development server with session preservation
- **Debug Interface:** Frame inspection, sequence analysis tools
- **Replay Testing:** Recorded session playback for debugging

## Deployment Architecture

**Container Runtime:**
- **Base Image:** Minimal Linux with terminal emulation support
- **Resource Limits:** CPU/memory constraints per session
- **Security:** Non-root execution, read-only filesystem where possible

**Orchestration Options:**
- **Single Node:** Direct process execution with local PTY
- **Kubernetes:** Deployment with per-session Worker Pods
- **Docker Swarm:** Service-based deployment with session affinity

**High Availability:**
- **Session Resilience:** tmux integration for crash recovery
- **Load Balancing:** Session-aware routing for multi-instance deployment
- **Backup & Recovery:** Session state persistence and restoration