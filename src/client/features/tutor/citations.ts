/** Render `[[n]]` markers as `[n]` when n names one of the saved citations. */
export function renderCitations(text: string, count: number): string {
  return text
    .replace(/\[\[(\d{1,3})\]\]/g, (_match, n: string) => {
      const index = Number(n);
      return index >= 1 && index <= count ? `[${index}]` : '';
    })
    .replace(/\[\[[^\]]*$/, '');
}
