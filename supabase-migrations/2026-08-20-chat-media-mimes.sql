-- Widen chat-media MIME allowlist. Safe to re-run.
-- iPhone sends audio/mp4, audio/x-m4a, image/heic; Android sends webm.

update storage.buckets
set allowed_mime_types = array[
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
  'audio/x-wav', 'audio/aac', 'audio/x-m4a',
  'video/webm', 'video/mp4', 'video/quicktime',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif'
],
file_size_limit = 41943040
where id = 'chat-media';
