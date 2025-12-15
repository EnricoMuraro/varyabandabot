import { spawn } from 'child_process';
import { createAudioResource, StreamType } from '@discordjs/voice';

/**
 * Crea una AudioResource da un URL YouTube usando yt-dlp + ffmpeg
 * @param {string} url - URL del video YouTube
 * @returns {AudioResource}
 */
export function createYouTubeResource(url) {
  // yt-dlp scarica il miglior audio e lo passa a ffmpeg
  const ytdlp = spawn('yt-dlp', [
    '-f', 'bestaudio',
    '-o', '-',          // output su stdout
    '--no-playlist',
    url
  ]);

  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);

  ytdlp.stderr.on('data', data => {
    console.error('[yt-dlp]', data.toString());
  });

  ffmpeg.stderr.on('data', data => {
    console.error('[ffmpeg]', data.toString());
  });

  ffmpeg.on('close', code => {
    console.log(`ffmpeg exited with code ${code}`);
  });

  return createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw
  });
}