import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || "http://localhost:3000/callback";

// In-memory token storage (for demo purposes)
let userTokens = {
  access_token: null,
  refresh_token: null,
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
    ],
  };
});

// MCP Tool Execution Logic
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!userTokens.access_token) {
    throw new Error("Spotify not authenticated. Please visit /login");
  }

  const spotifyApi = axios.create({
    baseURL: "https://api.spotify.com/v1",
    headers: { Authorization: `Bearer ${userTokens.access_token}` },
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
  const scopes = "user-read-currently-playing user-modify-playback-state user-read-playback-state playlist-modify-public playlist-modify-private playlist-read-private";
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
    userTokens = response.data;
    res.send("Authentication successful! You can now use the Spotify MCP.");
  } catch (error) {
    res.status(500).send("Authentication failed");
  }
});

// MCP SSE Endpoints
let transport;
app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No SSE transport active");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Spotify MCP server running on port ${PORT}`);
});
