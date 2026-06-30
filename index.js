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

// Security Middleware
const authMiddleware = (req, res, next) => {
  if (!API_KEY) {
    return next();
  }

  const authHeader = req.headers["authorization"];
  const xApiKey = req.headers["x-api-key"];
  const token = authHeader ? authHeader.split(" ")[1] : xApiKey;

  if (token === API_KEY) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized: Invalid API Key" });
  }
};

// Token storage
let userTokens = {
  access_token: null,
  refresh_token: null,
  expires_at: null,
};

// Load tokens on startup
const loadTokens = async () => {
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
      userTokens = data;
      console.log("Tokens loaded from local file.");
      
      // Check if we need to refresh immediately
      if (userTokens.refresh_token && (!userTokens.expires_at || Date.now() > userTokens.expires_at)) {
        await refreshAccessToken();
      }
    } catch (error) {
      console.error("Error loading tokens:", error.message);
    }
  }
};

const saveTokens = (tokens) => {
  userTokens = {
    ...userTokens,
    ...tokens,
    expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : userTokens.expires_at,
  };
  
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(userTokens, null, 2));
    console.log("Tokens saved to local file.");
  } catch (error) {
    console.warn("Warning: Could not write tokens to disk (expected in read-only environments):", error.message);
  }
};

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
    console.log("Access token refreshed.");
  } catch (error) {
    console.error("Error refreshing token:", error.response?.data || error.message);
  }
};

const getValidToken = async () => {
  if (!userTokens.access_token) return null;

  if (userTokens.expires_at && Date.now() > userTokens.expires_at - 60000) {
    await refreshAccessToken();
  }

  return userTokens.access_token;
};

