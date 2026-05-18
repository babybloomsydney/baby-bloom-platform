import { NextRequest, NextResponse } from "next/server";

// Photon (OpenStreetMap-backed geocoder, hosted by Komoot) replaces the
// previous `api.addressr.io` upstream, which began rejecting our serverless
// IPs ("no-origin not permitted from <ip>") and effectively blocked signup
// + verification flows. Photon is free, key-free, AU-supported, and has
// reasonable terms. We adapt the response into the legacy `AddressResult`
// shape (`sla` legible all-caps line + `ssla` + `pid` + `score`) that the
// existing consumers parse via `parseGnafAddress`.

interface PhotonFeature {
  properties?: {
    housenumber?: string;
    street?: string;
    suburb?: string;
    city?: string;
    district?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countrycode?: string;
    osm_id?: number;
    osm_type?: string;
  };
}

interface AddressResult {
  sla: string;
  ssla?: string;
  pid: string;
  score: number;
}

const STATE_ABBR = {
  "new south wales": "NSW",
  victoria: "VIC",
  queensland: "QLD",
  "south australia": "SA",
  "western australia": "WA",
  tasmania: "TAS",
  "northern territory": "NT",
  "australian capital territory": "ACT",
} as const satisfies Record<string, string>;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 4) {
    return NextResponse.json([]);
  }

  // AU users commonly type unit/flat numbers as "5/12 George St" or
  // "Unit 5, 12 George St". Photon's OSM-backed dataset rarely indexes the
  // unit segment, so we split it off before querying and stitch it back
  // onto every result's SLA. Without this preprocessing, "5/12 george" gets
  // sent verbatim to Photon and matches nothing.
  const { unit, baseQuery } = splitUnitPrefix(q);

  try {
    // Bias toward Sydney (lat/lon) so AU/NSW results rank higher and
    // appear in the first page of `limit=50`. Photon ranks results by a
    // mix of importance + proximity to the supplied lat/lon.
    const upstream = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(baseQuery)}` +
        `&lang=en&limit=50&lat=-33.87&lon=151.21`,
      {
        headers: {
          // No PII in this UA — third-party access logs would otherwise
          // accumulate the admin contact email indefinitely.
          "User-Agent":
            "babybloom-address-search/1.0 (+https://babybloomsydney.com.au)",
        },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!upstream.ok) {
      console.warn(
        `[address-search] upstream ${upstream.status} ${upstream.statusText}`,
      );
      return NextResponse.json([]);
    }

    const data: unknown = await upstream.json();
    if (!isPhotonResponse(data)) {
      console.warn("[address-search] upstream returned unexpected shape");
      return NextResponse.json([]);
    }

    const auFeatures = data.features.filter(
      (f) => f.properties?.countrycode === "AU",
    );
    const results = auFeatures
      .map((f, i) => mapToAddressResult(f, i, auFeatures, unit))
      .filter((r): r is AddressResult => r !== null);

    return NextResponse.json(results);
  } catch (err) {
    console.error("[address-search] fetch failed", err);
    return NextResponse.json([]);
  }
}

/**
 * Strips an AU-style unit/flat prefix from a free-text address query so the
 * remaining street-level portion can be sent to Photon, then returns the
 * prefix in canonical "X/" form to be re-prepended to every result.
 *
 * Recognised patterns (case-insensitive):
 *   "5/12 George St"          → unit "5/",  base "12 George St"
 *   "5a/12 George St"         → unit "5A/", base "12 George St"
 *   "Unit 5, 12 George St"    → unit "5/",  base "12 George St"
 *   "Flat 5 12 George St"     → unit "5/",  base "12 George St"
 *   "Apt 5 - 12 George St"    → unit "5/",  base "12 George St"
 *
 * Otherwise returns the query unchanged with an empty unit.
 */
function splitUnitPrefix(q: string): { unit: string; baseQuery: string } {
  const trimmed = q.trim();

  // "5/12 George St" form
  const slashMatch = trimmed.match(/^(\d+[a-zA-Z]?)\s*\/\s*(\d+.*)$/);
  if (slashMatch) {
    return {
      unit: `${slashMatch[1].toUpperCase()}/`,
      baseQuery: slashMatch[2].trim(),
    };
  }

  // "Unit 5, 12 George St" / "Flat 5, 12 George St" / "Apt 5 12 George St" form
  const wordMatch = trimmed.match(
    /^(?:unit|flat|apt|apartment)\s+(\d+[a-zA-Z]?)\s*[,\-/]?\s*(\d+.*)$/i,
  );
  if (wordMatch) {
    return {
      unit: `${wordMatch[1].toUpperCase()}/`,
      baseQuery: wordMatch[2].trim(),
    };
  }

  return { unit: "", baseQuery: trimmed };
}

function isPhotonResponse(d: unknown): d is { features: PhotonFeature[] } {
  if (!d || typeof d !== "object") return false;
  const obj = d as Record<string, unknown>;
  return Array.isArray(obj.features);
}

function mapToAddressResult(
  f: PhotonFeature,
  index: number,
  all: ReadonlyArray<PhotonFeature>,
  unit: string,
): AddressResult | null {
  const p = f.properties;
  if (!p) return null;

  const street = (p.street ?? "").trim().toUpperCase();
  const suburb = (p.suburb ?? p.city ?? p.district ?? "").trim().toUpperCase();
  const stateAbbr = stateToAbbr(p.state ?? "");
  const postcode = (p.postcode ?? "").trim();

  if (!street || !suburb || !stateAbbr || !postcode) return null;

  // `unit` is "5/" or "" — Photon doesn't typically index unit-level data so
  // we pre-stripped it from the query (see splitUnitPrefix) and we paste it
  // back here as a literal prefix on the street segment.
  const housePrefix = p.housenumber
    ? `${unit}${p.housenumber.trim()} `
    : unit
      ? `${unit}`
      : "";
  const sla = `${housePrefix}${street}, ${suburb} ${stateAbbr} ${postcode}`;

  // `osm_id` is scoped per feature type in OSM (a node + way + relation can
  // share an integer id), so include `osm_type` to keep `pid` collision-free.
  // Unit is also part of the identity — two flats at the same street have
  // distinct `pid`s.
  const pid =
    p.osm_id !== undefined ? `${unit}${p.osm_type ?? "?"}/${p.osm_id}` : sla;

  return {
    sla,
    ssla: sla,
    pid,
    // Preserve Photon's upstream ordering by emitting a descending score so
    // consumers that sort on `score` still see the best match first.
    score: all.length - index,
  };
}

function stateToAbbr(state: string): string {
  const lower = state.toLowerCase().trim();
  // `STATE_ABBR` is `as const` so values stay narrow, but TS doesn't widen
  // its key set to `string` — we cast at the lookup boundary to keep the
  // immutability intent intact while still indexing by an arbitrary input.
  return (STATE_ABBR as Record<string, string>)[lower] ?? "";
}
