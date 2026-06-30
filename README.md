# Spotify MCP Server

A robust Node.js/Express Model Context Protocol (MCP) server for Spotify, utilizing Server-Sent Events (SSE).

## Features

- **Get Current Track**: See what's playing right now.
- **Play/Pause**: Control playback.
- **Set Volume**: Adjust volume levels.
- **Get Playback State**: Full status of your Spotify player.
- **Playlist Management**: Create playlists, add tracks, and list user playlists.
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

## Tools

### Playback
- `get_current_track`: Returns currently playing track info.
- `play_pause`: Toggle playback (`action`: "play" or "pause").
- `set_volume`: Set volume (`volume_percent`: 0-100).
- `get_playback_state`: Full playback details.

### Playlists
- `create_playlist`: Create a playlist (`name`, `description`, `public`).
- `add_to_playlist`: Add tracks to playlist (`playlistId`, `trackUris`).
- `get_user_playlists`: List your playlists (`limit`, `offset`).
