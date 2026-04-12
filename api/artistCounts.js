const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbzHuV4RXTbN5hy_tX7CEukt_r1fndTnuDRrKaiOd67n0PdtvISL2vwfddhcWKxGY5M8iw/exec";

// Utility to normalize keys
function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Field definitions for strict schema enforcement (all columns from artistCounts)
const FIELD_DEFS = [
  { key: 'artist', normalize: 'artist', required: true },
  { key: 'count', normalize: 'count', required: false },
  { key: 'imageUrl', normalize: 'imageurl', required: false },
  { key: 'spotifyUrl', normalize: 'spotifyurl', required: false },
  { key: 'genres', normalize: 'genres', required: false },
];

// Utility to extract rows from payload
function getRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.artistCounts)) {
    const arr = payload.artistCounts;
    // If first element is an array, treat as [headers, ...rows]
    if (arr.length > 1 && Array.isArray(arr[0])) {
      const headers = arr[0].map(h => String(h).trim());
      const objects = arr.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
      });
      // Debug: print headers and first parsed row
      if (objects.length > 0) {
        console.log('[artistCounts] artistCounts headers:', headers);
        console.log('[artistCounts] first parsed row:', objects[0]);
      }
      return objects;
    }
    // Otherwise, assume array of objects
    return arr;
  }
  return [];
}

// Utility to pick value by loose key match
function pickLooseValue(row, predicate) {
  const entries = Object.entries(row || {});
  for (let i = 0; i < entries.length; i += 1) {
    const [key, raw] = entries[i];
    const value = String(raw ?? "").trim();
    if (!value) continue;
    if (predicate(normalizeKey(key))) return value;
  }
  return "";
}

// Sanitize a row from Artist Counts sheet using FIELD_DEFS
function sanitizeArtistCountsRow(row) {
  const result = {};
  for (const def of FIELD_DEFS) {
    let value = '';
    for (const [key, v] of Object.entries(row || {})) {
      if (normalizeKey(key) === def.normalize) {
        value = String(v).trim();
        break;
      }
    }
    // Fallback: loose match if not found
    if (!value && def.required) {
      for (const [key, v] of Object.entries(row || {})) {
        if (normalizeKey(key).includes(def.normalize)) {
          value = String(v).trim();
          break;
        }
      }
    }
    // Type conversion for count
    if (def.key === 'count') {
      value = Number(value) || 0;
    }
    result[def.key] = value;
  }
  return result;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");


  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }


  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  // Fetch from Artist Counts sheet
  try {
    const upstreamResponse = await fetch(`${APPS_SCRIPT_URL}?sheet=Artist%20Counts&t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!upstreamResponse.ok) {
      throw new Error(`Upstream request failed with HTTP ${upstreamResponse.status}`);
    }
    const payload = await upstreamResponse.json();
    console.log('[artistCounts] Raw payload:', JSON.stringify(payload).slice(0, 1000));
    const rawRows = getRows(payload);
    console.log('[artistCounts] getRows count:', rawRows.length);
    if (rawRows.length > 0) {
      console.log('[artistCounts] first raw row:', rawRows[0]);
    }
    const rows = rawRows.map(sanitizeArtistCountsRow);
    if (rows.length > 0) {
      console.log('[artistCounts] first sanitized row:', rows[0]);
    }
    console.log('[artistCounts] sanitized rows count:', rows.length);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      count: rows.length,
      refreshedAt: new Date().toISOString(),
      rows,
    }));
  } catch (error) {
    console.error("[artistCounts]", error);
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      error: "Failed to fetch Artist Counts data.",
      details: error.message,
    }));
  }
};
