## Purpose
Help an AI coding agent be productive in the `varyabandabot` repository by summarizing architecture, runtime requirements, conventions, and concrete examples.

## Big picture
- Single-process Discord bot (ESM) implemented in `index.js`.
- Responsibilities split across a few files:
  - `index.js` — main event handlers, command parsing (`!yt`, `!playlist`, `!stop`), voice connection management using `@discordjs/voice`.
  - `yt-dlp.js` — creates an audio stream by spawning `yt-dlp` and `ffmpeg` and returning an `AudioResource`.
  - `spotify.js` — small wrapper using `spotify-api.js` to fetch playlist tracks (`getPlaylistTracks`).
  - `varyabanda_game.js` — currently empty (placeholder).

## Runtime / developer workflows
- Node runs in ESM mode (`"type": "module"` in `package.json`). Use a recent Node.js that supports ESM.
- Install dependencies from `package.json` with `npm install` before running.
- Environment variables (required):
  - `DISCORD_TOKEN` — Discord bot token used in `index.js`.
  - `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` — used by `spotify.js`.
- External binaries required on PATH at runtime:
  - `yt-dlp` — spawned from `yt-dlp.js`.
  - `ffmpeg` — spawned from `yt-dlp.js`.
- To run locally: set env vars (e.g., in a `.env` file) and run `node index.js`.

## Project-specific conventions & patterns (concrete)
- Command parsing: `index.js` listens to `messageCreate` and checks prefixes like `!yt`, `!playlist`, `!stop`.
  - Example: `!yt <url|query>` will call `createYouTubeResource` from `yt-dlp.js` and play into a voice channel.
  - Example: `!playlist <spotify_url>` extracts playlist id and calls `getPlaylistTracks(playlistId)` from `spotify.js`.
- Voice/audio pattern: prefer a guild-scoped `AudioPlayer` (see `players` Map and `getOrCreatePlayer(guildId)` in `index.js`). Use `joinVoiceChannel()` and `connection.subscribe(player)`.
- Stream construction: `yt-dlp.js` spawns `yt-dlp` with `-o -` and pipes into `ffmpeg` which outputs raw PCM; `createAudioResource` is created from `ffmpeg.stdout` with `StreamType.Raw`.

## Important implementation notes & gotchas (discoverable issues to watch)
- `yt-dlp.js` uses child processes; failure modes include missing binaries or permission issues — check stderr logs (the file already logs stderr from both processes).
- `index.js` contains some observable bugs and inconsistencies an agent may need to fix:
  - Template strings: single quotes are used in several places where backticks were intended (e.g. `await message.reply('Avvio playlist con ${tracks.length} brani.')`) — string interpolation won't work.
  - Playlist loop: `for (const track in tracks)` iterates indices rather than items; code later references `track.title` which is incorrect. Use `for (const track of tracks)` and access `track.track` or the correct structure returned by `spotify-api.js`.
  - `!yt` command creates a new `AudioPlayer` instead of using `getOrCreatePlayer` (inconsistent guild player handling).
  - `searchYouTube` scrapes YouTube HTML to find the first `/watch?v=` link — fragile and language-dependent.

## Files to inspect for examples and edits
- `index.js` — entrypoint, message handlers, voice handling (main place to add commands).
- `yt-dlp.js` — spawning external processes and creating an `AudioResource` (copy this pattern when adding other streamed sources).
- `spotify.js` — shows how the Spotify client is instantiated and how to retrieve playlist tracks.

## Suggested quick tasks for contributors or agents
- Fix template string interpolation and the playlist loop in `index.js` (see above bug list).
- Add a `start` script to `package.json` to run the bot (`"start": "node index.js"`).
- Add runtime checks at startup that `yt-dlp` and `ffmpeg` are available and print clear error messages.

## Example snippets for common tasks
- Play a direct YouTube URL: `!yt https://www.youtube.com/watch?v=<id>` — `index.js` calls `createYouTubeResource` which expects a full URL or query.
- Fetch a Spotify playlist: `spotify.js` exports `getPlaylistTracks(playlistId)` which returns `playlist.tracks.items`.

## Tone & language
- The user-visible messages in the code are in Italian — keep user-facing text in Italian unless instructed otherwise.

---
If anything in this file is unclear or you want more detail (e.g., automatic checks for missing binaries, a sample `.env.example`, or a fixed PR for the bugs listed), tell me which part you'd like me to expand or implement next.
