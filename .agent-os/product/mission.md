# Product Mission

> Last Updated: 2025-09-16
> Version: 1.0.0

## Pitch

The MCP TUI Runner is an innovative Model Context Protocol (MCP) server that provides AI agents with robust, OCR-free control over terminal-based user interfaces (TUIs). Unlike traditional screen automation solutions that rely on image processing and optical character recognition, our system directly parses ANSI/VT terminal sequences to provide accurate, semantic understanding of terminal applications.

This enables AI development assistants like Claude Code to interact with command-line tools (htop, gitui, plato, ncurses apps) in a precise, reliable manner - opening new possibilities for AI-driven system administration, development workflows, and application testing.

## Users

**Primary Users:**
- **AI Development Teams**: Building intelligent coding assistants and development automation tools
- **DevOps Engineers**: Seeking automated monitoring and system administration capabilities
- **QA Automation Teams**: Testing terminal-based applications and command-line interfaces
- **System Administrators**: Automating routine terminal-based maintenance tasks

**Secondary Users:**
- **Research Teams**: Studying AI-human interaction in terminal environments
- **Tool Developers**: Building applications that need programmatic TUI control
- **Educational Institutions**: Teaching system administration and automation concepts

## The Problem

Current terminal automation solutions face critical limitations:

**Screenshot + OCR Approach Problems:**
- Unreliable text recognition, especially with terminal colors and formatting
- High computational overhead for image processing
- Fragile to display scaling, font changes, and terminal themes
- Cannot capture semantic structure of terminal applications

**Manual Scripting Limitations:**
- Requires extensive application-specific knowledge
- Brittle to UI changes and timing variations
- Difficult to maintain across different terminal environments
- Poor error handling and state detection capabilities

**Integration Challenges:**
- No standardized way for AI agents to interact with terminal applications
- Complex setup for remote execution (SSH, containers, Kubernetes)
- Limited observability and debugging capabilities
- Security concerns with credential management

## Differentiators

**Semantic Terminal Understanding:**
- Direct ANSI/VT sequence parsing eliminates OCR unreliability
- Structured screen buffer provides rich semantic information
- Region detection for status bars, focused elements, and application areas
- Content hashing for efficient change detection and deduplication

**Universal Backend Support:**
- Local execution with proper isolation and security
- SSH backend for remote system control
- Docker and Kubernetes integration for containerized environments
- Consistent API across all execution contexts

**AI-Native Design:**
- Purpose-built MCP (Model Context Protocol) integration
- Clean tool surface designed for AI agent consumption
- Structured data models that AI systems can easily interpret
- Built-in expect/wait patterns for reliable automation

**Enterprise-Grade Reliability:**
- tmux integration for session resilience
- Comprehensive logging with ttyrec/asciinema recording
- OpenTelemetry observability and metrics
- Resource limits and security isolation

## Key Features

**Core Terminal Control:**
- Start/stop TUI sessions with configurable environment and dimensions
- Send key sequences with proper throttling and timing control
- Read current screen state as structured text with cursor position
- Resize terminal dimensions dynamically
- Pattern matching and expectation-based state waiting

**Advanced Parsing Engine:**
- Full ANSI/VT100/VT220/xterm sequence support
- Maintains semantic screen buffer with attributes and formatting
- Region auto-detection for application-specific UI elements
- Diff-based frame streaming for efficient updates
- Content hashing for idempotent operations

**Multi-Backend Execution:**
- Local process spawning with security sandboxing
- SSH remote execution with key management
- Docker container integration via exec interface
- Kubernetes pod interaction for cloud-native environments
- Unified API regardless of execution backend

**Observability and Debugging:**
- Structured event logging with OpenTelemetry integration
- Session recording in ttyrec/asciinema formats
- Real-time metrics for performance monitoring
- PNG screenshot capability for human inspection
- Comprehensive audit trails for security compliance

**Security and Isolation:**
- API key and mTLS authentication options
- Per-session resource limits and timeout controls
- Credential management with OS keyring integration
- Configurable content redaction for sensitive information
- Process isolation with dedicated user contexts