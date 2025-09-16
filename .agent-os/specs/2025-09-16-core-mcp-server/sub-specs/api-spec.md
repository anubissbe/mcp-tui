# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-09-16-core-mcp-server/spec.md

> Created: 2025-09-16
> Version: 1.0.0

## API Architecture

The Core MCP Server Foundation implements a JSON-RPC 2.0 API over HTTP for all MCP tool interactions. The server acts as a bridge between MCP clients (like Claude Desktop) and terminal-based applications.

## Base Endpoint

**POST /mcp**
- **Purpose**: Main MCP endpoint for all tool calls via JSON-RPC 2.0
- **Content-Type**: `application/json`
- **Authentication**: Bearer token in Authorization header
- **Protocol**: JSON-RPC 2.0 specification

### Request Format
```json
{
  "jsonrpc": "2.0",
  "id": "request-uuid",
  "method": "tui.start",
  "params": {
    "command": "htop",
    "args": [],
    "cwd": "/home/user"
  }
}
```

### Response Format
```json
{
  "jsonrpc": "2.0",
  "id": "request-uuid",
  "result": {
    "session_id": "sess_abc123",
    "seq": 1
  }
}
```

### Error Format
```json
{
  "jsonrpc": "2.0",
  "id": "request-uuid",
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "field": "command",
      "reason": "Command not found"
    }
  }
}
```

## MCP Tool Methods

### 1. tui.start

**Purpose**: Launch a new TUI session in a pseudo-terminal

**Parameters**:
- `command` (string, required): Executable command to launch
- `args` (array of strings, optional): Command arguments, default: []
- `cwd` (string, optional): Working directory, default: user home
- `env` (object, optional): Environment variables, default: inherit
- `rows` (number, optional): Terminal rows, default: 24
- `cols` (number, optional): Terminal columns, default: 80

**Response**:
```json
{
  "session_id": "sess_abc123",
  "seq": 1
}
```

**Errors**:
- `-32602`: Invalid params (missing command, invalid path)
- `-32001`: Command not found or not executable
- `-32002`: PTY spawn failure
- `-32003`: Resource limits exceeded (max sessions)

### 2. tui.read_frame

**Purpose**: Retrieve current screen state from a TUI session

**Parameters**:
- `session_id` (string, required): Session identifier
- `since_seq` (number, optional): Only return if sequence > this value

**Response**:
```json
{
  "seq": 5,
  "rows": 24,
  "cols": 80,
  "cursor": {
    "row": 10,
    "col": 25,
    "visible": true
  },
  "text": "htop - 12:34:56\n  PID USER   %CPU %MEM...",
  "changed": true
}
```

**Errors**:
- `-32602`: Invalid params (malformed session_id)
- `-32004`: Session not found
- `-32005`: Invalid sequence number

### 3. tui.send_keys

**Purpose**: Send keyboard input to a TUI session

**Parameters**:
- `session_id` (string, required): Session identifier
- `keys` (array of strings, required): Key sequences to send
- `throttle_ms` (number, optional): Delay between keys, default: 0

**Key Format**:
- Regular characters: `"a"`, `"1"`, `" "`
- Special keys: `"Enter"`, `"Escape"`, `"Tab"`, `"Backspace"`
- Arrow keys: `"ArrowUp"`, `"ArrowDown"`, `"ArrowLeft"`, `"ArrowRight"`
- Function keys: `"F1"`, `"F2"`, ..., `"F12"`
- Modifiers: `"Ctrl+c"`, `"Alt+f"`, `"Shift+Tab"`

**Response**:
```json
{
  "ok": true
}
```

**Errors**:
- `-32602`: Invalid params (empty keys array, invalid key format)
- `-32004`: Session not found
- `-32006`: Invalid key sequence
- `-32007`: Session not accepting input (process terminated)

### 4. tui.expect

**Purpose**: Wait for screen content to match a specified pattern

**Parameters**:
- `session_id` (string, required): Session identifier
- `pattern` (string, required): Regular expression pattern to match
- `timeout_ms` (number, required): Maximum wait time in milliseconds
- `negate` (boolean, optional): Wait for pattern to NOT match, default: false

**Response**:
```json
{
  "matched": true,
  "snapshot_seq": 7,
  "match_text": "Login successful"
}
```

