# Spotify MCP Server

A high-fidelity **Model Context Protocol (MCP)** server designed to give AI assistants (like Claude, Cursor, and ChatGPT) full control over your Spotify experience. Whether deployed locally on a Raspberry Pi or secured on a remote cloud instance, this server provides a robust bridge between LLMs and the Spotify Web API.

It supports both **Stdio** transport (preferred for local AI clients like Claude Desktop/Cursor) and **SSE** transport (for remote/web-based architectures).

## Core Capabilities

- **Seamless Playback**: Command the AI to play, pause, skip, or adjust volume across your active devices.
- **Smart Discovery**: Search for music or generate high-quality recommendations based on seed artists, genres, or tracks (validating limits beforehand).
- **Library Management**: Access and manage your Liked Songs and personal playlists with natural language.
- **Queue Control**: Add tracks to your real-time queue and manage shuffle/repeat modes.
- **Device Handover**: List available Spotify Connect devices and transfer playback between them instantly.
- **Resilient Connectivity**: Automatic token refresh on expired sessions and robust retry logic on token timeouts (401 errors).
- **User-Friendly Error Handling**: Friendly prompts when trying to play tracks with no active playback device.

---

## Deployment Paths

### Path A: Local Deployment with Claude Desktop / Cursor (Stdio Mode)

Recommended for standard users wanting to connect their local Claude Desktop or Cursor instance directly.

1. **Clone & Install**:
   ```bash
   git clone https://github.com/brsbrkctn/spotify-mcp.git
   cd spotify-mcp
   npm install
   ```
2. **Configure Environment Variables (`.env`)**:
   Create a `.env` file in the project root:
   ```env
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   REDIRECT_URI=http://localhost:3000/callback
   PORT=3000
   ```
3. **Perform One-Time Authentication**:
   Start the server in standard HTTP mode:
   ```bash
   npm start
   ```
   Open `http://localhost:3000/login` in your web browser, log in to Spotify, and authorize the application. This saves your access tokens in `.spotify-tokens.json`. You can then stop the server (`Ctrl+C`).
4. **Configure AI Client**:
   Configure your MCP client to start the server using `--stdio` mode.
   
   **For Claude Desktop (`claude_desktop_config.json`)**:
   ```json
   {
     "mcpServers": {
       "spotify": {
         "command": "node",
         "args": ["/path/to/spotify-mcp/index.js", "--stdio"],
         "env": {
           "SPOTIFY_CLIENT_ID": "your_spotify_client_id",
           "SPOTIFY_CLIENT_SECRET": "your_spotify_client_secret",
           "REDIRECT_URI": "http://localhost:3000/callback"
         }
       }
     }
   }
   ```
   *(Note: The server will spin up a background Express web server to handle any token refresh flows without interfering with Claude's Stdio channel.)*

---

### Path B: Local Deployment (SSE Mode)
Recommended for users who want local network control via SSE (e.g. for browser extensions or custom web frontends).

1. **Configure `.env`** as in Path A.
2. **Run**: `npm start`.
3. Open `http://localhost:3000/login` to authenticate.
4. Session tokens are persisted to `.spotify-tokens.json` to survive restarts. Clients can connect to SSE at `http://localhost:3000/sse`.

---

### Path C: Secured Remote Deployment (Cloud/Vercel)
Recommended for accessing your home Spotify setup from anywhere via cloud platforms like Render, Railway, or Vercel.

1. **Mandatory Security**: Set an `API_KEY` in your environment variables. The server will automatically enable authentication middleware.
2. **Configure Variables**:
   - Set standard Spotify credentials.
   - Set `API_KEY=your_complex_secret_key`.
3. **Vercel Serverless Support**: This codebase includes a default export of the Express application and bypasses `app.listen()` when deployed to Vercel, making it fully serverless-ready.
4. **Client Configuration**: When connecting your AI client, add the following header:
   - `Authorization: Bearer your_complex_secret_key` (or `x-api-key: your_complex_secret_key`)

---

## Configuration Details

| Variable | Description | Default |
| :--- | :--- | :--- |
| `SPOTIFY_CLIENT_ID` | Your Spotify App Client ID | Required |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify App Client Secret | Required |
| `REDIRECT_URI` | The callback URL configured in Spotify | Required |
| `API_KEY` | Optional security key for remote setups | Disabled |
| `PORT` | The local port to listen on | 3000 |
| `TRANSPORT` | Set to `stdio` to force stdio mode | Optional |

---

## Security & Architecture

- **Graceful Persistence**: The server detects diskless or read-only environments (common in serverless free tiers) and continues to operate in-memory if disk writes fail.
- **Single-User Architecture**: Designed as a private, single-tenant instance. Do not deploy a single shared instance for multiple users as session state is handled globally.
- **Stdio-Safe Logging**: When running in `--stdio` mode, the server redirects all application logs to `stderr` to keep `stdout` clean for JSON-RPC messages.

## Contributing
Contributions are welcome via forks and pull requests.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
