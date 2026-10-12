// Centralized helpers for private Supabase Storage access.
// Uses the shared browser client, so credentials stay in environment variables.
import { supabase } from './client';

/** Uploads a file into a private bucket and returns its storage path. */
export async function uploadPrivateFile(
  bucket: string,
  path: string,
  file: File | Blob,
  options?: { upsert?: boolean; contentType?: string },
): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: options?.upsert ?? true,
    ...(options?.contentType ? { contentType: options.contentType } : {}),
  });
  if (error) throw error;
  return path;
}

/** Time-limited link for a file in a private bucket (default 10 minutes). */
export async function getPrivateFileUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

/** Downloads a file from a private bucket as a Blob. */
export async function downloadPrivateFile(bucket: string, path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  return data;
}

/** Removes files from a private bucket. */
export async function removePrivateFiles(bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) throw error;
}
