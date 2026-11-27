export const UPDATE_IMAGE_LIMIT = 300 * 1024;
export const UPDATE_IMAGE_COUNT = 2;
export const UPDATE_TITLE_LENGTH = 100;
export const UPDATE_BODY_LENGTH = 2400;

export interface UpdateImage {
  src: string;
  alt: string;
  device: 'all' | 'desktop' | 'mobile';
}

export interface UpdateContent {
  title: string;
  body: string;
  major: boolean;
  images: UpdateImage[];
}

export interface SiteUpdate extends UpdateContent {
  id: string;
  publishedAt: number;
}

export interface UpdateDraft extends UpdateContent {
  id: string;
  revision: number;
  publishedAt: number | null;
}

export type UpdateListItem = Pick<UpdateDraft, 'id' | 'title' | 'publishedAt'>;
