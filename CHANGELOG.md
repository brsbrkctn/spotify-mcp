# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.1] - 2026-07-12

### Fixed
- **Authentication Callback Logging**: Enhanced error logging and Redirect URI output inside the `/callback` route. This helps trace exact callback redirections and diagnose potential environment variable mismatches (like Render using Vercel's callback URL) or API errors.

## [1.4.0] - 2026-07-12

### Fixed
- **Refresh Token Preservation**: Modified `saveTokens()` to explicitly fall back to `userTokens.refresh_token` if the new token object doesn't include a `refresh_token` key. This prevents Spotify token refreshes (which omit the refresh_token in their responses) from overwriting the stored refresh token with `undefined` in the database, preserving long-term API authorization scopes.

## [1.3.9] - 2026-07-12

### Added
- **get_playlist_tracks Tool**: Added a new tool to fetch and list the tracks inside a specific playlist, allowing AI assistants to read playlist contents.

## [1.3.8] - 2026-07-12

### Fixed
- **POST /messages Stream Consumption (Hanging Connection)**: Fixed a bug where incoming requests to `/messages` hung indefinitely and caused connection timeouts in clients (like Poke.ai). Enforcing `express.json()` globally consumed the request stream before the MCP SDK could read it via `getRawBody()`. Resolved by passing the already parsed `req.body` as the third parameter to `transport.handlePostMessage()`, bypassing raw body stream reading.

## [1.3.7] - 2026-07-12

### Fixed
- **Reconnection State Reset**: Fixed a crash occurring when a client refreshed the connection or reconnected. The MCP `Server` instance threw an `Already connected to a transport` error and crashed because the previous transport was not closed, and the server's internal `_transport` reference was not cleared. Resolved by closing the previous transport and resetting `server._transport = undefined` when a new GET request is made to `/mcp`.

## [1.3.6] - 2026-07-12

### Changed
- **Endpoint Route Rename**: Renamed the `/sse` GET endpoint to `/mcp` to resolve compatibility issues with Poke.ai's routing layer. The MCP server can now be accessed via the `/mcp` route.

## [1.3.5] - 2026-07-12

### Fixed
- **SSE Handshake Crash (Headers Already Sent)**: Removed manual `res.flushHeaders()` and duplicate stream headers inside the `GET /sse` route. Calling `flushHeaders()` before `server.connect(transport)` sent response headers prematurely, causing Node.js to crash with an `ERR_HTTP_HEADERS_SENT` error when the MCP SDK attempted to invoke `writeHead()`. Keep-alive and Content-Type headers are now correctly managed by the SDK, while still custom-merging the `X-Accel-Buffering` configuration.

## [1.3.4] - 2026-07-12

### Fixed
- **POST /messages Authentication Bypass**: Removed `authMiddleware` from the `POST /messages` route. Enforcing auth on `/messages` caused connection failures for clients like Poke.ai because MCP clients send JSON-RPC payloads without propagating the initial SSE query parameters or custom headers. Security is still fully maintained as the route requires an active transport session initialized via the protected `GET /sse` endpoint.

## [1.3.3] - 2026-07-12

### Fixed
- **Startup Blocking (Cold Start)**: Made `loadTokens()` call non-blocking during server start, binding the Express server to `$PORT` immediately. This resolves Render's 502 Bad Gateway/cold start timeouts by satisfying the port-binding health check instantly.

## [1.3.2] - 2026-07-12

### Fixed
- **SSE Buffering on Reverse Proxies**: Added standard response streaming headers (`Cache-Control`, `Connection`, `X-Accel-Buffering`) and called `res.flushHeaders()` to prevent Vercel or Nginx from buffering the initial SSE handshake response, resolving 20s connection timeouts.

## [1.3.1] - 2026-07-12

### Fixed
- **Query Parameter Authentication**: Fixed connection failures for clients (like browser-based `EventSource`) that do not support setting custom headers during SSE handshake. Added support for passing the API Key via query parameters (`api_key`, `apiKey`, or `token`).

## [1.3.0] - 2026-07-12

### Added
- **Supabase Integration**: Added support for persisting Spotify OAuth credentials to a Supabase database. This solves the token expiration issue on ephemeral/diskless hosting platforms like Vercel.
- **Dynamic Dual-Storage (Fallback)**: The server automatically detects if `SUPABASE_URL` and `SUPABASE_ANON_KEY` environment variables are set. If present, it uses Supabase REST endpoints for state persistence. If absent, it transparently falls back to using the local `.spotify-tokens.json` file on disk.

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
