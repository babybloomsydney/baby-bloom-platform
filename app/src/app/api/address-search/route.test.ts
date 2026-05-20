import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock global fetch BEFORE importing the route under test
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

async function callRoute(q: string | null) {
  const { GET } = await import("./route");
  const url =
    q === null
      ? "http://localhost/api/address-search"
      : `http://localhost/api/address-search?q=${encodeURIComponent(q)}`;
  const req = new NextRequest(url);
  return GET(req);
}

function photonFeature(
  props: Partial<{
    housenumber: string;
    street: string;
    suburb: string;
    city: string;
    district: string;
    state: string;
    postcode: string;
    countrycode: string;
    country: string;
    osm_id: number;
    osm_type: string;
  }>,
) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [151, -33] },
    properties: props,
  };
}

describe("GET /api/address-search", () => {
  it("returns [] when q is missing", async () => {
    const res = await callRoute(null);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] when q is shorter than 4 chars", async () => {
    const res = await callRoute("abc");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a full Photon address into the legacy AddressResult shape", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          features: [
            photonFeature({
              housenumber: "12",
              street: "George Street",
              suburb: "Sydney",
              state: "New South Wales",
              postcode: "2000",
              countrycode: "AU",
              osm_id: 999,
              osm_type: "N",
            }),
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const res = await callRoute("12 george street sydney");
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{
      sla: string;
      ssla?: string;
      pid: string;
      score: number;
    }>;
    expect(data).toHaveLength(1);
    expect(data[0].sla).toBe("12 GEORGE STREET, SYDNEY NSW 2000");
    // ssla matches sla so consumers using `r.ssla || r.sla` get the same legible form
    expect(data[0].ssla).toBe("12 GEORGE STREET, SYDNEY NSW 2000");
    // pid namespaces osm_id by osm_type to avoid cross-type collisions
    expect(data[0].pid).toBe("N/999");
    // first result keeps the highest score so consumers that sort on `score`
    // see Photon's relevance order intact
    expect(data[0].score).toBe(1);
  });

  it("filters out non-AU features", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          features: [
            photonFeature({
              housenumber: "5",
              street: "Foo Street",
              suburb: "London",
              state: "Greater London",
              postcode: "SW1A",
              countrycode: "GB",
            }),
            photonFeature({
              housenumber: "12",
              street: "George Street",
              suburb: "Sydney",
              state: "New South Wales",
              postcode: "2000",
              countrycode: "AU",
            }),
          ],
        }),
        { status: 200 },
      ),
    );

    const res = await callRoute("george street");
    const data = (await res.json()) as Array<{ sla: string }>;
    expect(data).toHaveLength(1);
    expect(data[0].sla).toContain(" NSW ");
  });

  it("falls back to `city` when both `suburb` and `district` are missing", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          features: [
            photonFeature({
              housenumber: "1",
              street: "Pitt Street",
              city: "Sydney",
              state: "New South Wales",
              postcode: "2000",
              countrycode: "AU",
            }),
          ],
        }),
        { status: 200 },
      ),
    );

    const res = await callRoute("1 pitt street sydney");
    const data = (await res.json()) as Array<{ sla: string }>;
    expect(data[0].sla).toBe("1 PITT STREET, SYDNEY NSW 2000");
  });

  it("prefers `district` over `city` for inner-Sydney addresses (T-035 regression fix)", async () => {
    // Photon's `city` field is the metro-area catch-all — for the Sydney
    // metro it's always "Sydney" regardless of the actual suburb. The actual
    // suburb name lives in `district`. Before this fix, the fallback order
    // `suburb ?? city ?? district` picked "Sydney" for every Potts Point /
    // Elizabeth Bay / Surry Hills / etc. address — overwriting users'
    // canonical suburb in `user_profiles` via the verification flow.
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          features: [
            photonFeature({
              housenumber: "5",
              street: "Bayswater Road",
              district: "Potts Point",
              city: "Sydney",
              state: "New South Wales",
              postcode: "2011",
              countrycode: "AU",
            }),
          ],
        }),
        { status: 200 },
      ),
    );

    const res = await callRoute("5 bayswater road potts point");
    const data = (await res.json()) as Array<{ sla: string }>;
    expect(data[0].sla).toBe("5 BAYSWATER ROAD, POTTS POINT NSW 2011");
  });

  it("uses `suburb` when present, even if `district` and `city` are also set", async () => {
    // `p.suburb` is rarely populated by Photon for AU data, but when it is
    // it's the most explicit signal — trust it over `district` (a coarser
    // neighbourhood field).
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          features: [
            photonFeature({
              housenumber: "12",
              street: "Some Street",
              suburb: "Specific Suburb",
              district: "Different District",
              city: "Sydney",
              state: "New South Wales",
              postcode: "2099",
              countrycode: "AU",
            }),
          ],
        }),
        { status: 200 },
      ),
    );

    const res = await callRoute("12 some street");
    const data = (await res.json()) as Array<{ sla: string }>;
    expect(data[0].sla).toBe("12 SOME STREET, SPECIFIC SUBURB NSW 2099");
  });

  it("drops features without a street, suburb, state, or postcode", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          features: [
            photonFeature({
              suburb: "Sydney",
              state: "New South Wales",
              postcode: "2000",
              countrycode: "AU",
            }), // no street
            photonFeature({
              street: "George Street",
              suburb: "Sydney",
              state: "New South Wales",
              countrycode: "AU",
            }), // no postcode
          ],
        }),
        { status: 200 },
      ),
    );

    const res = await callRoute("sydney");
    expect(await res.json()).toEqual([]);
  });

  it("omits housenumber when not present (street-only matches)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          features: [
            photonFeature({
              street: "George Street",
              suburb: "Sydney",
              state: "New South Wales",
              postcode: "2000",
              countrycode: "AU",
              osm_id: 42,
            }),
          ],
        }),
        { status: 200 },
      ),
    );

    const res = await callRoute("george street sydney");
    const data = (await res.json()) as Array<{ sla: string }>;
    expect(data[0].sla).toBe("GEORGE STREET, SYDNEY NSW 2000");
  });

  it("returns [] (not 5xx) when upstream errors so the UI degrades gracefully", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("upstream down", { status: 503 }),
    );
    const res = await callRoute("12 george street");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns [] when fetch throws (network error)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network unreachable"));
    const res = await callRoute("12 george street");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("splits '5/12 George St' into unit + base query and re-prepends the unit on every result", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          features: [
            photonFeature({
              housenumber: "12",
              street: "George Street",
              suburb: "Sydney",
              state: "New South Wales",
              postcode: "2000",
              countrycode: "AU",
              osm_id: 999,
              osm_type: "N",
            }),
          ],
        }),
        { status: 200 },
      ),
    );

    const res = await callRoute("5/12 George St");
    expect(res.status).toBe(200);
    // Upstream URL should have been called with the base query, not the
    // raw "5/12 George St" — Photon doesn't index AU flat-number syntax.
    const upstreamUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(upstreamUrl).toContain("q=12%20George%20St");
    expect(upstreamUrl).not.toContain("5%2F12");
    // The unit prefix is re-prepended to every result's SLA + PID.
    const data = (await res.json()) as Array<{ sla: string; pid: string }>;
    expect(data[0].sla).toBe("5/12 GEORGE STREET, SYDNEY NSW 2000");
    expect(data[0].pid).toBe("5/N/999");
  });

  it("splits 'Unit 5, 12 George St' into unit + base", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          features: [
            photonFeature({
              housenumber: "12",
              street: "George Street",
              suburb: "Sydney",
              state: "New South Wales",
              postcode: "2000",
              countrycode: "AU",
            }),
          ],
        }),
        { status: 200 },
      ),
    );

    await callRoute("Unit 5, 12 George St");
    const upstreamUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(upstreamUrl).toContain("q=12%20George%20St");
  });

  it("biases Photon search toward Sydney via lat/lon params", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ features: [] }), { status: 200 }),
    );
    await callRoute("12 george street");
    const upstreamUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(upstreamUrl).toContain("lat=-33.87");
    expect(upstreamUrl).toContain("lon=151.21");
    expect(upstreamUrl).toContain("limit=50");
  });
});
