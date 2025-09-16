# MCP TUI Runner — Architecture

> Robust, OCR‑free control of terminal UI apps via MCP tools

## 1) Purpose & Scope

This document describes the architecture for an MCP (Model Context Protocol) server that can **launch, observe, and drive text‑mode terminal UIs (TUIs)** on local or remote machines. It exposes a set of **MCP tools** that allow an IDE agent (e.g., Claude Code, Codex, Gemini) to start TUI sessions, send keys, read the current screen as structured text, take screenshots when needed, and assert state—**without resorting to screenshots + OCR**.

### In‑scope

* Interactive control of TUIs (e.g., `htop`, `gitui`, `plato`, ncurses apps) via a **PTY**.
* Accurate reading of the screen by **parsing ANSI/VT sequences** into a semantic screen buffer.
* High‑level actions: start/stop session, send keys, resize, wait/expect patterns, capture frame/screenshot.
* Local execution, SSH, and container/k8s exec backends.
* Basic authentication, multi‑session, logging/recording, and observability.

### Out‑of‑scope (initial)

* Full GUI/X11/Wayland apps (future work with VNC/RDP backends).
* OCR‑based control (only optional for demos; primary path is ANSI parsing).
* Complex access brokering across untrusted tenants (single‑tenant first).

---

## 2) High‑Level Architecture

```
+----------------------+         +-----------------------+
|   IDE Agent / LLM    |  MCP    |   MCP TUI Runner     |
| (Claude/Codex/Gemini)|<------->|  (this server)       |
+----------------------+         +----------+------------+
                                            |
                                            v
                                  +---------+---------+
                                  |   Session Manager |
                                  +---------+---------+
                                            |
                 +--------------------------+---------------------------+
                 v                                                          
        +--------+-------+         +-------------------+        +---------+--------+
        |   PTY Bridge   |  <----> | Terminal Parser   |  --->  | Screen Buffer   |
        | (local/SSH/    |   I/O   | (ANSI/VT parser)  |        | (semantic grid) |
        |  docker/k8s)   |         +-------------------+        +---------+--------+
        +--------+-------+                                                |
                 |                                                        |
                 v                                                        v
         +-------+--------+                                       +-------+--------+
         | Event & Log    |                                       | Renderers      |
         | (ttyrec, traces|                                       | (Text/PNG)     |
         +-----------------+                                       +----------------+
```

**Data path**: PTY emits byte stream → Terminal Parser decodes ANSI/VT → Screen Buffer maintains canonical view → Tools query buffer or render PNG → Agent decides next action and sends keys.

---

## 3) Key Components

### 3.1 MCP Adapter (HTTP/WebSocket JSON‑RPC)

* Hosts MCP tool definitions and routes requests.
* Handles auth (API key or mTLS), rate limiting, request/response schema validation.
* Streams incremental frame diffs where supported.

### 3.2 Session Manager

* Creates/owns TUI sessions; tracks lifecycle/state.
* Stores routing to the chosen **backend** (local, SSH, docker/k8s exec) and its PTY.
* Maintains per‑session configuration (rows/cols, env, cwd, shell).
* Persists metadata and indices for playback (ttyrec/asciinema), debugging, and audit.

### 3.3 PTY Bridge

* Spawns processes in a pseudo‑terminal; forwards input (keys) and emits output bytes.
* Supports:

  * **Local**: spawn under restricted user/namespace.
  * **SSH**: create remote PTY via `ssh` (ControlMaster optional); agent‑side keys stored server‑side.
  * **Containers**: `docker exec -it` / `kubectl exec -it` attaching to a TTY.
* Normalizes signals (SIGWINCH on resize), exit codes, and error conditions.

### 3.4 Terminal Parser

* Decodes **ANSI/VT100/VT220/xterm** sequences into a structured model (cells, attributes, cursor, title, scrollback optional).
* Exposes hooks for:

  * **Diffing** (frame N vs N+1)
  * **Regions** (status bar heuristics, focused pane bounding boxes)
  * **Semantic search** (regex, line ranges)

### 3.5 Screen Buffer (Semantic Grid)

* Authoritative state: `{rows, cols, cells[row][col] {ch, bold, fg/bg}, cursor, title}`.
* Efficient immutable snapshots with sequence numbers (`seq`) plus **diff compression** for streaming.
* Region auto‑detectors (status line, sidebars) are pluggable.

### 3.6 Renderers

* **Text** renderer: returns UTF‑8 screen, with optional regions and cursor position.
* **PNG** renderer: rasterizes buffer (headless xterm style) for human preview/artifacts.
* **Hashing**: Per‑frame content hash (e.g., blake3) for idempotent storage and dedup.

