import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import type { ObjectStorage, StoredFile } from './types.js';

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

export class LocalObjectStorage implements ObjectStorage {
  constructor(private readonly root = path.join(config.dataDir, 'storage')) {}

  async put(options: {
    projectId: string;
    filename: string;
    body: Buffer;
    mimeType: string;
  }): Promise<StoredFile> {
    const dir = path.join(this.root, safeSegment(options.projectId));
    await mkdir(dir, { recursive: true });
    const filename = `${Date.now()}-${safeSegment(options.filename)}`;
    const storagePath = path.join(options.projectId, filename);
    const abs = path.join(this.root, storagePath);
    if (!abs.startsWith(this.root)) {
      throw new Error('Invalid storage path.');
    }
    await writeFile(abs, options.body);
    return {
      storagePath,
      publicUrl: `${config.apiUrl}/api/files/${encodeURIComponent(storagePath)}`,
      bytes: options.body.byteLength,
    };
  }

  async get(storagePath: string): Promise<{ body: Buffer; mimeType: string } | null> {
    const abs = this.resolve(storagePath);
    if (!abs) return null;
    try {
      const body = await readFile(abs);
      return { body, mimeType: guessMime(storagePath) };
    } catch {
      return null;
    }
  }

  async delete(storagePath: string): Promise<void> {
    const abs = this.resolve(storagePath);
    if (!abs) return;
    await unlink(abs).catch(() => undefined);
  }

  resolve(storagePath: string): string | null {
    const abs = path.resolve(this.root, storagePath);
    if (!abs.startsWith(path.resolve(this.root))) return null;
    return abs;
  }
}

function guessMime(storagePath: string): string {
  const ext = path.extname(storagePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.mp4') return 'video/mp4';
  return 'application/octet-stream';
}
