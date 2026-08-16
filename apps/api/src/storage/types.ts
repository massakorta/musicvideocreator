export interface StoredFile {
  storagePath: string;
  publicUrl: string;
  bytes: number;
}

export interface ObjectStorage {
  put(options: {
    projectId: string;
    filename: string;
    body: Buffer;
    mimeType: string;
  }): Promise<StoredFile>;
  putFromPath(options: {
    projectId: string;
    filename: string;
    filePath: string;
    mimeType: string;
  }): Promise<StoredFile>;
  get(storagePath: string): Promise<{ body: Buffer; mimeType: string } | null>;
  delete(storagePath: string): Promise<void>;
}
