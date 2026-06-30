# Spotify MCP Server

A robust Node.js/Express Model Context Protocol (MCP) server for Spotify, utilizing Server-Sent Events (SSE).

## Features

- **Get Current Track**: See what's playing right now.
- **Play/Pause**: Control playback.
- **Set Volume**: Adjust volume levels.
- **Get Playback State**: Full status of your Spotify player.
- **Playlist Management**: Create playlists, add tracks, and list user playlists.
- **Search**: Search for music, artists, albums, and more.
- **Recommendations**: Get music suggestions based on seeds.
- **Library**: Manage liked songs.
- **Queue & Modes**: Manage your playback queue, shuffle, and repeat modes.
- **OAuth Integration**: Built-in flow to authenticate with Spotify.

## Setup

### 1. Create a Spotify Developer App
1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create a new app.
3. In the app settings, add a **Redirect URI**: `http://localhost:3000/callback` (or your deployed URL).
4. Note your **Client ID** and **Client Secret**.

### 2. Environment Variables
Create a `.env` file with:
```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
REDIRECT_URI=http://localhost:3000/callback
PORT=3000
```

### 3. Install & Run
```bash
npm install
npm start
```

### 4. Authenticate
Visit `http://localhost:3000/login` in your browser to link your Spotify account.

## MCP Usage
- SSE Endpoint: `/sse`
- Messages Endpoint: `/messages`

## Security & Multi-User Deployment

### Single-User Deployment (Local/Personal)
Running this server locally or on a private personal hosting instance (e.g., Render, Railway) is safe. The server communicates directly with Spotify and manages a single user's credentials in-memory, ensuring your data remains isolated to your instance.

### Multi-User Shared Deployment Warning
**Do not deploy a single shared instance for multiple users.** This server is designed for personal use; it uses global in-memory variables to store token states. If multiple users connect to the same central URL, their sessions will collide, and credentials will be overwritten. Secure multi-tenant use would require integrating a database and session management.

### Best Practices
- **Environment Safety**: Keep your `.env` file secure and never commit it to version control.
- **Access Control**: Use authorization tokens for any private endpoints if the server is exposed to the web.
- **Logging**: Ensure intermediate logs do not leak sensitive token data or personal information.

## Tools

### Playback
- `get_current_track`: Returns currently playing track info.
- `play_pause`: Toggle playback (`action`: "play" or "pause").
- `set_volume`: Set volume (`volume_percent`: 0-100).
- `get_playback_state`: Full playback details.
- `skip_to_next`: Skip to the next track.
- `skip_to_previous`: Skip to the previous track.
- `get_available_devices`: List active/available devices.
- `transfer_playback`: Transfer playback to a device (`deviceId`, `play`).
- `set_shuffle_state`: Toggle shuffle (`state`: boolean).
- `set_repeat_mode`: Set repeat mode (`state`: "track", "context", or "off").
- `add_to_queue`: Add a track to the queue (`uri`).
- `get_queue`: Get current queue and playing track.

### Playlists
- `create_playlist`: Create a playlist (`name`, `description`, `public`).
- `add_to_playlist`: Add tracks to playlist (`playlistId`, `trackUris`).
- `get_user_playlists`: List your playlists (`limit`, `offset`).
- `remove_from_playlist`: Remove tracks from a playlist (`playlistId`, `trackUris`).

### Search & Discovery
- `search`: Search Spotify (`query`, `type`, `limit`).
- `get_recommendations`: Get track suggestions (`seed_artists`, `seed_genres`, `seed_tracks`, `limit`).

### Library (Liked Songs)
- `get_liked_songs`: List your saved tracks (`limit`, `offset`).
- `save_tracks`: Like/save tracks (`trackUris`).
- `remove_saved_tracks`: Unlike/unsave tracks (`trackUris`).
