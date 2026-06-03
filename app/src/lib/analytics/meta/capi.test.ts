/**
 * Server-side Conversions API helper — the source of truth for identity +
 * money events. Must (1) hash PII, never send raw; (2) no-op gracefully
 * when unconfigured; (3) NEVER throw — a Meta outage must not break
 * signup / position creation / checkout (AC5).
 *
 * Spec: system/FB/Plan/01-A-pixel-setup-build-plan.md (A2 + AC5).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { sendMetaEvent } from "./capi";
import { META_EVENTS } from "./events";

const PIXEL_ID = "1685470129252856";
const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

function mockFetchOk() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ events_received: 1 }),
    text: async () => "{}",
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_META_PIXEL_ID = PIXEL_ID;
  process.env.META_CAPI_ACCESS_TOKEN = "test-capi-token";
  delete process.env.META_GRAPH_API_VERSION;
  delete process.env.META_TEST_EVENT_CODE;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
  delete process.env.META_CAPI_ACCESS_TOKEN;
});

describe("sendMetaEvent", () => {
  it("posts to the Graph API with pixel id + version in the URL", async () => {
    const fetchMock = mockFetchOk();
    const res = await sendMetaEvent({
      eventName: META_EVENTS.completeRegistration,
      eventId: "evt-1",
      eventTime: 1000,
      userData: { email: "parent@example.com" },
      customData: { content_category: "parent" },
    });
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("graph.facebook.com");
    expect(url).toContain(`/${PIXEL_ID}/events`);
    expect(url).not.toContain("access_token");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-capi-token");
  });

  it("hashes PII — the raw email never appears in the request body", async () => {
    const fetchMock = mockFetchOk();
    await sendMetaEvent({
      eventName: META_EVENTS.completeRegistration,
      eventId: "evt-2",
      eventTime: 1000,
      userData: { email: "secret@example.com" },
    });
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).not.toContain("secret@example.com");
    expect(body).toContain(sha256Hex("secret@example.com"));
  });

  it("defaults action_source to 'website' and carries event_id + event_time", async () => {
    const fetchMock = mockFetchOk();
    await sendMetaEvent({
      eventName: META_EVENTS.submitApplication,
      eventId: "evt-3",
      eventTime: 1234,
      userData: {},
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.data[0].action_source).toBe("website");
    expect(body.data[0].event_id).toBe("evt-3");
    expect(body.data[0].event_time).toBe(1234);
    expect(body.data[0].event_name).toBe("SubmitApplication");
  });

  it("includes test_event_code only when configured", async () => {
    process.env.META_TEST_EVENT_CODE = "TEST123";
    const fetchMock = mockFetchOk();
    await sendMetaEvent({
      eventName: META_EVENTS.purchase,
      eventId: "evt-7",
      eventTime: 1000,
      userData: {},
      customData: { value: 49, currency: "AUD" },
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.test_event_code).toBe("TEST123");
    expect(body.data[0].custom_data).toEqual({ value: 49, currency: "AUD" });
  });

  it("no-ops (no fetch; ok:false skipped) when not configured", async () => {
    delete process.env.META_CAPI_ACCESS_TOKEN;
    const fetchMock = mockFetchOk();
    const res = await sendMetaEvent({
      eventName: META_EVENTS.purchase,
      eventId: "evt-4",
      userData: {},
    });
    expect(res).toEqual({ ok: false, skipped: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws + returns ok:false when fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendMetaEvent({
      eventName: META_EVENTS.purchase,
      eventId: "evt-5",
      eventTime: 1000,
      userData: { email: "x@y.com" },
      customData: { value: 49, currency: "AUD" },
    });
    expect(res.ok).toBe(false);
  });

  it("returns ok:false on a non-2xx response without throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
      text: async () => "bad request",
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendMetaEvent({
      eventName: META_EVENTS.purchase,
      eventId: "evt-6",
      eventTime: 1000,
      userData: {},
    });
    expect(res.ok).toBe(false);
  });

  it("survives a non-Error rejection value", async () => {
    const fetchMock = vi.fn().mockRejectedValue("string failure");
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendMetaEvent({
      eventName: META_EVENTS.purchase,
      eventId: "evt-8",
      eventTime: 1000,
      userData: {},
    });
    expect(res.ok).toBe(false);
  });

  it("tolerates res.text() throwing while reading a non-2xx body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => {
        throw new Error("stream already consumed");
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendMetaEvent({
      eventName: META_EVENTS.purchase,
      eventId: "evt-9b",
      eventTime: 1000,
      userData: {},
    });
    expect(res.ok).toBe(false);
  });

  it("maps + hashes the full user_data set and passes cookies through un-hashed", async () => {
    const fetchMock = mockFetchOk();
    await sendMetaEvent({
      eventName: META_EVENTS.completeRegistration,
      eventId: "evt-full",
      eventTime: 1000,
      actionSource: "system_generated",
      eventSourceUrl: "https://babybloomsydney.com.au/signup",
      userData: {
        email: "p@example.com",
        phone: "+61 400 111 222",
        firstName: "Ada",
        lastName: "Lovelace",
        externalId: "user-77",
        fbp: "fb.1.123.456",
        fbc: "fb.1.123.click",
        clientIpAddress: "1.2.3.4",
        clientUserAgent: "Mozilla/5.0",
      },
    });
    const event = JSON.parse(String(fetchMock.mock.calls[0][1].body)).data[0];
    expect(event.action_source).toBe("system_generated");
    expect(event.event_source_url).toBe(
      "https://babybloomsydney.com.au/signup",
    );
    expect(event.user_data.em).toEqual([sha256Hex("p@example.com")]);
    expect(event.user_data.ph).toEqual([sha256Hex("61400111222")]);
    expect(event.user_data.fn).toEqual([sha256Hex("ada")]);
    expect(event.user_data.ln).toEqual([sha256Hex("lovelace")]);
    expect(event.user_data.external_id).toEqual([sha256Hex("user-77")]);
    expect(event.user_data.fbp).toBe("fb.1.123.456");
    expect(event.user_data.fbc).toBe("fb.1.123.click");
    expect(event.user_data.client_ip_address).toBe("1.2.3.4");
    expect(event.user_data.client_user_agent).toBe("Mozilla/5.0");
  });
});
