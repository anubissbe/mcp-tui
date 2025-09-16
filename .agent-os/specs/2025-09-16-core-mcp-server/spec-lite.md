# Core MCP Server for Terminal UI Control - Lite Summary

Implement foundational MCP server that enables AI agents to control terminal UI applications through JSON-RPC interface with local PTY backend, ANSI parsing, and essential MCP tools (start, read_frame, send_keys, expect, close) for reliable TUI automation without OCR.

## Key Points
- Direct PTY backend for spawning and controlling terminal applications
- ANSI parser for converting escape sequences to structured JSON output
- Essential MCP tools providing start/read/write/expect/close operations for TUI automation