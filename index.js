import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

// Supabase environment variables (supports standard and next-public names)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Check if stdio mode is requested via command line argument or environment variable
const useStdio = process.argv.includes("--stdio") || process.env.TRANSPORT === "stdio";

/**
 * Custom Logger
 * In stdio mode, standard output (stdout) is reserved for MCP protocol JSON-RPC messages.
 * Any other output to stdout will break the connection, so we redirect logs to stderr.
 */
const log = (...args) => {
  if (useStdio) {
    console.error("[Spotify MCP]", ...args);
  } else {
    console.log("[Spotify MCP]", ...args);
  }
};

/**
 * Security Middleware
 * Validates requests if API_KEY is set in environment variables.
 * Supports both Bearer scheme and direct API key in Authorization header or x-api-key header.
 */
const authMiddleware = (req, res, next) => {
  if (!API_KEY) return next();

  const authHeader = req.headers["authorization"];
  const xApiKey = req.headers["x-api-key"];
  const queryApiKey = req.query.api_key || req.query.apiKey || req.query.token;
  const providedKey = xApiKey || queryApiKey || (authHeader ? (authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader) : null);

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
 * Loads tokens from Supabase or local disk if available.
 * Fails gracefully in diskless/read-only environments.
 */
const loadTokens = async () => {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      log("[Auth] Connecting to Supabase to load tokens...");
      const response = await axios.get(`${SUPABASE_URL}/rest/v1/spotify_auth`, {
        params: { id: "eq.session" },
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });

      if (response.data && response.data.length > 0) {
        const row = response.data[0];
        userTokens = {
          access_token: row.access_token,
          refresh_token: row.refresh_token,
          expires_at: row.expires_at ? Number(row.expires_at) : null,
        };
        log("[Auth] Tokens loaded from Supabase.");
        
        if (userTokens.refresh_token && (!userTokens.expires_at || Date.now() > userTokens.expires_at)) {
          try {
            await refreshAccessToken();
          } catch (refreshErr) {
            console.warn("[Auth] Initial token refresh failed, will retry on request:", refreshErr.message);
          }
        }
        return;
      } else {
        log("[Auth] No session found in Supabase. A new one will be created upon login.");
      }
    } catch (error) {
      console.warn("[Auth] Could not load tokens from Supabase, falling back to local file:", error.response?.data || error.message);
    }
  }

  // Local file fallback
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
      userTokens = data;
      log("[Auth] Tokens loaded from disk.");
      
      if (userTokens.refresh_token && (!userTokens.expires_at || Date.now() > userTokens.expires_at)) {
        try {
          await refreshAccessToken();
        } catch (refreshErr) {
          console.warn("[Auth] Initial token refresh failed, will retry on request:", refreshErr.message);
        }
      }
    }
  } catch (error) {
    console.warn("[Auth] Could not load tokens from disk:", error.message);
  }
};

/**
 * Persists tokens to Supabase or disk.
 * Handles read-only file systems without crashing.
 */
const saveTokens = async (tokens) => {
  userTokens = {
    ...userTokens,
    ...tokens,
    refresh_token: tokens.refresh_token || userTokens.refresh_token,
    expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : userTokens.expires_at,
  };

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      log("[Auth] Saving tokens to Supabase...");
      await axios.post(
        `${SUPABASE_URL}/rest/v1/spotify_auth`,
        {
          id: "session",
          access_token: userTokens.access_token,
          refresh_token: userTokens.refresh_token,
          expires_at: userTokens.expires_at,
          updated_at: new Date().toISOString(),
        },
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates", // Upsert behavior in PostgREST
          },
        }
      );
      log("[Auth] Session persisted to Supabase.");
      return;
    } catch (error) {
      console.warn("[Auth] Failed to persist session to Supabase, falling back to local file:", error.response?.data || error.message);
    }
  }
  
  // Local file fallback
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(userTokens, null, 2));
    log("[Auth] Session persisted to disk.");
  } catch (error) {
    console.warn("[Auth] Failed to persist session (expected in diskless environments):", error.message);
  }
};