### 3.7 Event & Log Pipeline

* Structured event bus (e.g., OpenTelemetry spans) for session lifecycle, keystrokes, frame deltas.
* Optional **ttyrec/asciinema** recording for replay.
* Log sinks: local files + OTLP/HTTP exporters.

---

## 4) Data Model

### 4.1 Session

```json
{
  "id": "sess_01HZX...",
  "backend": {"type": "local" | "ssh" | "docker" | "k8s", "target": "..."},
  "cmd": "plato",
  "args": ["--demo"],
  "env": {"FOO": "bar"},
  "cwd": "/home/app",
  "rows": 40,
  "cols": 120,
  "created_at": "2025-09-16T12:34:56Z",
  "status": "running" | "exited",
  "last_seq": 127
}
```

### 4.2 Frame (canonical)

```json
{
  "seq": 127,
  "rows": 40,
  "cols": 120,
  "cursor": {"row": 23, "col": 5},
  "title": "plato — Projects",
  "text": "<UTF‑8 full screen>",
  "regions": {
    "status": {"row_start": 39, "row_end": 39, "text": "READY • F1 Help  F10 Quit"},
    "focused": {"bbox": [10,2,20,50], "label": "Run"}
  },
  "hash": "b3:..."
}
```

---

## 5) MCP Tool Surface (v1)

> Tool names are suggestions; adjust to your MCP server conventions.

### `tui.start`

Start a TUI session in a PTY.

* **Input**: `{command, args?, cwd?, env?, rows?, cols?, backend?}`
* **Output**: `{session_id, seq}`

### `tui.read_frame`

Return current canonical frame (or since sequence).

* **Input**: `{session_id, since_seq?}`
* **Output**: `{frame | frames[]}` (server picks best form; may stream diffs)

### `tui.send_keys`

Send key events to the PTY.

* **Input**: `{session_id, keys: ["ENTER","CTRL+C","UP","a","b",...] , throttle_ms?}`
* **Output**: `{ok: true}`

### `tui.expect`

Wait until a pattern appears (or disappears) on the screen.

* **Input**: `{session_id, pattern, timeout_ms, negate?}`
* **Output**: `{matched: boolean, snapshot_seq}`

### `tui.resize`

Resize the PTY.

* **Input**: `{session_id, rows, cols}`
* **Output**: `{ok: true}`

### `tui.screenshot`

PNG snapshot for human preview (not required for control).

* **Input**: `{session_id}`
* **Output**: `{mime: "image/png", data_base64}`

### `tui.close`

Terminate a session.

* **Input**: `{session_id, signal?}`
* **Output**: `{ok: true, exit_code?}`

---

## 6) Control Flows

### 6.1 Launch & Drive a TUI

1. Agent → `tui.start({command:"plato", rows:40, cols:120})`
2. Server spawns PTY, begins parsing, returns `{session_id, seq}`
3. Agent → `tui.read_frame()`; interprets buffer
4. Agent → `tui.send_keys(["DOWN","DOWN","ENTER"])`
5. Agent → `tui.expect({pattern:"Server started on 127.0.0.1:3333", timeout_ms:15000})`
6. Optional → `tui.screenshot()` for artifacts
7. Agent → `tui.close()`

### 6.2 SSH Backend

* `backend: {type:"ssh", host:"srv", user:"app", key_ref:"k1"}`: server opens SSH channel with a PTY, runs command, other steps identical.

### 6.3 Container/K8s Backend

* `backend: {type:"docker", container:"c1"}` or `{type:"k8s", ns:"app", pod:"p1", container:"c2"}`; attach `-it` PTY and drive normally.

---

## 7) Deployment Topologies

* **Single‑node**: MCP server + PTY workers on same host; API key auth.
* **Edge runner**: Control plane exposes MCP; workers run near targets (SSH to on‑prem hosts).
* **Kubernetes**: Server as Deployment; per‑session Worker Pods (Job/Sidecar) for isolation; `kubectl exec` backend to target Pods.

---

## 8) Reliability & Performance

* **tmux integration** for resilient sessions and `capture-pane -p` as last‑resort reads.
* **Key throttling** (10–30 ms) and **debounced resizes** (SIGWINCH storm control).
* **Backpressure**: cap frame FPS; send diffs when subscribers are slow.
* **Resource limits**: cgroups/ulimits per session; idle timeout & reap.
* **Deterministic asserts**: search only in known regions (status/log) to avoid spinner noise.

