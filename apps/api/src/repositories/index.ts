import { supabaseConfigured } from '../config.js';
import { createFileRepositories } from './fileRepository.js';
import { createSupabaseRepositories } from './supabaseRepository.js';
import type { Repositories } from './types.js';

let repos: Repositories | undefined;

export function getRepositories(): Repositories {
  if (!repos) {
    repos = supabaseConfigured() ? createSupabaseRepositories() : createFileRepositories();
  }
  return repos;
}

export type { Repositories } from './types.js';
