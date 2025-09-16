# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-16-core-mcp-server/spec.md

> Created: 2025-09-16
> Version: 1.0.0

## Technical Requirements

### JSON-RPC 2.0 Server Implementation
- **Protocol**: JSON-RPC 2.0 over HTTP transport
- **Content-Type**: `application/json` for all requests/responses
- **Method Format**: Tool calls use `tools/<tool_name>` method naming convention
- **Error Codes**: Standard JSON-RPC error codes (-32700 to -32603) plus custom codes
- **Batch Requests**: Support for batch operations when multiple tool calls needed
- **Request ID**: Echo request ID in response for proper client-server correlation

### Authentication & Security
- **API Key Authentication**: Bearer token in Authorization header
- **Token Configuration**: Environment variable `MCP_TUI_API_KEY` for server validation
- **Rate Limiting**: 100 requests/minute per API key to prevent abuse
- **Input Sanitization**: Validate all user inputs to prevent command injection
- **Session Isolation**: Each session runs in isolated environment with restricted permissions

### Request/Response Schema Validation
- **Schema Engine**: Joi validation library for comprehensive input validation
- **Tool Parameters**: Strict validation of tool-specific parameters
- **Error Response Format**: Standardized error objects with code, message, and data fields
- **Type Safety**: Runtime type checking for all API boundaries
- **Documentation**: OpenAPI 3.0 spec generation for client libraries

### PTY Process Management
- **Process Spawning**: Use node-pty for cross-platform PTY creation
- **Environment Setup**: Configurable environment variables per session
- **Working Directory**: Configurable starting directory with path validation
- **Shell Detection**: Automatic shell detection (bash, zsh, powershell) based on platform
- **Resource Limits**: CPU and memory limits per spawned process
- **Signal Handling**: Proper SIGTERM/SIGKILL handling for process cleanup

### ANSI/VT Escape Sequence Processing
- **Parser Library**: @xterm/parser for comprehensive ANSI/VT100/VT220 support
- **Screen Buffer**: In-memory representation of terminal screen state
- **Cursor Tracking**: Real-time cursor position and attributes
- **Color Support**: Full 256-color and true-color support
- **Special Sequences**: Handle clear screen, cursor movement, text formatting
- **Performance**: Incremental parsing to minimize CPU usage

### Session State Management
- **Session Creation**: Generate UUID v4 for unique session identification
- **State Persistence**: In-memory session store with configurable TTL
- **Cleanup Strategy**: Automatic cleanup after 30 minutes of inactivity
- **Concurrent Limits**: Maximum 10 concurrent sessions per server instance
- **Health Monitoring**: Session health checks and zombie process detection

### Error Handling & Status Codes
- **HTTP Status Codes**:
  - 200 (OK) - Successful operations
  - 400 (Bad Request) - Invalid parameters or malformed requests
  - 401 (Unauthorized) - Invalid or missing API key
  - 404 (Not Found) - Session not found
  - 429 (Too Many Requests) - Rate limit exceeded
  - 500 (Internal Server Error) - Server-side errors
- **Error Messages**: Human-readable error descriptions with suggested fixes
- **Debug Information**: Include request ID and timestamp in error responses

### Logging & Monitoring
- **Structured Logging**: JSON-formatted logs with consistent field names
- **Log Levels**: DEBUG, INFO, WARN, ERROR with configurable output level
- **Request Logging**: Log all API requests with execution time and response status
- **Session Events**: Log session creation, termination, and key operations
- **Error Tracking**: Detailed error logs with stack traces for debugging

## MCP Tools Technical Specifications

### tui.start Tool
```json
{
  "method": "tools/tui.start",
  "params": {
    "command": "string (required) - Command to execute",
    "args": "array[string] (optional) - Command arguments",
    "cwd": "string (optional) - Working directory",
    "env": "object (optional) - Environment variables",
    "cols": "number (optional, default: 80) - Terminal columns",
    "rows": "number (optional, default: 24) - Terminal rows"
  }
}
```
- **Process Spawning**: Create PTY with specified dimensions and environment
- **Session Registration**: Register new session in state manager
- **Initial State**: Capture initial screen state and return session ID
- **Error Handling**: Handle command not found, permission denied, and spawn failures
- **Timeout**: 30 second timeout for initial command startup

### tui.read_frame Tool
```json
{
  "method": "tools/tui.read_frame",
  "params": {
    "session_id": "string (required) - Session identifier"
  }
}
```
- **Screen Serialization**: Convert screen buffer to structured text format
- **Cursor Information**: Include cursor position, visibility, and attributes
- **Text Content**: Raw text with preserved whitespace and formatting
- **Change Detection**: Only return changes since last read for efficiency
- **Buffer Limits**: Maximum 10MB screen buffer size to prevent memory issues

### tui.send_keys Tool
```json
{
  "method": "tools/tui.send_keys",
  "params": {
    "session_id": "string (required) - Session identifier",
    "keys": "string (required) - Key sequence to send",
    "delay": "number (optional, default: 0) - Milliseconds between keystrokes"
  }
}
```
- **Key Encoding**: Support for special keys (Enter, Tab, Ctrl+C, Arrow keys)
- **Input Validation**: Validate key sequences and prevent binary injection
- **Rate Limiting**: Prevent key flooding with configurable delays
- **PTY Writing**: Direct write to PTY stdin with proper encoding
- **Response Confirmation**: Return success status and any immediate screen changes