/**
 * Refreshes the access token using the stored refresh token.
 */
const refreshAccessToken = async () => {
  if (!userTokens.refresh_token) {
    throw new Error("No refresh token available. Please log in first.");
  }

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
    
    await saveTokens(response.data);
    log("[Auth] Access token refreshed successfully.");
  } catch (error) {
    const errorData = error.response?.data || error.message;
    console.error("[Auth] Refresh failed:", errorData);
    throw new Error(typeof errorData === "object" ? JSON.stringify(errorData) : errorData);
  }
};

/**
 * Returns a valid access token, refreshing it if necessary or if forced.
 */
const getValidToken = async (forceRefresh = false) => {
  if (!userTokens.access_token) return null;

  // Refresh if forced or token expires in less than 1 minute
  if (forceRefresh || (userTokens.expires_at && Date.now() > userTokens.expires_at - 60000)) {
    try {
      await refreshAccessToken();
    } catch (error) {
      console.error("[Auth] Failed to get valid token:", error.message);
      if (forceRefresh) throw error;
    }
  }

  return userTokens.access_token;
};

const server = new Server(
  {
    name: "spotify-mcp",
    version: "1.4.6",
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
      { 
        name: "get_playlist_tracks", 
        description: "Get tracks/items from a playlist (supports pagination)", 
        inputSchema: { 
          type: "object", 
          properties: { 
            playlistId: { type: "string", description: "The Spotify ID of the playlist" }, 
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20, description: "The maximum number of tracks to return (max 100)" }, 
            offset: { type: "integer", minimum: 0, default: 0, description: "The index of the first track to return (use for pagination, e.g., 100 to get the next page)" } 
          }, 
          required: ["playlistId"] 
        } 
      },
      { 
        name: "search", 
        description: "Search Spotify content", 
        inputSchema: { 
          type: "object", 
          properties: { 
            query: { type: "string", description: "Search query keywords" }, 
            type: { 
              type: "array", 
              items: { 
                type: "string", 
                enum: ["album", "artist", "playlist", "track", "show", "episode", "audiobook"] 
              },
              description: "Array of item types to search across"
            }, 
            limit: { type: "integer", minimum: 1, maximum: 50, default: 20 } 
          }, 
          required: ["query", "type"] 
        } 
      },
      { name: "skip_to_next", description: "Skip to next track", inputSchema: { type: "object", properties: {} } },
      { name: "skip_to_previous", description: "Skip to previous track", inputSchema: { type: "object", properties: {} } },
      { name: "remove_from_playlist", description: "Remove tracks from a playlist", inputSchema: { type: "object", properties: { playlistId: { type: "string" }, trackUris: { type: "array", items: { type: "string" } } }, required: ["playlistId", "trackUris"] } },
      { name: "get_liked_songs", description: "Get saved tracks", inputSchema: { type: "object", properties: { limit: { type: "integer" }, offset: { type: "integer" } } } },
      { name: "save_tracks", description: "Save tracks to library", inputSchema: { type: "object", properties: { trackUris: { type: "array", items: { type: "string" } } }, required: ["trackUris"] } },
      { name: "remove_saved_tracks", description: "Remove tracks from library", inputSchema: { type: "object", properties: { trackUris: { type: "array", items: { type: "string" } } }, required: ["trackUris"] } },
      { name: "get_available_devices", description: "List available devices", inputSchema: { type: "object", properties: {} } },
      { name: "transfer_playback", description: "Transfer playback to device", inputSchema: { type: "object", properties: { deviceId: { type: "string" }, play: { type: "boolean" } }, required: ["deviceId"] } },
      { 
        name: "get_recommendations", 
        description: "Get personalized track recommendations. At least one seed must be provided.", 
        inputSchema: { 
          type: "object", 
          properties: { 
            seed_artists: { type: "array", items: { type: "string" }, description: "Array of Spotify artist IDs (max 5 seeds total across all types)" }, 
            seed_genres: { type: "array", items: { type: "string" }, description: "Array of genre names (max 5 seeds total across all types)" }, 
            seed_tracks: { type: "array", items: { type: "string" }, description: "Array of Spotify track IDs (max 5 seeds total across all types)" }, 
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 } 
          } 
        } 
      },
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
  let accessToken = await getValidToken();

  if (!accessToken) {
    throw new Error(`Unauthorized: Please authenticate by visiting the login page first.`);
  }

  const executeRequest = async (token) => {
    const api = axios.create({
      baseURL: "https://api.spotify.com/v1",
      headers: { Authorization: `Bearer ${token}` },
    });

    switch (name) {
      case "get_current_track": {
        const current = await api.get("/me/player/currently-playing");
        return { content: [{ type: "text", text: JSON.stringify(current.data || "Nothing is currently playing.") }] };
      }
      case "play_pause":
        await api.put(`/me/player/${args.action === "pause" ? "pause" : "play"}`);
        return { content: [{ type: "text", text: `Playback ${args.action}ed.` }] };
      case "set_volume":
        await api.put(`/me/player/volume?volume_percent=${args.volume_percent}`);
        return { content: [{ type: "text", text: `Volume set to ${args.volume_percent}%.` }] };
      case "get_playback_state": {
        const state = await api.get("/me/player");
        return { content: [{ type: "text", text: JSON.stringify(state.data) }] };
      }
      case "create_playlist": {
        const user = await api.get("/me");
        const playlist = await api.post(`/users/${user.data.id}/playlists`, { name: args.name, description: args.description, public: args.public ?? true });
        return { content: [{ type: "text", text: `Playlist created: ${playlist.data.name} (ID: ${playlist.data.id})` }] };
      }
      case "add_to_playlist":
        await api.post(`/playlists/${args.playlistId}/items`, { uris: args.trackUris });
        return { content: [{ type: "text", text: "Tracks added to playlist." }] };
      case "get_user_playlists": {
        const playlists = await api.get("/me/playlists", { params: { limit: args.limit || 20, offset: args.offset || 0 } });
        return { content: [{ type: "text", text: JSON.stringify(playlists.data) }] };
      }
      case "get_playlist_tracks": {
        const tracks = await api.get(`/playlists/${args.playlistId}/items`, { params: { limit: args.limit || 20, offset: args.offset || 0 } });
        if (tracks.data && Array.isArray(tracks.data.items)) {
          tracks.data.items = tracks.data.items.filter(item => item && item.track !== null);
        }
        return { content: [{ type: "text", text: JSON.stringify(tracks.data) }] };
      }
      case "search": {
        const results = await api.get("/search", { params: { q: args.query, type: args.type.join(","), limit: args.limit || 20 } });
        return { content: [{ type: "text", text: JSON.stringify(results.data) }] };
      }
      case "skip_to_next":
        await api.post("/me/player/next");
        return { content: [{ type: "text", text: "Skipped to next." }] };
      case "skip_to_previous":
        await api.post("/me/player/previous");
        return { content: [{ type: "text", text: "Skipped to previous." }] };
      case "remove_from_playlist":
        await api.delete(`/playlists/${args.playlistId}/items`, { data: { items: args.trackUris.map(uri => ({ uri })) } });
        return { content: [{ type: "text", text: "Tracks removed from playlist." }] };
      case "get_liked_songs": {
        const liked = await api.get("/me/tracks", { params: { limit: args.limit || 20, offset: args.offset || 0 } });
        return { content: [{ type: "text", text: JSON.stringify(liked.data) }] };
      }
      case "save_tracks":
        await api.put("/me/tracks", { ids: args.trackUris.map(u => u.split(":").pop()) });
        return { content: [{ type: "text", text: "Tracks saved to Library." }] };
      case "remove_saved_tracks":
        await api.delete("/me/tracks", { data: { ids: args.trackUris.map(u => u.split(":").pop()) } });
        return { content: [{ type: "text", text: "Tracks removed from Library." }] };
      case "get_available_devices": {
        const devices = await api.get("/me/player/devices");
        return { content: [{ type: "text", text: JSON.stringify(devices.data) }] };
      }
      case "transfer_playback":
        await api.put("/me/player", { device_ids: [args.deviceId], play: args.play ?? true });
        return { content: [{ type: "text", text: "Playback transferred." }] };
      case "get_recommendations": {
        const seedCount = (args.seed_artists?.length || 0) + (args.seed_genres?.length || 0) + (args.seed_tracks?.length || 0);
        if (seedCount === 0) {
          throw new Error("You must provide at least one seed (seed_artists, seed_genres, or seed_tracks) for recommendations.");
        }
        if (seedCount > 5) {
          throw new Error("Spotify API allows a maximum of 5 seeds total across artists, genres, and tracks combined.");
        }
        const recs = await api.get("/recommendations", { params: { seed_artists: args.seed_artists?.join(","), seed_genres: args.seed_genres?.join(","), seed_tracks: args.seed_tracks?.join(","), limit: args.limit || 20 } });
        return { content: [{ type: "text", text: JSON.stringify(recs.data) }] };
      }
      case "set_shuffle_state":
        await api.put(`/me/player/shuffle?state=${args.state}`);
        return { content: [{ type: "text", text: `Shuffle ${args.state ? "on" : "off"}.` }] };
      case "set_repeat_mode":
        await api.put(`/me/player/repeat?state=${args.state}`);
        return { content: [{ type: "text", text: `Repeat mode: ${args.state}.` }] };
      case "add_to_queue":
        await api.post(`/me/player/queue?uri=${encodeURIComponent(args.uri)}`);
        return { content: [{ type: "text", text: "Item added to queue." }] };
      case "get_queue": {
        const queue = await api.get("/me/player/queue");
        return { content: [{ type: "text", text: JSON.stringify(queue.data) }] };
      }
      default:
        throw new Error(`Tool not found: ${name}`);
    }
  };

  try {
    return await executeRequest(accessToken);
  } catch (error) {
    // If it's a 401 Unauthorized, attempt force refresh and retry exactly once
    if (error.response?.status === 401 && userTokens.refresh_token) {
      log("[Auth] Received 401 Unauthorized. Attempting token refresh and retry...");
      try {
        accessToken = await getValidToken(true);
        if (accessToken) {
          return await executeRequest(accessToken);
        }
      } catch (retryError) {
        console.error("[Auth] Token refresh retry failed:", retryError.message);
      }
    }

    // Intercept playback command failures when no active device exists (status 404 or specific error body)
    const status = error.response?.status;
    const errorMsg = error.response?.data?.error?.message || "";
    const playbackCommandTools = ["play_pause", "set_volume", "skip_to_next", "skip_to_previous", "set_shuffle_state", "set_repeat_mode", "add_to_queue"];
    
    if (playbackCommandTools.includes(name) && (status === 404 || errorMsg.toLowerCase().includes("no active device") || errorMsg.toLowerCase().includes("restriction violated"))) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: "No active playback device found. Please open and start Spotify on one of your devices (phone, computer, smart speaker, etc.) and try again, or use the 'get_available_devices' and 'transfer_playback' tools to activate a device."
        }]
      };
    }

    return { 
      isError: true, 
      content: [{ type: "text", text: errorMsg || error.message }] 
    };
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
    log(`[Auth] Callback received. Exchanging code with Spotify (Redirect URI: ${REDIRECT_URI})...`);
    const response = await axios.post("https://accounts.spotify.com/api/token", new URLSearchParams({
      grant_type: "authorization_code",
      code: req.query.code,
      redirect_uri: REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      client_secret: SPOTIFY_CLIENT_SECRET,
    }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    
    await saveTokens(response.data);
    res.send("<h1>Authenticated Successfully</h1><p>Your session has been saved. You can close this window now.</p>");
  } catch (error) {
    console.error("[Auth Callback Error]", error.response?.data || error.message);
    res.status(500).send(`Authentication failed: ${error.response?.data?.error_description || error.message}`);
  }
});

