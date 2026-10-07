/** Render only citations checked against the supplied source list. */
export function renderCitations(text: string, citations: string[]): string {
  return text.replace(/\[\[([^\]\s]{1,200})\]\]/g, (_match, id: string) => {
    const index = citations.indexOf(id);
    return index >= 0 ? `[${index + 1}]` : '';
  }).replace(/\[\[[^\]]*$/, '');
}
