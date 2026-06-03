/**
 * Meta Conversions API (server-side) — the source-of-truth sender for
 * identity + money events (CompleteRegistration, SubmitApplication,
 * Purchase). The browser pixel fires a deduplicating copy via the same
 * `event_id`.
 *
 * SERVER ONLY. Reads `META_CAPI_ACCESS_TOKEN` — a non-public secret. Next
 * strips non-`NEXT_PUBLIC_` env from client bundles, so importing this from
 * a client component would null the token rather than leak it; even so,
 * never do that. PII is SHA-256 hashed (`./hash`) before it leaves the
 * process.
 *
 * FAIL-SAFE CONTRACT: this function never throws and never rejects. A Meta
 * outage or misconfiguration must not break signup, position creation, or
 * checkout (AC5). Callers may ignore the result.
 *
 * Spec: system/FB/Plan/01-A-pixel-setup-build-plan.md (A2/A3) +
 * system/FB/Setup/03-conversions-api-and-deduplication.md.
 */
import { hashEmail, hashPhone, hashName, hashExternalId } from "./hash";
import type { MetaEventName, MetaCustomData } from "./events";

// Graph API version is pinned but env-overridable; confirm against current
// Meta docs at go-live (A0). Versions are supported ~2 years from release.
const DEFAULT_GRAPH_API_VERSION = "v21.0";

// Hard ceiling so a stalled Meta endpoint can never hold a signup / position /
// checkout server action open (AC5 — a Meta hiccup must not slow the funnel).
const CAPI_TIMEOUT_MS = 5000;

export type MetaActionSource =
  | "website"
  | "system_generated"
  | "app"
  | "phone_call"
  | "chat"
  | "email"
  | "other";

/** Raw (un-hashed) identity inputs. Hashing happens inside this module. */
export interface MetaUserData {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  externalId?: string | null;
  /** Meta browser cookies — passed through un-hashed; improve match quality. */
  fbp?: string | null;
  fbc?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
}

export interface SendMetaEventParams {
  eventName: MetaEventName;
  /** Shared with the browser copy → Meta dedup. */
  eventId: string;
  /** Unix seconds. Defaults to now. */
  eventTime?: number;
  /** Defaults to "website". */
  actionSource?: MetaActionSource;
  eventSourceUrl?: string;
  userData: MetaUserData;
  customData?: MetaCustomData;
}

export type MetaCapiResult =
  | { ok: true }
  | { ok: false; skipped?: "not_configured"; error?: string };

interface CapiConfig {
  pixelId: string;
  accessToken: string;
  version: string;
  testEventCode?: string;
}

function readCapiConfig(): CapiConfig | null {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !accessToken) return null;
  return {
    pixelId,
    accessToken,
    version: process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION,
    testEventCode: process.env.META_TEST_EVENT_CODE || undefined,
  };
}

let warnedNotConfigured = false;
/**
 * Warn once (not per-call) so a misconfigured prod deploy is visible in logs
 * without spamming, while the pipeline stays a graceful no-op.
 */
function warnNotConfiguredOnce(): void {
  if (warnedNotConfigured) return;
  warnedNotConfigured = true;
  console.warn(
    "[Meta CAPI] not configured — NEXT_PUBLIC_META_PIXEL_ID or META_CAPI_ACCESS_TOKEN missing; server events are being skipped.",
  );
}

/** Build the hashed/passed-through user_data block, omitting empty keys. */
function buildUserData(u: MetaUserData): Record<string, string[] | string> {
  const out: Record<string, string[] | string> = {};
  const em = hashEmail(u.email);
  const ph = hashPhone(u.phone);
  const fn = hashName(u.firstName);
  const ln = hashName(u.lastName);
  const externalId = hashExternalId(u.externalId);
  if (em) out.em = [em];
  if (ph) out.ph = [ph];
  if (fn) out.fn = [fn];
  if (ln) out.ln = [ln];
  if (externalId) out.external_id = [externalId];
  if (u.fbp) out.fbp = u.fbp;
  if (u.fbc) out.fbc = u.fbc;
  if (u.clientIpAddress) out.client_ip_address = u.clientIpAddress;
  if (u.clientUserAgent) out.client_user_agent = u.clientUserAgent;
  return out;
}

function stripUndefined(data: MetaCustomData): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "(no body)";
  }
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown error";
}

export async function sendMetaEvent(
  params: SendMetaEventParams,
): Promise<MetaCapiResult> {
  try {
    const config = readCapiConfig();
    if (!config) {
      warnNotConfiguredOnce();
      return { ok: false, skipped: "not_configured" };
    }

    const serverEvent = {
      event_name: params.eventName,
      event_time: params.eventTime ?? Math.floor(Date.now() / 1000),
      event_id: params.eventId,
      action_source: params.actionSource ?? "website",
      ...(params.eventSourceUrl
        ? { event_source_url: params.eventSourceUrl }
        : {}),
      user_data: buildUserData(params.userData),
      ...(params.customData
        ? { custom_data: stripUndefined(params.customData) }
        : {}),
    };

    const body = JSON.stringify({
      data: [serverEvent],
      ...(config.testEventCode
        ? { test_event_code: config.testEventCode }
        : {}),
    });

    // Token goes in the Authorization header, NOT the URL, so it can't leak via
    // request-URL logging (Vercel function logs / proxies / Sentry breadcrumbs).
    const url = `https://graph.facebook.com/${config.version}/${config.pixelId}/events`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.accessToken}`,
      },
      body,
      signal: AbortSignal.timeout(CAPI_TIMEOUT_MS),
    });

    if (!res.ok) {
      const detail = await safeReadText(res);
      console.error(
        `[Meta CAPI] ${params.eventName} rejected (${res.status}): ${detail}`,
      );
      return { ok: false, error: `status_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error(
      `[Meta CAPI] ${params.eventName} send failed:`,
      getErrorMessage(err),
    );
    return { ok: false, error: getErrorMessage(err) };
  }
}
