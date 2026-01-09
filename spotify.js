// spotify.js
import { Client as SpotifyClient } from 'spotify-api.js';
import 'dotenv/config';

const spotify = new SpotifyClient({
  token: {
    clientID: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  },
});

export async function getPlaylistTracks(playlistId, limit = null, random = true) {
  let playlist = await spotify.playlists.get(playlistId);
  let trackCount = playlist.totalTracks;
  let remainingTracks = limit !== null ? limit : trackCount;
  let tracks = [];

  console.log(`Fetching up to ${remainingTracks} tracks from playlist ${playlistId}...`);

  while (remainingTracks > 0) {
    const batchSize = Math.min(remainingTracks, 100);
    const tracksBatch = await spotify.playlists.getTracks(playlistId, {
      limit: batchSize,
      offset: trackCount - remainingTracks,
    });
    tracks = tracks.concat(tracksBatch);
    remainingTracks -= tracksBatch.length;
  }

  if (random) {
    tracks = tracks.sort(() => Math.random() - 0.5);
  }

  if (!tracks || tracks.length === 0) {
    throw new Error('La playlist non contiene tracce o non è accessibile.');
  }

  // Enrich each item with convenient properties:
  // - name: track name
  // - artists: array of artist names
  // - artistsString: artists joined by ', '
  return tracks.map((item) => {
    // spotify-api.js returns items where the actual track object is in `item.track`.

    const track = item.track ?? item;
    const artistsArray = track.artists;
    const artistsString = artistsArray.map((a) =>  a?.name).join(', ');

    return {
      // keep original shape so callers that expect the original `item` still work
      ...item,
      // add convenience fields
      name: track.name ?? track.title ?? null,
      artists: artistsArray,
      artistsString,
    };
  });
}
