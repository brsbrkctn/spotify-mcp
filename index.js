import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, ".spotify-tokens.json");

const app = express();
app.use(cors());
app.use(express.json());

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || "http://localhost:3000/callback";
const API_KEY = process.env.API_KEY;

/**
 * Security Middleware
 * Validates requests if API_KEY is set in environment variables.
 */
const authMiddleware = (req, res, next) => {
  if (!API_KEY) return next();

  const authHeader = req.headers["authorization"];
  const xApiKey = req.headers["x-api-key"];
  const providedKey = authHeader ? authHeader.split(" ")[1] : xApiKey;

  if (providedKey === API_KEY) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized: Invalid or missing API Key" });
  }
};

// Global session state
let userTokens = {
  access_token: null,
  refresh_token: null,
  expires_at: null,
};

/**
 * Loads tokens from local disk if available.
 * Fails gracefully in discless/read-only environments.
 */
const loadTokens = async () => {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
      userTokens = data;
      console.log("[Auth] Tokens loaded from disk.");
      
      if (userTokens.refresh_token && (!userTokens.expires_at || Date.now() > userTokens.expires_at)) {
        await refreshAccessToken();
      }
    }
  } catch (error) {
    console.warn("[Auth] Could not load tokens from disk:", error.message);
  }
};

/**
 * Persists tokens to disk.
 * Handles read-only file systems without crashing.
 */
const saveTokens = (tokens) => {
  userTokens = {
    ...userTokens,
    ...tokens,
    expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : userTokens.expires_at,
  };
  
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(userTokens, null, 2));
    console.log("[Auth] Session persisted to disk.");
  } catch (error) {
    console.warn("[Auth] Failed to persist session (expected in discless environments):", error.message);
  }
};

/**
 * Refreshes the access token using the stored refresh token.
 */
const refreshAccessToken = async () => {
  if (!userTokens.refresh_token) return;

  try {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: userTokens.refresh_token,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    
    saveTokens(response.data);
    console.log("[Auth] Access token refreshed successfully.");
  } catch (error) {
    console.error("[Auth] Refresh failed:", error.response?.data || error.message);
  }
};

/**
 * Returns a valid access token, refreshing it if necessary.
 */
const getValidToken = async () => {
  if (!userTokens.access_token) return null;

  // Refresh if token expires in less than 1 minute
  if (userTokens.expires_at && Date.now() > userTokens.expires_at - 60000) {
    await refreshAccessToken();
  }

  return userTokens.access_token;
};