### tui.expect Tool
```json
{
  "method": "tools/tui.expect",
  "params": {
    "session_id": "string (required) - Session identifier",
    "patterns": "array[string] (required) - Regex patterns to match",
    "timeout": "number (optional, default: 30) - Timeout in seconds",
    "read_buffer": "boolean (optional, default: true) - Include matched text in response"
  }
}
```
- **Pattern Matching**: JavaScript RegExp engine for flexible pattern matching
- **Timeout Handling**: Configurable timeout with partial match information
- **Buffer Management**: Maintain rolling buffer for pattern matching
- **Match Information**: Return matched text, pattern index, and buffer position
- **Non-blocking**: Asynchronous operation that doesn't block other requests

### tui.close Tool
```json
{
  "method": "tools/tui.close",
  "params": {
    "session_id": "string (required) - Session identifier",
    "force": "boolean (optional, default: false) - Force termination"
  }
}
```
- **Graceful Termination**: Send SIGTERM first, then SIGKILL if needed
- **State Cleanup**: Remove session from state manager and free resources
- **Process Cleanup**: Ensure child processes are properly terminated
- **Response Status**: Return termination success and any cleanup warnings
- **Timeout**: 5 second timeout for graceful termination before force kill

## Performance Requirements

### Concurrent Session Management
- **Session Limit**: Support up to 10 concurrent sessions per server instance
- **Resource Monitoring**: Track CPU and memory usage per session
- **Load Balancing**: Distribute sessions across available resources
- **Session Queuing**: Queue new sessions when at capacity limit
- **Performance Degradation**: Graceful degradation when approaching resource limits

### Screen Parsing Performance
- **Parse Time**: Process typical terminal output (80x24, 1000 lines) within 50ms
- **Memory Usage**: Limit screen buffer memory to 10MB per session
- **Incremental Updates**: Only parse changed regions for efficiency
- **Caching Strategy**: Cache parsed output to avoid reprocessing
- **Background Processing**: Use worker threads for CPU-intensive parsing

### API Response Times
- **Non-blocking Operations**: read_frame, send_keys under 100ms response time
- **Blocking Operations**: start, expect operations under 30 second timeout
- **Network Efficiency**: Minimize response payload size with compression
- **Connection Reuse**: Support HTTP/1.1 keep-alive for persistent connections
- **Batch Operations**: Support multiple tool calls in single request for efficiency

## External Dependencies

### Node.js Implementation Stack
```json
{
  "dependencies": {
    "node-pty": "^1.0.0",
    "@xterm/parser": "^0.5.0",
    "express": "^4.18.0",
    "joi": "^17.9.0",
    "uuid": "^9.0.0",
    "winston": "^3.10.0"
  }
}
```

### Core Libraries Detail

#### node-pty (PTY Management)
- **Purpose**: Cross-platform PTY creation and management
- **Key Features**: Process spawning, signal handling, resize support
- **Platform Support**: Windows (winpty), Linux/macOS (native PTY)
- **Configuration**: Configurable shell detection and environment setup

#### @xterm/parser (ANSI Processing)
- **Purpose**: High-performance ANSI/VT escape sequence parsing
- **Key Features**: Incremental parsing, state machine, color support
- **Performance**: Optimized for real-time terminal output processing
- **Standards Compliance**: VT100, VT220, ANSI X3.64 standard support

#### express (HTTP Server)
- **Purpose**: HTTP server framework for JSON-RPC endpoint
- **Key Features**: Middleware support, routing, error handling
- **Configuration**: Custom error handlers, request logging, CORS support
- **Security**: Rate limiting, input validation, secure headers

#### joi (Schema Validation)
- **Purpose**: Runtime schema validation for API requests
- **Key Features**: Type checking, custom validators, error messages
- **Performance**: Compile-time schema optimization
- **Integration**: Middleware integration with express for automatic validation

### Additional Dependencies

#### uuid (Session Management)
- **Purpose**: Generate unique session identifiers
- **Implementation**: UUID v4 for cryptographically secure IDs
- **Performance**: High-speed generation for session creation

#### winston (Logging)
- **Purpose**: Structured logging with multiple transports
- **Configuration**: JSON formatting, log levels, file rotation
- **Integration**: Request logging middleware and error tracking

## Architecture Considerations

### Scalability Design
- **Horizontal Scaling**: Design for multiple server instances behind load balancer
- **State Management**: Consider external session store (Redis) for multi-instance deployments
- **Resource Monitoring**: Built-in metrics collection for performance monitoring
- **Configuration Management**: Environment-based configuration for deployment flexibility

### Security Considerations
- **Input Sanitization**: Comprehensive input validation to prevent injection attacks
- **Process Isolation**: Sandboxed execution environment for spawned processes
- **Resource Limits**: CPU/memory limits to prevent resource exhaustion
- **Audit Logging**: Security-focused logging for access control and monitoring

### Error Recovery
- **Session Recovery**: Automatic session cleanup and resource recovery
- **Graceful Degradation**: Continue operation with reduced functionality under load
- **Circuit Breakers**: Prevent cascading failures with circuit breaker patterns
- **Health Checks**: Built-in health endpoints for load balancer integration