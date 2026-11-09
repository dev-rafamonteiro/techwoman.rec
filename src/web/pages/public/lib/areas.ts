import { KNOWLEDGE_TRACKS } from '@tw/shared';

/** Fallback das áreas quando E01 não as traz. */
export const FALLBACK_AREAS = KNOWLEDGE_TRACKS.map(({ key, label }) => ({ key, label }));
