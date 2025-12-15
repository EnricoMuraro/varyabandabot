// spotify.js
import { Client as SpotifyClient } from 'spotify-api.js';
import 'dotenv/config';

const spotify = new SpotifyClient({
  token: {
    clientID: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  },
});

export async function getPlaylistTracks(playlistId) {
  const playlist = await spotify.playlists.get(playlistId);

  if (!playlist.tracks || !playlist.tracks.items) {
    throw new Error('La playlist non contiene tracce o non è accessibile.');
  }

  return playlist.tracks.items;
}