const server = new Server(
  {
    name: "spotify-mcp",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// MCP Tool Registration
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      { name: "get_current_track", description: "Get the currently playing track", inputSchema: { type: "object", properties: {} } },
      { name: "play_pause", description: "Toggle play/pause", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["play", "pause"] } } } },
      { name: "set_volume", description: "Set volume (0-100)", inputSchema: { type: "object", properties: { volume_percent: { type: "integer", minimum: 0, maximum: 100 } }, required: ["volume_percent"] } },
      { name: "get_playback_state", description: "Get full playback status", inputSchema: { type: "object", properties: {} } },
      { name: "create_playlist", description: "Create a new playlist", inputSchema: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, public: { type: "boolean" } }, required: ["name"] } },
      { name: "add_to_playlist", description: "Add tracks to a playlist", inputSchema: { type: "object", properties: { playlistId: { type: "string" }, trackUris: { type: "array", items: { type: "string" } } }, required: ["playlistId", "trackUris"] } },
      { name: "get_user_playlists", description: "List user playlists", inputSchema: { type: "object", properties: { limit: { type: "integer" }, offset: { type: "integer" } } } },
      { name: "search", description: "Search Spotify content", inputSchema: { type: "object", properties: { query: { type: "string" }, type: { type: "array", items: { type: "string" } }, limit: { type: "integer" } }, required: ["query", "type"] } },
      { name: "skip_to_next", description: "Skip to next track", inputSchema: { type: "object", properties: {} } },
      { name: "skip_to_previous", description: "Skip to previous track", inputSchema: { type: "object", properties: {} } },
      { name: "remove_from_playlist", description: "Remove tracks from a playlist", inputSchema: { type: "object", properties: { playlistId: { type: "string" }, trackUris: { type: "array", items: { type: "string" } } }, required: ["playlistId", "trackUris"] } },
      { name: "get_liked_songs", description: "Get saved tracks", inputSchema: { type: "object", properties: { limit: { type: "integer" }, offset: { type: "integer" } } } },
      { name: "save_tracks", description: "Save tracks to library", inputSchema: { type: "object", properties: { trackUris: { type: "array", items: { type: "string" } } }, required: ["trackUris"] } },
      { name: "remove_saved_tracks", description: "Remove tracks from library", inputSchema: { type: "object", properties: { trackUris: { type: "array", items: { type: "string" } } }, required: ["trackUris"] } },
      { name: "get_available_devices", description: "List available devices", inputSchema: { type: "object", properties: {} } },
      { name: "transfer_playback", description: "Transfer playback to device", inputSchema: { type: "object", properties: { deviceId: { type: "string" }, play: { type: "boolean" } }, required: ["deviceId"] } },
      { name: "get_recommendations", description: "Get personalized track recommendations", inputSchema: { type: "object", properties: { seed_artists: { type: "array", items: { type: "string" } }, seed_genres: { type: "array", items: { type: "string" } }, seed_tracks: { type: "array", items: { type: "string" } }, limit: { type: "integer" } } } },
      { name: "set_shuffle_state", description: "Toggle shuffle", inputSchema: { type: "object", properties: { state: { type: "boolean" } }, required: ["state"] } },
      { name: "set_repeat_mode", description: "Set repeat mode", inputSchema: { type: "object", properties: { state: { type: "string", enum: ["track", "context", "off"] } }, required: ["state"] } },
      { name: "add_to_queue", description: "Add item to queue", inputSchema: { type: "object", properties: { uri: { type: "string" } }, required: ["uri"] } },
      { name: "get_queue", description: "Get current queue", inputSchema: { type: "object", properties: {} } },
    ],
  };
});

