/**
 * How many questions each section gets. Weight decides the share, by largest remainder, and no
 * single material takes more than its cap when the scope spans several, so a long reading never
 * crowds out a short one an assessment also covers.
 */
export function allot<T extends { materialId: string }>(sections: { section: T; weight: number }[], count: number): { section: T; count: number }[] {
  if (!sections.length || count <= 0) return [];
  const materials = new Set(sections.map(s => s.section.materialId)).size;
  const cap = materials >= 3 ? Math.ceil(count * 0.4) : materials === 2 ? Math.ceil(count * 0.6) : count;
  const total = sections.reduce((n, s) => n + s.weight, 0) || 1;
  const out = sections.map(s => ({ section: s.section, count: Math.floor((s.weight / total) * count), rest: ((s.weight / total) * count) % 1 }));
  const used = (materialId: string) => out.filter(o => o.section.materialId === materialId).reduce((n, o) => n + o.count, 0);
  // Trim any material over its cap, then hand out what is left by remainder, then round-robin.
  for (const o of [...out].sort((a, b) => a.rest - b.rest)) while (used(o.section.materialId) > cap && o.count > 0) o.count--;
  let left = count - out.reduce((n, o) => n + o.count, 0);
  for (const o of [...out].sort((a, b) => b.rest - a.rest)) { if (left <= 0) break; if (used(o.section.materialId) < cap) { o.count++; left--; } }
  for (let guard = 0; left > 0 && guard < count * sections.length; guard++) {
    const o = out[guard % out.length]!;
    if (used(o.section.materialId) < cap || materials === 1) { o.count++; left--; }
  }
  // Every material over its cap and questions still to place: the cap gives way rather than the count.
  for (let i = 0; left > 0; i++, left--) out[i % out.length]!.count++;
  return out.filter(o => o.count > 0).map(({ section, count }) => ({ section, count }));
}

/** Formats spread over a section's questions in turn, so a mixed set is mixed in every section. */
export function spreadFormats<F>(formats: F[], count: number, offset: number): F[] {
  return Array.from({ length: count }, (_, i) => formats[(i + offset) % formats.length]!);
}
