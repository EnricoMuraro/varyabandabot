import { spawn } from 'child_process';
import { createAudioResource, StreamType } from '@discordjs/voice';

/**
 * Crea una AudioResource da un URL YouTube usando yt-dlp + ffmpeg
 * @param {string} url - URL del video YouTube
 * @returns {AudioResource}
 */
export function createYouTubeResource(url, downloadSections='*0-inf') {
  // yt-dlp scarica il miglior audio e lo passa a ffmpeg
  const ytdlp = spawn('yt-dlp', [
    '-f', 'bestaudio',
    '--download-sections', downloadSections,
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

  ffmpeg.stdin.on("error", () => {ffmpeg.kill("SIGKILL");});
  ffmpeg.stdout.on("error", () => {ffmpeg.kill("SIGKILL");});
  ffmpeg.on("error", () => {ffmpeg.kill("SIGKILL");});

  return createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw
  });
}

export function getAudioDuration(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", ["--get-duration", url]);

    let output = "";
    proc.stdout.on("data", d => output += d.toString());
    proc.stderr.on("data", d => console.error("[yt-dlp]", d.toString()));

    proc.on("close", () => {
      if (!output.trim()) return reject(0);
      resolve(durationToSeconds(output.trim()));
    });
  });
}

function durationToSeconds(str) {
  const parts = str.split(":").map(Number);

  if (parts.length === 3) {
    // HH:MM:SS
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }

  if (parts.length === 2) {
    // MM:SS
    const [m, s] = parts;
    return m * 60 + s;
  }

  // Just seconds
  return Number(str);
}
