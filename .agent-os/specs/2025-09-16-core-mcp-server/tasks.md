# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2025-09-16-core-mcp-server/spec.md

> Created: 2025-09-16
> Status: Ready for Implementation

## Tasks

### 1. Project Setup & Core Infrastructure

**1.1** Write unit tests for package structure and dependency validation
- Test package.json structure with required dependencies (node-pty, @modelcontextprotocol/sdk, ansi-parser)
- Test TypeScript configuration for Node.js targeting
- Test basic module imports and exports work correctly
- Verify test framework (Jest) is properly configured

**1.2** Initialize Node.js project with TypeScript configuration
- Create package.json with MCP server dependencies
- Configure TypeScript for Node.js ES2022 targeting
- Set up Jest testing framework with TypeScript support
- Create basic project directory structure (src/, tests/, dist/)

**1.3** Write tests for core server initialization and MCP connection
- Test server starts and binds to stdio transport
- Test MCP protocol handshake completes successfully
- Test server responds to ping/health check requests
- Test graceful shutdown on SIGINT/SIGTERM signals

**1.4** Implement basic MCP server foundation
- Create main server entry point with stdio transport
- Implement MCP protocol initialization and tool registration
- Add signal handlers for graceful shutdown
- Set up logging infrastructure for debugging

**1.5** Verify core infrastructure tests pass and server starts
- Run all project setup and initialization tests
- Confirm server can be started and responds to basic MCP commands
- Validate TypeScript compilation produces working JavaScript
- Test clean shutdown behavior

### 2. PTY Backend & Session Management

**2.1** Write unit tests for PTY spawning and process lifecycle
- Test PTY process creation with configurable shell (bash/zsh)
- Test environment variable inheritance and customization
- Test process termination and cleanup on session end
- Test error handling for failed process spawning

**2.2** Write tests for session state management
- Test session ID generation and uniqueness
- Test concurrent session handling (multiple PTY instances)
- Test session isolation and data separation
- Test session cleanup and resource deallocation

**2.3** Implement PTY spawning with node-pty integration
- Create PTY factory for shell process creation
- Implement configurable shell selection (bash, zsh, sh)
- Add environment variable passing and PATH setup
- Handle PTY creation errors and fallback behavior

**2.4** Implement session lifecycle management
- Create SessionManager class for multiple concurrent sessions
- Implement session creation, tracking, and cleanup
- Add session timeout and idle detection
- Implement proper resource disposal on session end

**2.5** Write tests for PTY data flow and event handling
- Test data writing to PTY stdin
- Test data reading from PTY stdout/stderr streams
- Test PTY resize events and terminal size updates
- Test process exit event handling and cleanup

**2.6** Implement PTY data handling and event management
- Set up PTY data event listeners for stdout/stderr
- Implement data buffering and flow control
- Add PTY resize handling for terminal dimension changes
- Handle process exit events and session termination

**2.7** Verify PTY backend tests pass and sessions work correctly
- Run all PTY and session management tests
- Test multiple concurrent PTY sessions
- Verify proper cleanup and no resource leaks
- Confirm shell commands execute and return output

### 3. ANSI Parser & Screen Buffer

**3.1** Write unit tests for ANSI escape sequence parsing
- Test basic ANSI color codes and text formatting
- Test cursor movement sequences (up, down, left, right)
- Test screen clearing and line manipulation commands
- Test complex sequences like cursor save/restore

**3.2** Write tests for screen buffer state management
- Test screen buffer initialization with configurable dimensions
- Test character placement and cursor position tracking
- Test line wrapping and scrolling behavior
- Test screen buffer serialization to JSON format

**3.3** Implement ANSI parser with ansi-parser library
- Integrate ansi-parser for escape sequence processing
- Create ANSI command handlers for cursor and screen operations
- Implement color and formatting attribute tracking
- Handle unsupported or malformed ANSI sequences gracefully

**3.4** Implement screen buffer data structure
- Create ScreenBuffer class with configurable dimensions (80x24 default)
- Implement character cell storage with attributes (color, style)
- Add cursor position tracking and movement operations
- Implement line management with scrolling support

