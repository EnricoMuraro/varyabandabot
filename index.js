import 'dotenv/config';
import { createYouTubeResource, getAudioDuration } from './yt-dlp.js';
import { Client, GatewayIntentBits } from 'discord.js';
import { getPlaylistTracks } from './spotify.js'
import VaryabandaGame from './varyabanda_game.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
  NoSubscriberBehavior,
  StreamType,
} from '@discordjs/voice';
import fetch from 'node-fetch';
import { PlaylistManager } from 'spotify-api.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const players = new Map();
const games = new Map();

function getOrCreatePlayer(guildId) {
  let player = players.get(guildId);
  if (!player) {
    player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    players.set(guildId, player);
  }
  return player;
}

function getOrCreateGame(guildId) {
  let game = games.get(guildId);
  if (!game) {
    game = new VaryabandaGame();
    games.set(guildId, game);
  }
  return game;
}

async function searchYouTube(query) {
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
  const html = await res.text();
  const match = html.match(/\/watch\?v=([\w-]{11})/);
  if (!match) throw new Error('Nessun video trovato.');
  return `https://www.youtube.com/watch?v=${match[1]}`;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();


  if (message.content.startsWith('!yt')) {
    const query = message.content.slice(3).trim();
    if (!query) return message.channel.send('Scrivi un URL YouTube dopo !yt');

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) return message.channel.send('Entra in un canale vocale prima.');

    try {
      const resource = createYouTubeResource(query);

      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      // use a guild-scoped player so commands like !skip work consistently
      const player = getOrCreatePlayer(message.guild.id);
      connection.subscribe(player);
      player.play(resource);

      message.channel.send(`▶️ Riproduzione: ${query}`);
    } catch (err) {
      console.error(err);
      message.channel.send('Errore nella riproduzione.');
    }
  }

  if (content.startsWith('!skip')) {
    const player = players.get(message.guild.id);
    if (!player) {
      await message.reply('Nessuna riproduzione in corso.');
      return;
    }

    try {
      // stop the current resource; the player will emit 'idle' and move on
      player.stop();
      await message.reply('Traccia saltata.');
    } catch (err) {
      console.error(err);
      await message.reply('Impossibile saltare la traccia.');
    }
  }

  if (content.startsWith('!playlist')) {
    const url = content.split(/\s+/)[1];
    const playlistId = url?.split('/playlist/')[1]?.split('?')[0];
    if (!playlistId) return message.reply('Link playlist non valido.');

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      await message.reply('Entra in un canale vocale prima di usare il comando.');
      return;
    }
    try {
    const tracks = await getPlaylistTracks(playlistId);
    await message.reply(`Avvio playlist con ${tracks.length} brani.`);

      const connection =
        getVoiceConnection(message.guild.id) ||
        joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
        });

      const player = getOrCreatePlayer(message.guild.id);
      connection.subscribe(player);

      // iterate items returned by getPlaylistTracks (we enrich items with `name` and `artistsString`)
      for (const item of tracks) {
        const title = item.name;
        const artistsString = item.artistsString;
        const query = `${title} ${artistsString}`.trim();

        try {
          const ytUrl = await searchYouTube(query);

          const resource = createYouTubeResource(ytUrl);
          player.play(resource);
          await new Promise((resolve) => player.once('idle', resolve));
        } catch (err) {
          console.error('Errore riproduzione traccia playlist:', err);
          await message.channel.send(`Brano non trovato: ${title}`);
        }
      }

      await message.channel.send('Playlist completata.');
    } catch (err) {
      console.error(err);
      message.reply('Errore nel recupero della playlist.');
    }
  }

  if (content.startsWith('!stop')) {
    const conn = getVoiceConnection(message.guild.id);
    if (conn) {
      conn.destroy();
      message.reply('Disconnesso dal canale vocale.');
    }
  }

  if (content.startsWith('!varyabanda')) {
    const url = content.split(/\s+/)[1];
    const playlistId = url?.split('/playlist/')[1]?.split('?')[0];
    if (!playlistId) return message.reply('Link playlist non valido.');

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      await message.reply('Entra in un canale vocale prima di usare il comando.');
      return;
    }
    // instantiate a fresh game for this command
    const game = new VaryabandaGame();
    games.set(message.guild.id, game);

    // attach basic event listeners so the channel is informed
    game.on('titleGuessed', ({ roundNumber, title, scorers }) => {
      message.channel.send(`Titolo indovinato da ${scorers.join ? scorers.join(', ') : scorers}: ${title}`);
    });
    game.on('artistGuessed', ({ roundNumber, artistIndex, artist, scorers }) => {
      const artistType = artistIndex === 0 ? 'Artista' : 'Feat';
      message.channel.send(`${artistType} indovinato da ${scorers.join ? scorers.join(', ') : scorers}: ${artist}`);
    });
    game.on('roundOver', ({ roundNumber, title, artists, scoreboard, newPoints }) => {
      
      const scoreboardMsg = Array.from(scoreboard.entries()).sort((a, b) => b[1] - a[1])
        .map(([userId, score]) => {
          let points = newPoints.get(userId) ?? 0;
          let newPointsText = points > 0 ? ` (+${points})` : '';
          return `${game.players.get(userId) ?? userId}: ${score}${newPointsText} punti`
        })
        .join('\n');

      message.channel.send(`
        Round ${roundNumber} terminato — Titolo: ${title} — Artisti: ${artists.join ? artists.join(', ') : artists}
        Classifica:
        ${scoreboardMsg}
        `);

      const player = players.get(message.guild.id);  
      player.stop();
    });
    try {
      const tracks = await getPlaylistTracks(playlistId);
      await message.reply(`Avvio varyabanda con ${tracks.length} brani.`);
      console.log(`Avvio varyabanda con ${tracks.length} brani.`);
      const connection =
        getVoiceConnection(message.guild.id) ||
        joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
        });

      const player = getOrCreatePlayer(message.guild.id);
      connection.subscribe(player);
      game.start();
      // iterate items returned by getPlaylistTracks (we enrich items with `name` and `artistsString`)
      let roundNumber = 1;
      for (const item of tracks) {
        const title = item.name;
        const artistsString = item.artistsString;
        const query = `${title} ${artistsString}`.trim();

        try {
          const ytUrl = await searchYouTube(query);
          
          const timeLimits = game.getSongTimeLimits(await getAudioDuration(ytUrl));
          const resource = createYouTubeResource(ytUrl, `*${timeLimits.startSecond}-${timeLimits.endSecond}`);
          player.play(resource);

          game.startNewRound(roundNumber, item.name, item.artists.map(a => a.name));

          await new Promise((resolve) => player.once('idle', resolve));
        } catch (err) {
          console.error('Errore riproduzione traccia playlist:', err);
          await message.channel.send(`Brano non trovato: ${title}`);
        }
        finally {
          game.finishCurrentRound();
          roundNumber += 1;
        }
      }

      await message.channel.send('Varyabanda completato.');
      game.stop();
    } catch (err) {
      console.error(err);
      message.reply('Errore nel recupero della playlist.');
    }
  }

  const guildId = message.guild?.id;
  const runningGame = games.get(guildId);
  if (runningGame && runningGame.gameStarted) {
    console.log(`Nuovo tentativo di indovinare da ${message.author.username}: ${message.content}`);
    const finalGuess = runningGame.newGuess(
      message.author.id,
      message.author.username,
      message.content,
      message.createdTimestamp
    );
    if (finalGuess) {
      const player = getOrCreatePlayer(message.guild.id);
      if (player.state.status !== 'idle') {
        player.stop();
      }
    }
  }

});



client.once('ready', () => {
  console.log(`✅ Bot attivo come ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);