/**
 * Plain values shared by the client's first screen and the contracts. Kept free of zod, so the
 * first load does not carry the validation library. The contracts re-export them.
 */
export const CONSENT_VERSION = 'pilot-2026-12-openrouter';
export const fileTypes = ['txt', 'md', 'pdf', 'docx', 'pptx'] as const;