app.get("/debug", async (req, res) => {
  try {
    if (!userTokens.access_token) {
      return res.status(401).send("No active token. Please login first by visiting /login");
    }

    const api = axios.create({
      baseURL: "https://api.spotify.com/v1",
      headers: { Authorization: `Bearer ${userTokens.access_token}` },
    });

    // 1. Get user profile
    const me = await api.get("/me");
    
    // 2. Get playlist details
    let playlistInfo = "No playlist queried";
    const targetPlaylistId = "3h6TRrs9qyIXAE2uuViaSn";
    try {
      const playlist = await api.get(`/playlists/${targetPlaylistId}`);
      playlistInfo = {
        name: playlist.data.name,
        owner_id: playlist.data.owner.id,
        owner_display_name: playlist.data.owner.display_name,
        collaborative: playlist.data.collaborative,
        public: playlist.data.public
      };
    } catch (pe) {
      playlistInfo = `Error fetching playlist: ${pe.response?.data?.error?.message || pe.message}`;
    }

    // 3. Get token scopes from Spotify response headers
    const scopes = me.headers["x-oauth-scopes"] || "unknown";

    res.json({
      loggedInUser: {
        id: me.data.id,
        display_name: me.data.display_name,
        email: me.data.email,
        country: me.data.country
      },
      tokenScopes: scopes,
      targetPlaylist: playlistInfo,
      match: me.data.id === playlistInfo.owner_id ? "MATCH (You own this playlist)" : "MISMATCH (You do NOT own this playlist!)"
    });
  } catch (err) {
    res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

// SSE Transport
let transport;
app.get("/mcp", authMiddleware, async (req, res) => {
  res.setHeader("X-Accel-Buffering", "no");

  if (transport) {
    log("[SSE] Closing existing transport connection...");
    try {
      await transport.close();
    } catch (err) {
      log("[SSE] Error closing existing transport:", err.message);
    }
  }

  // Force reset server transport state to allow new connection
  server._transport = undefined;

  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).send("No active SSE transport.");
  }
});

const PORT = process.env.PORT || 3000;

// Export app for serverless environments (e.g. Vercel)
export default app;

const startServer = async () => {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    console.warn("\x1b[33m[Spotify MCP] [Warning] SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET is not set in environment variables.\x1b[0m");
  }

  if (useStdio) {
    try {
      const stdioTransport = new StdioServerTransport();
      await server.connect(stdioTransport);
      console.error("[Spotify MCP] Connected via Stdio transport.");
    } catch (err) {
      console.error("[Spotify MCP] Failed to connect via Stdio transport:", err.message);
    }
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, () => {
      log(`\x1b[32m[Spotify MCP] Express server running at http://localhost:${PORT}\x1b[0m`);
      if (useStdio) {
        log(`[Spotify MCP] OAuth callback will be handled at ${REDIRECT_URI}. Run oauth authentication by visiting http://localhost:${PORT}/login`);
      } else {
        log(`[Spotify MCP] You can connect clients via SSE at http://localhost:${PORT}/mcp`);
      }

      // Load tokens in background after server starts listening
      loadTokens()
        .then(() => log("[Auth] Tokens loaded successfully in background."))
        .catch((err) => console.error("[Auth] Failed to load tokens in background:", err.message));
    });
  } else {
    // Vercel background load
    loadTokens()
      .then(() => log("[Auth] Tokens loaded successfully in background."))
      .catch((err) => console.error("[Auth] Failed to load tokens in background:", err.message));
  }
};

startServer().catch((err) => {
  console.error("[Spotify MCP] Failed to start server:", err);
});
