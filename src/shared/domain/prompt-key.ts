/** Preserve letters, combining marks and numbers in every writing system. */
export function promptKey(prompt: string): string {
  return prompt.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}
