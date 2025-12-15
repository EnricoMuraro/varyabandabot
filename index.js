import 'dotenv/config';
import { createYouTubeResource } from './yt-dlp.js';
import { Client, GatewayIntentBits } from 'discord.js';
import { getPlaylistTracks } from 'spotify.js'
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
  NoSubscriberBehavior,
  StreamType,
} from '@discordjs/voice';
import fetch from 'node-fetch';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const players = new Map();

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

      const player = createAudioPlayer();
      connection.subscribe(player);
      player.play(resource);

      message.channel.send(`▶️ Riproduzione: ${query}`);
    } catch (err) {
      console.error(err);
      message.channel.send('Errore nella riproduzione.');
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
      await message.reply('Avvio playlist con ${tracks.length} brani.');

      const connection =
        getVoiceConnection(message.guild.id) ||
        joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
        });

      const player = getOrCreatePlayer(message.guild.id);
      connection.subscribe(player);

      for (const track in tracks) {
        const query = '${track.title} ' + track.artists.map((a) => a.name).join(', ');
        try {
          const ytUrl = await searchYouTube(query);
          
          const resource = createYouTubeResource(ytUrl);
          player.play(resource);
          await new Promise((resolve) => player.once('idle', resolve));
        } catch {
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
});

client.once('ready', () => {
  console.log(`✅ Bot attivo come ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);