---

## 9) Security Model

* Auth: API key or mTLS; per‑tool rate limits.
* Isolation: run sessions under dedicated low‑privilege user; optional containers/VMs.
* Secrets: store SSH keys/credentials in OS keyring or KMS; never echo in frames/logs.
* Audit: record keystrokes and frame hashes; redact sensitive lines via regex allow/deny lists.

---

## 10) Observability

* **OpenTelemetry** traces for each tool call; spans for PTY read/write, parse, render.
* **Metrics**: sessions\_active, frame\_fps, parse\_latency\_ms, expect\_timeouts, key\_drop\_count.
* **Logs**: structured JSON; optional ttyrec/asciinema per session with retention policy.

---

## 11) Testing Strategy

* **Unit**: ANSI sequences → buffer states; key encodings; regex matchers.
* **Integration**: drive known TUIs (`htop`, `gitui`) and assert status bar semantics.
* **Golden frames**: snapshot canonical buffers; fuzz escape sequences to validate parser.
* **Replay**: feed recorded VT streams; verify identical buffers and hashes.

---

## 12) Implementation Notes (Tech Choices)

* **Languages** (pick one):

  * **Node.js**: `node-pty`, `@xterm/parser`, `xterm-headless` for PNG; ws/express for MCP.
  * **Python**: `pexpect`/`ptyprocess`, `pyte` parser; FastAPI + WebSocket; Pillow for PNG.
  * **Go**: `creack/pty`, `vt100`/`tcell`; gRPC/JSON‑RPC.
* Prefer **headless terminal parser** approach; use **tmux** as a stability layer in prod.

---

## 13) Limitations & Future Work

* TUIs with nonstandard control sequences may need custom parser adapters.
* Split panes and mouse events: supported via parser hooks but require per‑app heuristics.
* GUI apps (ncurses → curses‑like only); GUI support would require VNC/RFB backend and a different tool set.
* Multi‑tenant RBAC, SSO, and policy engine (OPA) slated for v2.

---

## 14) Roadmap (Proposed)

* **v0.1**: Local backend; start/send/read/expect/resize/close; text frames; basic auth; logs.
* **v0.2**: PNG renderer; SSH backend; ttyrec; metrics + traces.
* **v0.3**: Docker/k8s exec backend; region detectors; diff streaming.
* **v0.4**: tmux orchestration; replay harness; secret redaction; policy hooks.
* **v1.0**: Hardened multi‑tenant deployment; RBAC; mTLS; OPA; HA leader election; autoscaling workers.

---

## 15) Example MCP Tool Schemas (JSON)

```json
{
  "tools": [
    {
      "name": "tui.start",
      "input_schema": {
        "type": "object",
        "properties": {
          "command": {"type": "string"},
          "args": {"type": "array", "items": {"type": "string"}},
          "cwd": {"type": "string"},
          "env": {"type": "object", "additionalProperties": {"type": "string"}},
          "rows": {"type": "integer", "minimum": 10},
          "cols": {"type": "integer", "minimum": 20},
          "backend": {
            "type": "object",
            "properties": {
              "type": {"enum": ["local", "ssh", "docker", "k8s"]},
              "target": {"type": "string"}
            },
            "required": ["type"]
          }
        },
        "required": ["command"]
      },
      "output_schema": {
        "type": "object",
        "properties": {
          "session_id": {"type": "string"},
          "seq": {"type": "integer"}
        },
        "required": ["session_id", "seq"]
      }
    }
  ]
}
```

---

## 16) Security Review Checklist

* [ ] All tool inputs validated; path/env allowlists.
* [ ] Resource limits (CPU/Memory/Wall time) enforced per session.
* [ ] Secrets loaded only at session start; never emitted to frames or logs.
* [ ] SSH keys in KMS; audit on use; revocation supported.
* [ ] Outbound network egress policies defined (deny‑by‑default optional).

---

## 17) Appendix — Operational Playbooks

* **Crash recovery**: auto‑reconnect to `tmux` session; resume `last_seq`.
* **Hot upgrades**: drain existing sessions; restart workers; keep control plane up.
* **Incident triage**: retrieve session ttyrec + structured logs; correlate via trace IDs.

---

### TL;DR

Drive TUIs reliably by **parsing the terminal stream** (not OCR). Expose a clean MCP surface (`start`, `read_frame`, `send_keys`, `expect`, `resize`, `screenshot`, `close`). Keep sessions isolated, observable, and replayable. Scale from local to SSH and k8s backends with the same semantics.