**3.5** Write tests for frame capture and serialization
- Test screen buffer snapshot capture at specific points
- Test JSON serialization includes all necessary state (content, cursor, attributes)
- Test frame differencing for efficient updates
- Test buffer resize handling and content preservation

**3.6** Implement frame capture system
- Create frame snapshot functionality from screen buffer state
- Implement JSON serialization with screen content and metadata
- Add frame differencing to minimize data transfer
- Handle screen resize events and buffer adaptation

**3.7** Verify ANSI parser and screen buffer tests pass
- Run all parsing and screen buffer management tests
- Test complex terminal output scenarios (colors, formatting, movement)
- Verify frame capture produces accurate screen representations
- Confirm performance meets requirements for real-time updates

### 4. MCP Tools Implementation

**4.1** Write comprehensive tests for all 5 MCP tools
- Test start_session tool with shell selection and environment
- Test read_current_frame tool returns accurate screen state
- Test send_keys tool handles various input types (text, special keys)
- Test expect_output tool with pattern matching and timeouts
- Test close_session tool cleans up resources properly

**4.2** Implement start_session MCP tool
- Create tool handler for PTY session initialization
- Add shell selection parameter (bash, zsh, sh) with bash default
- Implement environment variable passing and working directory setup
- Return session_id for subsequent operations

**4.3** Implement read_current_frame MCP tool
- Create tool handler for screen buffer frame capture
- Accept session_id parameter for multi-session support
- Return JSON-serialized screen state with content, cursor, and dimensions
- Handle invalid session IDs with proper error responses

**4.4** Write tests for input handling edge cases
- Test special key sequences (Enter, Tab, Ctrl+C, arrow keys)
- Test multi-byte character input and Unicode handling
- Test large input strings and buffer limits
- Test rapid input sequences and flow control

**4.5** Implement send_keys MCP tool
- Create tool handler for sending input to PTY session
- Support both text strings and special key sequences
- Implement proper character encoding and multi-byte support
- Handle session validation and error cases

**4.6** Implement expect_output MCP tool with pattern matching
- Create tool handler for waiting on specific output patterns
- Implement regex and substring pattern matching
- Add configurable timeout with default 5-second limit
- Return matched content and boolean success indicator

**4.7** Implement close_session MCP tool
- Create tool handler for session termination
- Implement graceful PTY process shutdown
- Clean up session resources and screen buffers
- Return confirmation of successful cleanup

**4.8** Verify all MCP tools work correctly end-to-end
- Run comprehensive tests for all 5 MCP tools
- Test multi-session scenarios with concurrent operations
- Verify error handling for invalid inputs and edge cases
- Confirm tools integrate properly with MCP protocol

### 5. Integration & Testing

**5.1** Write end-to-end integration tests
- Test complete workflow: start → send commands → read output → close
- Test common terminal scenarios (file listing, text editing, process execution)
- Test error recovery and resilience scenarios
- Test performance under concurrent session load

**5.2** Implement comprehensive error handling
- Add proper error responses for all failure modes
- Implement session validation and security checks
- Add resource limit enforcement and protection
- Create detailed error logging for debugging

**5.3** Write performance and load tests
- Test response time requirements (<100ms for read_frame, <50ms for send_keys)
- Test concurrent session limits and resource usage
- Test memory usage and leak detection over time
- Test throughput for high-frequency operations

**5.4** Optimize performance to meet specification requirements
- Implement efficient screen buffer updates and frame differencing
- Optimize ANSI parsing for real-time performance
- Add connection pooling and resource reuse where applicable
- Implement caching strategies for frequently accessed data

**5.5** Create user documentation and examples
- Write README with installation and usage instructions
- Create example MCP client code demonstrating all tools
- Document common terminal automation patterns and use cases
- Add troubleshooting guide for common issues

**5.6** Verify all tests pass and performance meets requirements
- Run complete test suite and ensure 100% pass rate
- Validate performance benchmarks meet specification targets
- Test deployment on different Node.js versions and platforms
- Confirm example code works correctly and demonstrates capabilities