import type { D1Database } from '@cloudflare/workers-types';
import {
  UPDATE_BODY_LENGTH, UPDATE_IMAGE_COUNT, UPDATE_IMAGE_LIMIT, UPDATE_TITLE_LENGTH,
  type SiteUpdate, type UpdateContent, type UpdateDraft, type UpdateImage, type UpdateListItem,
} from './types';

interface Row {
  id: string;
  revision: number;
  publishedAt: number | null;
  payload: string;
}

const fields = 'id, revision, published_at AS publishedAt, payload';
export const validUpdateId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9-]{1,80}$/.test(value);

export function readImageData(src: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(src);
  if (!match || match[2].length > 4 * Math.ceil(UPDATE_IMAGE_LIMIT / 3)) return null;
  const [, mime, encoded] = match;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > UPDATE_IMAGE_LIMIT || bytes.toString('base64') !== encoded) return null;
  const valid = mime === 'image/png' ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
    : mime === 'image/jpeg' ? bytes.subarray(0, 3).toString('hex') === 'ffd8ff'
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return valid ? { mime, bytes } : null;
}

function parseImage(value: unknown): UpdateImage {
  if (!value || typeof value !== 'object') throw new Error('Choose an image.');
  const { src, alt, device } = value as Partial<UpdateImage>;
  if (typeof alt !== 'string' || !alt.trim() || alt.length > 180) throw new Error('Describe each image in 180 characters or fewer.');
  if (device !== 'all' && device !== 'desktop' && device !== 'mobile') throw new Error('Choose an image display option.');
  if (typeof src !== 'string' || src.length > 4 * Math.ceil(UPDATE_IMAGE_LIMIT / 3) + 30 ||
      (!/^\/site-updates\/[a-z0-9-]+\.(?:png|webp|jpg)$/.test(src) && !readImageData(src))) {
    throw new Error('Choose a PNG, JPEG, or WebP image up to 300 KiB.');
  }
  return { src, alt: alt.trim(), device };
}

export function parseUpdate(value: unknown): UpdateContent {
  if (!value || typeof value !== 'object') throw new Error('Enter an update.');
  const { title, body, major, images } = value as Partial<UpdateContent>;
  if (typeof title !== 'string' || !title.trim() || title.length > UPDATE_TITLE_LENGTH) throw new Error('Enter a title of 1–100 characters.');
  if (typeof body !== 'string' || !body.trim() || body.length > UPDATE_BODY_LENGTH) throw new Error('Enter update notes of 1–2,400 characters.');
  if (typeof major !== 'boolean' || !Array.isArray(images) || images.length > UPDATE_IMAGE_COUNT) throw new Error('Check the update options and images.');
  return { title: title.trim(), body: body.trim(), major, images: images.map(parseImage) };
}

function draft(row: Row): UpdateDraft {
  const { payload, ...meta } = row;
  return { ...JSON.parse(payload) as UpdateContent, ...meta };
}

export async function listDrafts(db: D1Database): Promise<UpdateListItem[]> {
  const { results } = await db.prepare(`SELECT id, json_extract(payload, '$.title') AS title, published_at AS publishedAt
    FROM site_updates ORDER BY published_at IS NOT NULL, updated_at DESC, id`).all<UpdateListItem>();
  return results;
}

export async function readDraft(db: D1Database, id: string) {
  const row = await db.prepare(`SELECT ${fields} FROM site_updates WHERE id = ?`).bind(id).first<Row>();
  return row ? draft(row) : null;
}

export async function saveDraft(db: D1Database, id: string | null, revision: number, payload: UpdateContent, actor: string) {
  const now = Date.now();
  if (id === null) {
    return db.prepare(`INSERT INTO site_updates (id, payload, major, revision, updated_at, actor)
      VALUES (?, ?, ?, 1, ?, ?) RETURNING id`).bind(crypto.randomUUID(), JSON.stringify(payload), Number(payload.major), now, actor)
      .first<{ id: string }>();
  }
  return db.prepare(`UPDATE site_updates SET payload = ?, major = ?, revision = revision + 1, updated_at = ?, actor = ?
    WHERE id = ? AND revision = ? AND published_at IS NULL RETURNING id`)
    .bind(JSON.stringify(payload), Number(payload.major), now, actor, id, revision).first<{ id: string }>();
}

export async function publishDraft(db: D1Database, id: string, revision: number, actor: string) {
  const now = Date.now();
  return db.prepare(`UPDATE site_updates SET published_at = ?, updated_at = ?, revision = revision + 1, actor = ?
    WHERE id = ? AND revision = ? AND published_at IS NULL RETURNING id`)
    .bind(now, now, actor, id, revision).first<{ id: string }>();
}

export async function readPublishedUpdates(db: D1Database, latestMajor: boolean): Promise<SiteUpdate[]> {
  const { results } = await db.prepare(`SELECT id, published_at AS publishedAt,
    json_remove(payload, '$.images') AS details,
    (SELECT json_group_array(json_object(
      'src', CASE WHEN json_extract(value, '$.src') LIKE 'data:%'
        THEN '/api/site-updates?id=' || updates.id || '&image=' || key ELSE json_extract(value, '$.src') END,
      'alt', json_extract(value, '$.alt'), 'device', json_extract(value, '$.device')
    )) FROM json_each(payload, '$.images')) AS images
    FROM site_updates AS updates WHERE published_at IS NOT NULL ${latestMajor ? 'AND major = 1' : ''}
    ORDER BY published_at DESC, id DESC ${latestMajor ? 'LIMIT 1' : ''}`)
    .all<{ id: string; publishedAt: number; details: string; images: string }>();
  return results.map(({ id, publishedAt, details, images }) => ({
    ...JSON.parse(details) as Omit<UpdateContent, 'images'>, id, publishedAt,
    images: JSON.parse(images) as UpdateImage[],
  }));
}

export async function readPublishedImage(db: D1Database, id: string, index: number) {
  const src = await db.prepare(`SELECT json_extract(payload, ?) AS src FROM site_updates
    WHERE id = ? AND published_at IS NOT NULL`).bind(`$.images[${index}].src`, id).first<string>('src');
  return src ? readImageData(src) : null;
}
