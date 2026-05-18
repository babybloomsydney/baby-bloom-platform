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

  try {
    const upstream = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=en&limit=20`,
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

    const results = data.features
      .filter((f) => f.properties?.countrycode === "AU")
      .map(mapToAddressResult)
      .filter((r): r is AddressResult => r !== null);

    return NextResponse.json(results);
  } catch (err) {
    console.error("[address-search] fetch failed", err);
    return NextResponse.json([]);
  }
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
): AddressResult | null {
  const p = f.properties;
  if (!p) return null;

  const street = (p.street ?? "").trim().toUpperCase();
  const suburb = (p.suburb ?? p.city ?? p.district ?? "").trim().toUpperCase();
  const stateAbbr = stateToAbbr(p.state ?? "");
  const postcode = (p.postcode ?? "").trim();

  if (!street || !suburb || !stateAbbr || !postcode) return null;

  const housePrefix = p.housenumber ? `${p.housenumber.trim()} ` : "";
  const sla = `${housePrefix}${street}, ${suburb} ${stateAbbr} ${postcode}`;

  // `osm_id` is scoped per feature type in OSM (a node + way + relation can
  // share an integer id), so include `osm_type` to keep `pid` collision-free.
  const pid = p.osm_id !== undefined ? `${p.osm_type ?? "?"}/${p.osm_id}` : sla;

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