**Errors**:
- `-32602`: Invalid params (invalid regex, negative timeout)
- `-32004`: Session not found
- `-32008`: Timeout exceeded
- `-32009`: Invalid regular expression pattern

### 5. tui.close

**Purpose**: Terminate a TUI session

**Parameters**:
- `session_id` (string, required): Session identifier
- `signal` (string, optional): Signal to send, default: "SIGTERM"

**Supported Signals**: `"SIGTERM"`, `"SIGKILL"`, `"SIGINT"`, `"SIGHUP"`

**Response**:
```json
{
  "ok": true,
  "exit_code": 0,
  "signal": null
}
```

**Errors**:
- `-32602`: Invalid params (invalid signal name)
- `-32004`: Session not found
- `-32010`: Termination failure
- `-32011`: Invalid signal

## Authentication & Security

### API Key Authentication
```http
Authorization: Bearer your-api-key-here
```

### Error Responses
- **401 Unauthorized**: Missing or invalid API key
- **429 Too Many Requests**: Rate limit exceeded (100 requests/minute)
- **503 Service Unavailable**: Server overloaded or maintenance

### Rate Limiting
- Default: 100 requests per minute per API key
- Headers included in response:
  ```http
  X-RateLimit-Limit: 100
  X-RateLimit-Remaining: 95
  X-RateLimit-Reset: 1632150000
  ```

## JSON-RPC Error Codes

### Standard JSON-RPC Errors
- `-32700`: Parse error (invalid JSON)
- `-32600`: Invalid request (not JSON-RPC 2.0)
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error

### MCP-Specific Errors
- `-32001`: Command not found
- `-32002`: PTY spawn failure
- `-32003`: Resource limits exceeded
- `-32004`: Session not found
- `-32005`: Invalid sequence number
- `-32006`: Invalid key sequence
- `-32007`: Session not accepting input
- `-32008`: Timeout exceeded
- `-32009`: Invalid regular expression
- `-32010`: Termination failure
- `-32011`: Invalid signal

## Example Workflows

### Basic TUI Interaction
```json
// 1. Start session
{"jsonrpc": "2.0", "id": "1", "method": "tui.start", "params": {"command": "htop"}}

// 2. Read initial screen
{"jsonrpc": "2.0", "id": "2", "method": "tui.read_frame", "params": {"session_id": "sess_abc123"}}

// 3. Send quit command
{"jsonrpc": "2.0", "id": "3", "method": "tui.send_keys", "params": {"session_id": "sess_abc123", "keys": ["q"]}}

// 4. Close session
{"jsonrpc": "2.0", "id": "4", "method": "tui.close", "params": {"session_id": "sess_abc123"}}
```

### Interactive Application Control
```json
// 1. Start vim editor
{"jsonrpc": "2.0", "id": "1", "method": "tui.start", "params": {"command": "vim", "args": ["test.txt"]}}

// 2. Wait for editor to load
{"jsonrpc": "2.0", "id": "2", "method": "tui.expect", "params": {"session_id": "sess_xyz789", "pattern": "test.txt", "timeout_ms": 5000}}

// 3. Enter insert mode
{"jsonrpc": "2.0", "id": "3", "method": "tui.send_keys", "params": {"session_id": "sess_xyz789", "keys": ["i"]}}

// 4. Type content
{"jsonrpc": "2.0", "id": "4", "method": "tui.send_keys", "params": {"session_id": "sess_xyz789", "keys": ["Hello World"]}}

// 5. Save and quit
{"jsonrpc": "2.0", "id": "5", "method": "tui.send_keys", "params": {"session_id": "sess_xyz789", "keys": ["Escape", ":wq", "Enter"]}}
```

## Performance Considerations

### Session Management
- Maximum 10 concurrent sessions per API key
- Sessions auto-terminate after 30 minutes of inactivity
- Frame reading optimized with sequence-based change detection

### Resource Limits
- Maximum terminal size: 200x60 characters
- Maximum frame update rate: 30 FPS
- Memory limit per session: 100MB PTY buffer

### Caching & Optimization
- Screen frames cached until sequence changes
- Key input batching for improved performance
- Pattern matching uses compiled regex caching