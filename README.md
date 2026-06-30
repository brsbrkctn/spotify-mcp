# Spotify MCP Server

A high-fidelity **Model Context Protocol (MCP)** server designed to give AI assistants (like Claude, Cursor, and ChatGPT) full control over your Spotify experience. Whether deployed locally on a Raspberry Pi or secured on a remote cloud instance, this server provides a robust bridge between LLMs and the Spotify Web API.

## Core Capabilities

- **Seamless Playback**: Command the AI to play, pause, skip, or adjust volume across your active devices.
- **Smart Discovery**: Search for music or generate high-quality recommendations based on seeds.
- **Library Management**: Access and manage your Liked Songs and personal playlists with natural language.
- **Queue Control**: Add tracks to your real-time queue and manage shuffle/repeat modes.
- **Device Handover**: List available Spotify Connect devices and transfer playback between them instantly.

---

## Deployment Paths

### Path A: Local Deployment (Private & Persistent)
Recommended for users who want 100% privacy and local network control (e.g., Homebridge, Debian, macOS).

1. **Install Dependencies**:
   ```bash
   git clone https://github.com/brsbrkctn/spotify-mcp.git
   cd spotify-mcp
   npm install
   ```
2. **Environment Setup (`.env`)**:
   ```env
   SPOTIFY_CLIENT_ID=your_id
   SPOTIFY_CLIENT_SECRET=your_secret
   REDIRECT_URI=http://localhost:3000/callback
   PORT=3000
   ```
3. **Run**: `npm start`. Session tokens are persisted to `.spotify-tokens.json` to survive restarts.

---

### Path B: Secured Remote Deployment (Cloud)
Recommended for accessing your home Spotify setup from anywhere via cloud platforms like Render or Railway.

1. **Mandatory Security**: Set an `API_KEY` in your environment variables. The server will automatically enable authentication middleware.
2. **Configure Variables**:
   - Set standard Spotify credentials.
   - Set `API_KEY=your_complex_secret_key`.
3. **Client Configuration**: When connecting your AI client (Cursor/Claude), add the following header:
   - `Authorization: Bearer your_complex_secret_key`

---

## Configuration Details

| Variable | Description | Default |
| :--- | :--- | :--- |
| `SPOTIFY_CLIENT_ID` | Your Spotify App Client ID | Required |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify App Client Secret | Required |
| `REDIRECT_URI` | The callback URL configured in Spotify | Required |
| `API_KEY` | Optional security key for remote setups | Disabled |
| `PORT` | The local port to listen on | 3000 |

## Security & Architecture

- **Graceful Persistence**: The server detects discless or read-only environments (common in serverless free tiers) and continues to operate in-memory if disk writes fail.
- **Single-User Architecture**: Designed as a private, single-tenant instance. Do not deploy a single shared instance for multiple users as session state is handled globally.
- **Minimalist Design**: Zero-dependency frontend; pure SSE-based MCP implementation for maximum performance.

## License
MIT. Built with precision by **brsberkectn**.