const server = new Server(
  {
    name: "spotify-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// MCP Tools Definition
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_current_track",
        description: "Get the currently playing track on Spotify",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "play_pause",
        description: "Toggle play/pause on Spotify",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["play", "pause"] },
          },
        },
      },
      {
        name: "set_volume",
        description: "Set the volume level on Spotify",
        inputSchema: {
          type: "object",
          properties: {
            volume_percent: { type: "integer", minimum: 0, maximum: 100 },
          },
          required: ["volume_percent"],
        },
      },
      {
        name: "get_playback_state",
        description: "Get information about the current playback state",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "create_playlist",
        description: "Create a new playlist for the user",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "The name of the playlist" },
            description: { type: "string", description: "The description of the playlist" },
            public: { type: "boolean", description: "Whether the playlist should be public" },
          },
          required: ["name"],
        },
      },
      {
        name: "add_to_playlist",
        description: "Add tracks to a playlist",
        inputSchema: {
          type: "object",
          properties: {
            playlistId: { type: "string", description: "The ID of the playlist" },
            trackUris: { 
              type: "array", 
              items: { type: "string" }, 
              description: "Array of Spotify track URIs (e.g. spotify:track:4iV5W9uYzb7p7MnST7sCZZ)" 
            },
          },
          required: ["playlistId", "trackUris"],
        },
      },
      {
        name: "get_user_playlists",
        description: "Get the current user's playlists",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
      },
      {
        name: "search",
        description: "Search Spotify for tracks, artists, albums, or playlists",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query" },
            type: { 
              type: "array", 
              items: { type: "string", enum: ["track", "artist", "album", "playlist"] },
              description: "Types of items to search for" 
            },
            limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          },
          required: ["query", "type"],
        },
      },
      {
        name: "skip_to_next",
        description: "Skip to the next track",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "skip_to_previous",
        description: "Skip to the previous track",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "remove_from_playlist",
        description: "Remove specific tracks from a playlist",
        inputSchema: {
          type: "object",
          properties: {
            playlistId: { type: "string", description: "The ID of the playlist" },
            trackUris: { 
              type: "array", 
              items: { type: "string" }, 
              description: "Array of Spotify track URIs to remove" 
            },
          },
          required: ["playlistId", "trackUris"],
        },
      },
      {
        name: "get_liked_songs",
        description: "Retrieve the user's saved tracks",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
        },
      },
      {
        name: "save_tracks",
        description: "Save/like tracks",
        inputSchema: {
          type: "object",
          properties: {
            trackUris: { 
              type: "array", 
              items: { type: "string" }, 
              description: "Array of Spotify track IDs or URIs to save" 
            },
          },
          required: ["trackUris"],
        },
      },
      {
        name: "remove_saved_tracks",
        description: "Unsave/unlike tracks",
        inputSchema: {
          type: "object",
          properties: {
            trackUris: { 
              type: "array", 
              items: { type: "string" }, 
              description: "Array of Spotify track IDs or URIs to remove" 
            },
          },
          required: ["trackUris"],
        },
      },
      {
        name: "get_available_devices",
        description: "Get a list of the user's active/available Spotify devices",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "transfer_playback",
        description: "Transfer playback to a specific device",
        inputSchema: {
          type: "object",
          properties: {
            deviceId: { type: "string", description: "The ID of the device to transfer to" },
            play: { type: "boolean", description: "Whether to ensure playback continues on the new device" },
          },
          required: ["deviceId"],
        },
      },
      {
        name: "get_recommendations",
        description: "Get track recommendations based on seed tracks, artists, or genres",
        inputSchema: {
          type: "object",
          properties: {
            seed_artists: { type: "array", items: { type: "string" }, description: "List of seed artist IDs" },
            seed_genres: { type: "array", items: { type: "string" }, description: "List of seed genre names" },
            seed_tracks: { type: "array", items: { type: "string" }, description: "List of seed track IDs" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
      {
        name: "set_shuffle_state",
        description: "Toggle shuffle on or off",
        inputSchema: {
          type: "object",
          properties: {
            state: { type: "boolean", description: "true to shuffle, false to turn off" },
          },
          required: ["state"],
        },
      },
      {
        name: "set_repeat_mode",
        description: "Set the repeat mode",
        inputSchema: {
          type: "object",
          properties: {
            state: { type: "string", enum: ["track", "context", "off"], description: "The repeat mode" },
          },
          required: ["state"],
        },
      },
      {
        name: "add_to_queue",
        description: "Add an item to the user's current playback queue",
        inputSchema: {
          type: "object",
          properties: {
            uri: { type: "string", description: "The Spotify URI of the item to add" },
          },
          required: ["uri"],
        },
      },
      {
        name: "get_queue",
        description: "Get the list of tracks in the user's queue",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

// MCP Tool Execution Logic
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const accessToken = await getValidToken();

  if (!accessToken) {
    throw new Error("Spotify not authenticated. Please visit /login");
  }

  const spotifyApi = axios.create({
    baseURL: "https://api.spotify.com/v1",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  try {
    switch (name) {
      case "get_current_track": {
        const response = await spotifyApi.get("/me/player/currently-playing");
        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      }
      case "play_pause": {
        const action = args.action === "pause" ? "pause" : "play";
        await spotifyApi.put(`/me/player/${action}`);
        return { content: [{ type: "text", text: `Playback ${action}ed` }] };
      }
      case "set_volume": {
        await spotifyApi.put(`/me/player/volume?volume_percent=${args.volume_percent}`);
        return { content: [{ type: "text", text: `Volume set to ${args.volume_percent}%` }] };
      }
      case "get_playback_state": {
        const response = await spotifyApi.get("/me/player");
        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      }
      case "create_playlist": {
        const userResponse = await spotifyApi.get("/me");
        const userId = userResponse.data.id;
        const response = await spotifyApi.post(`/users/${userId}/playlists`, {
          name: args.name,
          description: args.description,
          public: args.public !== undefined ? args.public : true,
        });
        return { content: [{ type: "text", text: `Playlist created: ${response.data.name} (ID: ${response.data.id})` }] };
      }
      case "add_to_playlist": {
        await spotifyApi.post(`/playlists/${args.playlistId}/tracks`, {
          uris: args.trackUris,
        });
        return { content: [{ type: "text", text: `Added ${args.trackUris.length} tracks to playlist.` }] };
      }
      case "get_user_playlists": {
        const response = await spotifyApi.get("/me/playlists", {
          params: {
            limit: args.limit || 20,
            offset: args.offset || 0,
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      }
      case "search": {
        const response = await spotifyApi.get("/search", {
          params: {
            q: args.query,
            type: args.type.join(","),
            limit: args.limit || 20,
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      }
      case "skip_to_next": {
        await spotifyApi.post("/me/player/next");
        return { content: [{ type: "text", text: "Skipped to next track" }] };
      }
      case "skip_to_previous": {
        await spotifyApi.post("/me/player/previous");
        return { content: [{ type: "text", text: "Skipped to previous track" }] };
      }
      case "remove_from_playlist": {
        await spotifyApi.delete(`/playlists/${args.playlistId}/tracks`, {
          data: { tracks: args.trackUris.map(uri => ({ uri })) },
        });
        return { content: [{ type: "text", text: `Removed tracks from playlist.` }] };
      }
      case "get_liked_songs": {
        const response = await spotifyApi.get("/me/tracks", {
          params: {
            limit: args.limit || 20,
            offset: args.offset || 0,
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      }
      case "save_tracks": {
        const ids = args.trackUris.map(uri => uri.split(":").pop());
        await spotifyApi.put("/me/tracks", { ids });
        return { content: [{ type: "text", text: "Tracks saved to Liked Songs" }] };
      }
      case "remove_saved_tracks": {
        const ids = args.trackUris.map(uri => uri.split(":").pop());
        await spotifyApi.delete("/me/tracks", { data: { ids } });
        return { content: [{ type: "text", text: "Tracks removed from Liked Songs" }] };
      }
      case "get_available_devices": {
        const response = await spotifyApi.get("/me/player/devices");
        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      }
      case "transfer_playback": {
        await spotifyApi.put("/me/player", {
          device_ids: [args.deviceId],
          play: args.play !== undefined ? args.play : true,
        });
        return { content: [{ type: "text", text: `Playback transferred to device ${args.deviceId}` }] };
      }
      case "get_recommendations": {
        const response = await spotifyApi.get("/recommendations", {
          params: {
            seed_artists: args.seed_artists?.join(","),
            seed_genres: args.seed_genres?.join(","),
            seed_tracks: args.seed_tracks?.join(","),
            limit: args.limit || 20,
          },
        });
        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      }
      case "set_shuffle_state": {
        await spotifyApi.put(`/me/player/shuffle?state=${args.state}`);
        return { content: [{ type: "text", text: `Shuffle set to ${args.state}` }] };
      }
      case "set_repeat_mode": {
        await spotifyApi.put(`/me/player/repeat?state=${args.state}`);
        return { content: [{ type: "text", text: `Repeat mode set to ${args.state}` }] };
      }
      case "add_to_queue": {
        await spotifyApi.post(`/me/player/queue?uri=${encodeURIComponent(args.uri)}`);
        return { content: [{ type: "text", text: `Added ${args.uri} to queue.` }] };
      }
      case "get_queue": {
        const response = await spotifyApi.get("/me/player/queue");
        return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: error.response?.data?.error?.message || error.message }],
    };
  }
});

// Spotify Auth Endpoints
app.get("/login", (req, res) => {
  const scopes = "user-read-currently-playing user-modify-playback-state user-read-playback-state playlist-modify-public playlist-modify-private playlist-read-private user-library-read user-library-modify";
  res.redirect(
    `https://accounts.spotify.com/authorize?response_type=code&client_id=${SPOTIFY_CLIENT_ID}&scope=${encodeURIComponent(
      scopes
    )}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
  );
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  try {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    
    saveTokens(response.data);
    res.send("Authentication successful! You can now use the Spotify MCP.");
  } catch (error) {
    res.status(500).send("Authentication failed");
  }
});

// MCP SSE Endpoints
let transport;
app.get("/sse", authMiddleware, async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", authMiddleware, async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No SSE transport active");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await loadTokens();
  console.log(`Spotify MCP server running on port ${PORT}`);
});
