# Spotify MCP Server

A comprehensive Model Context Protocol (MCP) server for Spotify, utilizing Server-Sent Events (SSE) for seamless AI integration.

## Features

- **Playback Control**: Play, pause, adjust volume, skip tracks, and manage shuffle/repeat modes.
- **Library & Playlists**: Create playlists, manage tracks, and access your Liked Songs.
- **Search & Discovery**: Search for tracks, artists, and albums, or generate personalized recommendations.
- **Device Management**: List active devices and seamlessly transfer playback between them.
- **Persistent Sessions**: Securely stores OAuth tokens in a local file to maintain authentication across server restarts.

## Configuration & Setup

### Prerequisites
1. Create a new application on the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add a **Redirect URI** in your app settings: `http://localhost:3000/callback` (or your custom server URL).
3. Secure your **Client ID** and **Client Secret**.

---

### Path A: Local Deployment (Debian, macOS, Windows)
Ideal for private, high-performance use within a local network.

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com/brsbrkctn/spotify-mcp.git
   cd spotify-mcp
   npm install
   ```

2. **Configure your environment (`.env`):**
   ```env
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   REDIRECT_URI=http://localhost:3000/callback
   PORT=3000
   ```

3. **Launch the server:**
   `npm start` (or use `pm2 start index.js --name spotify-mcp` for background execution).

4. **Authenticate:**
   Visit `http://localhost:3000/login` in your browser to link your account.

---

### Path B: Secured Remote Deployment (Render, Railway, Fly.io)
Ideal for accessing your Spotify tools from any AI client (ChatGPT, Cursor).

1. **Security (API_KEY):** Since your instance will be public, you must define an `API_KEY` to prevent unauthorized access.
2. **Configure Environment Variables:**
   - Set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `REDIRECT_URI`.
   - Set `API_KEY`: Choose a strong, private string (e.g., `your_secure_api_key_123`).
3. **Connect your AI Client:** When adding the server URL to Cursor or ChatGPT, include the following header:
   - Header: `Authorization: Bearer <API_KEY>` or `x-api-key: <API_KEY>`.

*Note: Free-tier hosting providers often use ephemeral file systems. If the server goes to sleep, you may need to re-authenticate via the `/login` endpoint.*

---

## Environment Variables

| Variable | Description | Required |
| :--- | :--- | :--- |
| `PORT` | The port on which the server runs (Default: 3000). | No |
| `SPOTIFY_CLIENT_ID` | Your Spotify Developer App Client ID. | Yes |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify Developer App Client Secret. | Yes |
| `REDIRECT_URI` | Your Spotify OAuth Redirect URI. | Yes |
| `API_KEY` | Security key for remote access authentication. | Yes (for Path B) |

## Available Tools

- **Playback**: `get_current_track`, `play_pause`, `set_volume`, `skip_to_next`, `set_shuffle_state`, `set_repeat_mode`, `add_to_queue`, `get_queue`.
- **Playlists**: `create_playlist`, `add_to_playlist`, `get_user_playlists`, `remove_from_playlist`.
- **Discovery**: `search`, `get_recommendations`.
- **Library**: `get_liked_songs`, `save_tracks`, `remove_saved_tracks`.
- **Devices**: `get_available_devices`, `transfer_playback`.
