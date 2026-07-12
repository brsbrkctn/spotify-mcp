# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-07-12

### Added
- **Stdio Transport**: Added support for standard input/output transport using `StdioServerTransport` from `@modelcontextprotocol/sdk`. Enabled by starting the server with `--stdio` or setting `TRANSPORT=stdio`.
- **Dual Transport Mode**: The server can now bind to `StdioServerTransport` for MCP clients while simultaneously running the Express HTTP server in the background to handle the Spotify OAuth callback flow.
- **Stdio-Safe Logging**: Introduced a custom logging system that redirects logs to `stderr` in stdio mode to prevent corruption of the stdout channel used by JSON-RPC.
- **Auto-Refresh and Request Retry**: Implemented automatic token refresh when tokens expire during active tool calls. If a request fails with a `401 Unauthorized` status, the server automatically attempts to refresh the access token and retries the request once before reporting an error.
- **No Active Device Interception**: Intercepts Spotify API errors when there is no active playback device and returns a user-friendly troubleshooting message.
- **Validation Constraints**: Added input validation constraints in `get_recommendations` (ensuring at least one seed is provided, and total seeds do not exceed Spotify's limit of 5).
- **Vercel Serverless Support**: Modified server initialization to export the Express app default and avoid `app.listen()` inside Vercel environment (`process.env.VERCEL`), allowing seamless deployment as Vercel Serverless Functions.

### Changed
- **`search` Tool Schema**: Improved type definitions with an enum of valid search types (`album`, `artist`, `playlist`, `track`, `show`, `episode`, `audiobook`) and documented parameters.
- **`get_recommendations` Tool Schema**: Documented seeds and maximum items to guide LLM calls.
- **Security Middleware**: Enhanced `authMiddleware` API key extraction to accept both `Bearer <key>` and raw `<key>` formats.

## [1.1.0]

### Added
- Security middleware with `API_KEY` verification.
- Graceful in-memory fallback for read-only environments.

## [1.0.0]

### Added
- Initial release of the Spotify Model Context Protocol server.
