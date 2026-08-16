import { AppError, ERROR_CODES } from '@music-video/shared';
import { config } from '../config.js';

const SUNO_HOSTS = new Set(['suno.com', 'www.suno.com']);
const SUNO_CDN_HOSTS = new Set(['cdn1.suno.ai', 'cdn2.suno.ai']);
const SONG_UUID_RE = /\/song\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

export interface SunoImportResult {
  buffer: Buffer;
  songId: string;
  title: string;
  filename: string;
  resolvedUrl: string;
  sunoUrl: string;
}

function assertAllowedHost(hostname: string, allowed: Set<string>, message: string): void {
  if (!allowed.has(hostname.toLowerCase())) {
    throw new AppError(ERROR_CODES.VALIDATION, message, 400);
  }
}

export function normalizeSunoInput(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Paste a Suno link (suno.com/s/… or suno.com/song/…).', 400);
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new AppError(ERROR_CODES.VALIDATION, 'That does not look like a valid Suno link.', 400);
  }
  if (url.protocol !== 'https:') {
    throw new AppError(ERROR_CODES.VALIDATION, 'Suno links must use https.', 400);
  }
  assertAllowedHost(url.hostname, SUNO_HOSTS, 'Paste a Suno link (suno.com/s/… or suno.com/song/…).');
  const path = url.pathname.toLowerCase();
  if (!path.startsWith('/s/') && !path.startsWith('/song/')) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Use a Suno share link: suno.com/s/… or suno.com/song/…', 400);
  }
  return url;
}

function parseTitleFromHtml(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const captured = match?.[1];
  if (!captured) return undefined;
  const raw = captured.trim();
  const beforeBy = raw.split(/\s+by\s+/i)[0]?.trim() ?? raw;
  const beforePipe = beforeBy.split('|')[0]?.trim();
  return beforePipe || undefined;
}

function sanitizeSunoFilename(title: string, songId: string): string {
  const stem = title
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `${stem || songId}.mp3`;
}

function isMpegBuffer(buffer: Buffer): boolean {
  if (buffer.length < 3) return false;
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return true;
  for (let i = 0; i < Math.min(buffer.length - 1, 4096); i++) {
    const next = buffer[i + 1];
    if (buffer[i] === 0xff && next !== undefined && (next & 0xe0) === 0xe0) return true;
  }
  return false;
}

async function fetchWithHostLock(
  startUrl: URL,
  allowedHosts: Set<string>,
  init: RequestInit = {},
): Promise<{ response: Response; finalUrl: URL }> {
  let current = startUrl;
  let redirects = 0;

  while (true) {
    assertAllowedHost(
      current.hostname,
      allowedHosts,
      allowedHosts === SUNO_HOSTS
        ? 'That Suno link redirected somewhere unexpected.'
        : 'Suno audio came from an unexpected location.',
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(current.toString(), {
        ...init,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'MusicVideoCreator/1.0 (Suno import)',
          Accept: init.method === 'HEAD' ? '*/*' : 'text/html,application/xhtml+xml,audio/mpeg,*/*',
          ...(init.headers ?? {}),
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new AppError(ERROR_CODES.VALIDATION, 'Could not resolve that Suno link.', 400);
        }
        redirects += 1;
        if (redirects > MAX_REDIRECTS) {
          throw new AppError(ERROR_CODES.VALIDATION, 'That Suno link had too many redirects.', 400);
        }
        current = new URL(location, current);
        continue;
      }

      return { response, finalUrl: current };
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AppError(
          ERROR_CODES.VALIDATION,
          'Suno did not respond in time. Try again or upload the MP3.',
          408,
        );
      }
      throw new AppError(ERROR_CODES.VALIDATION, 'Could not reach Suno. Check the link or upload the MP3.', 502);
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function resolveSongPage(startUrl: URL): Promise<{ songId: string; resolvedUrl: string; title?: string }> {
  const directMatch = startUrl.pathname.match(SONG_UUID_RE);
  if (directMatch?.[1]) {
    const songId = directMatch[1];
    const { response, finalUrl } = await fetchWithHostLock(startUrl, SUNO_HOSTS);
    if (!response.ok) {
      throw new AppError(
        ERROR_CODES.NOT_FOUND,
        response.status === 404 ? 'That Suno song was not found.' : 'Could not open that Suno link.',
        response.status === 404 ? 404 : 502,
      );
    }
    const html = await response.text();
    return {
      songId,
      resolvedUrl: finalUrl.toString(),
      title: parseTitleFromHtml(html),
    };
  }

  const { response, finalUrl } = await fetchWithHostLock(startUrl, SUNO_HOSTS);
  if (!response.ok) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      response.status === 404 ? 'That Suno song was not found.' : 'Could not open that Suno link.',
      response.status === 404 ? 404 : 502,
    );
  }

  const finalMatch = finalUrl.pathname.match(SONG_UUID_RE);
  const songId = finalMatch?.[1];
  if (!songId) {
    throw new AppError(
      ERROR_CODES.VALIDATION,
      'Could not find a song on that Suno link. Try the full suno.com/song/… URL.',
      400,
    );
  }

  const html = await response.text();
  return {
    songId,
    resolvedUrl: finalUrl.toString(),
    title: parseTitleFromHtml(html),
  };
}

async function downloadCdnMp3(songId: string): Promise<Buffer> {
  const cdnUrl = new URL(`https://cdn1.suno.ai/${songId}.mp3`);
  const maxBytes = config.maxAudioMb * 1024 * 1024;
  const { response } = await fetchWithHostLock(cdnUrl, SUNO_CDN_HOSTS);

  if (response.status === 403 || response.status === 404) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      'That Suno song is private or unavailable. Upload the MP3 instead.',
      404,
    );
  }
  if (!response.ok) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Could not download the song from Suno.', 502);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType && !contentType.includes('audio') && !contentType.includes('mpeg') && contentType !== 'application/octet-stream') {
    throw new AppError(ERROR_CODES.AUDIO_TYPE, 'Suno did not return an MP3 for that link.', 400);
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new AppError(
      ERROR_CODES.AUDIO_TOO_LARGE,
      `Audio must be ${config.maxAudioMb} MB or smaller.`,
      413,
    );
  }

  if (!response.body) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Could not download the song from Suno.', 502);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      throw new AppError(
        ERROR_CODES.AUDIO_TOO_LARGE,
        `Audio must be ${config.maxAudioMb} MB or smaller.`,
        413,
      );
    }
    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  if (buffer.byteLength === 0) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Suno returned an empty audio file.', 400);
  }
  if (!isMpegBuffer(buffer)) {
    throw new AppError(ERROR_CODES.AUDIO_TYPE, 'Suno did not return a valid MP3 for that link.', 400);
  }
  return buffer;
}

export async function importSunoTrack(inputUrl: string): Promise<SunoImportResult> {
  const startUrl = normalizeSunoInput(inputUrl);
  const { songId, resolvedUrl, title } = await resolveSongPage(startUrl);
  const buffer = await downloadCdnMp3(songId);
  const safeTitle = title ?? songId;
  return {
    buffer,
    songId,
    title: safeTitle,
    filename: sanitizeSunoFilename(safeTitle, songId),
    resolvedUrl,
    sunoUrl: startUrl.toString(),
  };
}
