// Cursor-paginated fetch to get ALL rows past the platform's 500-row page cap
// (P9-9). The entity store caps a single filter() at 500 rows; group-level
// GamePlayer queries silently truncate at ~55 settled games without this.
// $lte cursor on created_date + a seen-set handles rows that share a timestamp
// (bulkCreate writes a whole roster with one created_date). Mirrors the
// server-side loop in computeGlobalStats (P2-5).
export async function fetchAllByCursor(entity, baseQuery = {}, pageSize = 500) {
  const all = [];
  const seen = new Set();
  let cursor = null;
  // Hard safety cap: 40 pages = 20k rows, far beyond any real group
  for (let guard = 0; guard < 40; guard++) {
    const query = cursor ? { ...baseQuery, created_date: { $lte: cursor } } : baseQuery;
    const page = await entity.filter(query, '-created_date', pageSize);
    const fresh = page.filter(r => !seen.has(r.id));
    fresh.forEach(r => { seen.add(r.id); all.push(r); });
    if (page.length < pageSize || fresh.length === 0) break;
    cursor = page[page.length - 1].created_date;
  }
  return all;
}
