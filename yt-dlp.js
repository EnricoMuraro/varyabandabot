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

export function getAudioInfo(url) {
  return new Promise((resolve, reject) => {
    // Use yt-dlp's JSON dump which includes duration and any heatmap data
    const proc = spawn('yt-dlp', ['--dump-single-json', url]);

    let out = '';

    proc.stdout.on('data', d => { out += d.toString(); });

    proc.stderr.on('data', d => { console.error('[yt-dlp]', d.toString()); });

    proc.on('close', () => {
      if (!out.trim()) return reject('No output from yt-dlp');

      try {
        const json = JSON.parse(out);

        // duration is usually provided in seconds
        const durationSeconds = typeof json.duration === 'number' ? json.duration : (json.duration ? durationToSeconds(String(json.duration)) : null);

        // heatmap may appear as json.heatmap or inside chapters
        let heatmap = json.heatmap || null;

        if ((!heatmap || !heatmap.length) && Array.isArray(json.chapters)) {
          // collect chapter-level heatmaps (flatten)
          const collected = json.chapters.flatMap(c => (c.heatmap && Array.isArray(c.heatmap)) ? c.heatmap : []);
          heatmap = collected.length ? collected : heatmap;
        }

        let mostReplayed = null;
        if (heatmap && Array.isArray(heatmap) && heatmap.length) {
          //remove the first two entries to ignore intro spikes
          const best = heatmap.slice(2).reduce((a, b) => (a.value > b.value ? a : b));
          mostReplayed = best.start_time ?? null;
        }
        
        console.log('Extracted audio info:', { durationSeconds, heatmap, mostReplayed });

        resolve({
          duration: durationSeconds,
          heatmap: heatmap || null,
          mostReplayed
        });
      } catch (e) {
        reject(e);
      }
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
