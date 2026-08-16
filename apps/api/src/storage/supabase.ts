import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import type { ObjectStorage, StoredFile } from './types.js';

export class SupabaseObjectStorage implements ObjectStorage {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor() {
    this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
    this.bucket = config.supabaseBucket;
  }

  async put(options: {
    projectId: string;
    filename: string;
    body: Buffer;
    mimeType: string;
  }): Promise<StoredFile> {
    const filename = `${Date.now()}-${options.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storagePath = `${options.projectId}/${filename}`;
    const { error } = await this.client.storage.from(this.bucket).upload(storagePath, options.body, {
      contentType: options.mimeType,
      upsert: false,
    });
    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }
    const { data } = this.client.storage.from(this.bucket).getPublicUrl(storagePath);
    return {
      storagePath,
      publicUrl: data.publicUrl,
      bytes: options.body.byteLength,
    };
  }

  async putFromPath(options: {
    projectId: string;
    filename: string;
    filePath: string;
    mimeType: string;
  }): Promise<StoredFile> {
    const filename = `${Date.now()}-${options.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storagePath = `${options.projectId}/${filename}`;
    const info = await stat(options.filePath);
    const { error } = await this.client.storage.from(this.bucket).upload(storagePath, createReadStream(options.filePath), {
      contentType: options.mimeType,
      upsert: false,
      duplex: 'half',
    });
    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }
    const { data } = this.client.storage.from(this.bucket).getPublicUrl(storagePath);
    return {
      storagePath,
      publicUrl: data.publicUrl,
      bytes: info.size,
    };
  }

  async get(storagePath: string): Promise<{ body: Buffer; mimeType: string } | null> {
    const { data, error } = await this.client.storage.from(this.bucket).download(storagePath);
    if (error || !data) return null;
    return { body: Buffer.from(await data.arrayBuffer()), mimeType: data.type || 'application/octet-stream' };
  }

  async delete(storagePath: string): Promise<void> {
    await this.client.storage.from(this.bucket).remove([storagePath]);
  }
}