// Tool Execution logic
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const accessToken = await getValidToken();

  if (!accessToken) throw new Error("Unauthorized: Please authenticate via /login first.");

  const api = axios.create({
    baseURL: "https://api.spotify.com/v1",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  try {
    switch (name) {
      case "get_current_track":
        const current = await api.get("/me/player/currently-playing");
        return { content: [{ type: "text", text: JSON.stringify(current.data || "Nothing is currently playing.") }] };
      case "play_pause":
        await api.put(`/me/player/${args.action === "pause" ? "pause" : "play"}`);
        return { content: [{ type: "text", text: `Playback ${args.action}ed.` }] };
      case "set_volume":
        await api.put(`/me/player/volume?volume_percent=${args.volume_percent}`);
        return { content: [{ type: "text", text: `Volume set to ${args.volume_percent}%.` }] };
      case "get_playback_state":
        const state = await api.get("/me/player");
        return { content: [{ type: "text", text: JSON.stringify(state.data) }] };
      case "create_playlist":
        const user = await api.get("/me");
        const playlist = await api.post(`/users/${user.data.id}/playlists`, { name: args.name, description: args.description, public: args.public ?? true });
        return { content: [{ type: "text", text: `Playlist created: ${playlist.data.name} (ID: ${playlist.data.id})` }] };
      case "add_to_playlist":
        await api.post(`/playlists/${args.playlistId}/tracks`, { uris: args.trackUris });
        return { content: [{ type: "text", text: "Tracks added to playlist." }] };
      case "get_user_playlists":
        const playlists = await api.get("/me/playlists", { params: { limit: args.limit || 20, offset: args.offset || 0 } });
        return { content: [{ type: "text", text: JSON.stringify(playlists.data) }] };
      case "search":
        const results = await api.get("/search", { params: { q: args.query, type: args.type.join(","), limit: args.limit || 20 } });
        return { content: [{ type: "text", text: JSON.stringify(results.data) }] };
      case "skip_to_next":
        await api.post("/me/player/next");
        return { content: [{ type: "text", text: "Skipped to next." }] };
      case "skip_to_previous":
        await api.post("/me/player/previous");
        return { content: [{ type: "text", text: "Skipped to previous." }] };
      case "remove_from_playlist":
        await api.delete(`/playlists/${args.playlistId}/tracks`, { data: { tracks: args.trackUris.map(uri => ({ uri })) } });
        return { content: [{ type: "text", text: "Tracks removed from playlist." }] };
      case "get_liked_songs":
        const liked = await api.get("/me/tracks", { params: { limit: args.limit || 20, offset: args.offset || 0 } });
        return { content: [{ type: "text", text: JSON.stringify(liked.data) }] };
      case "save_tracks":
        await api.put("/me/tracks", { ids: args.trackUris.map(u => u.split(":").pop()) });
        return { content: [{ type: "text", text: "Tracks saved to Library." }] };
      case "remove_saved_tracks":
        await api.delete("/me/tracks", { data: { ids: args.trackUris.map(u => u.split(":").pop()) } });
        return { content: [{ type: "text", text: "Tracks removed from Library." }] };
      case "get_available_devices":
        const devices = await api.get("/me/player/devices");
        return { content: [{ type: "text", text: JSON.stringify(devices.data) }] };
      case "transfer_playback":
        await api.put("/me/player", { device_ids: [args.deviceId], play: args.play ?? true });
        return { content: [{ type: "text", text: "Playback transferred." }] };
      case "get_recommendations":
        const recs = await api.get("/recommendations", { params: { seed_artists: args.seed_artists?.join(","), seed_genres: args.seed_genres?.join(","), seed_tracks: args.seed_tracks?.join(","), limit: args.limit || 20 } });
        return { content: [{ type: "text", text: JSON.stringify(recs.data) }] };
      case "set_shuffle_state":
        await api.put(`/me/player/shuffle?state=${args.state}`);
        return { content: [{ type: "text", text: `Shuffle ${args.state ? "on" : "off"}.` }] };
      case "set_repeat_mode":
        await api.put(`/me/player/repeat?state=${args.state}`);
        return { content: [{ type: "text", text: `Repeat mode: ${args.state}.` }] };
      case "add_to_queue":
        await api.post(`/me/player/queue?uri=${encodeURIComponent(args.uri)}`);
        return { content: [{ type: "text", text: "Item added to queue." }] };
      case "get_queue":
        const queue = await api.get("/me/player/queue");
        return { content: [{ type: "text", text: JSON.stringify(queue.data) }] };
      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error.response?.data?.error?.message || error.message }] };
  }
});

// OAuth Flow
app.get("/login", (req, res) => {
  const scopes = [
    "user-read-currently-playing", "user-modify-playback-state", "user-read-playback-state",
    "playlist-modify-public", "playlist-modify-private", "playlist-read-private",
    "user-library-read", "user-library-modify"
  ].join(" ");
  res.redirect(`https://accounts.spotify.com/authorize?response_type=code&client_id=${SPOTIFY_CLIENT_ID}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`);
});

app.get("/callback", async (req, res) => {
  try {
    const response = await axios.post("https://accounts.spotify.com/api/token", new URLSearchParams({
      grant_type: "authorization_code",
      code: req.query.code,
      redirect_uri: REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      client_secret: SPOTIFY_CLIENT_SECRET,
    }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    
    saveTokens(response.data);
    res.send("<h1>Authenticated Successfully</h1><p>You can close this window and start using the Spotify MCP.</p>");
  } catch (error) {
    res.status(500).send("Authentication failed");
  }
});

// SSE Transport
let transport;
app.get("/sse", authMiddleware, async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", authMiddleware, async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No active SSE transport.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await loadTokens();
  console.log(`\x1b[32m[Spotify MCP] Server running at http://localhost:${PORT}\x1b[0m`);
});
