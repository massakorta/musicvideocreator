import { supabaseConfigured } from '../config.js';
import { LocalObjectStorage } from './local.js';
import { SupabaseObjectStorage } from './supabase.js';
import type { ObjectStorage } from './types.js';

let singleton: ObjectStorage | undefined;

export function getObjectStorage(): ObjectStorage {
  if (!singleton) {
    singleton = supabaseConfigured() ? new SupabaseObjectStorage() : new LocalObjectStorage();
  }
  return singleton;
}

export type { ObjectStorage } from './types.js';
