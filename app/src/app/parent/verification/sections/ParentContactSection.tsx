"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitParentContactSection } from "@/lib/actions/parent-verification";
import type { ParentVerificationData } from "@/types/parent";

// Strip whitespace and normalize to 04XXXXXXXX format
function normalisePhone(val: string): string {
  let digits = val.replace(/\s+/g, "");
  if (/^4\d{8}$/.test(digits)) {
    digits = "0" + digits;
  }
  return digits;
}

const AU_MOBILE_REGEX = /^04\d{8}$/;

/** Format normalised phone "04XXXXXXXX" → "+61 (0) 401 510 535" */
function formatPhoneDisplay(raw: string): string {
  const n = normalisePhone(raw);
  if (!AU_MOBILE_REGEX.test(n)) return "";
  // n = "0401510535" → strip leading 0 → "401510535" → "+61 (0) 401 510 535"
  const digits = n.slice(1); // "401510535"
  return `+61 (0) ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

interface AddressrResult {
  sla: string;
  ssla?: string;
  pid: string;
  score: number;
}

interface ParsedAddress {
  street: string;
  suburb: string;
  postcode: string;
}

interface ParentContactSectionProps {
  verification: ParentVerificationData | null;
  locked: boolean;
  onSaved: () => void;
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parse GNAF single-line address into street, suburb, postcode */
function parseGnafAddress(sla: string): ParsedAddress | null {
  // SLA format: "STREET, SUBURB NSW POSTCODE" or "UNIT X, STREET, SUBURB NSW POSTCODE"
  const match = sla.match(/^(.+),\s+([A-Z\s]+?)\s+NSW\s+(\d{4})$/);
  if (!match) return null;

  // The street is everything before the last comma + suburb chunk
  // But there could be multiple commas (e.g. "UNIT 42, 115-119 BONDI RD, BONDI NSW 2026")
  // So we need to find where the suburb starts
  const postcode = match[3];
  const fullBeforeState = sla.substring(0, sla.lastIndexOf("NSW")).trim().replace(/,\s*$/, "");
  // fullBeforeState is now "STREET, SUBURB" or "UNIT X, STREET, SUBURB"
  // The suburb is the last comma-separated segment
  const lastComma = fullBeforeState.lastIndexOf(",");
  if (lastComma < 0) return null;

  const street = fullBeforeState.substring(0, lastComma).trim();
  const suburb = fullBeforeState.substring(lastComma + 1).trim();

  return {
    street: toTitleCase(street),
    suburb: toTitleCase(suburb),
    postcode,
  };
}

export function ParentContactSection({ verification, locked, onSaved }: ParentContactSectionProps) {
  const status = verification?.contact_status ?? "not_started";
  const isCompleted = status === "saved";

  const [editing, setEditing] = useState(status === "not_started");
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState(verification?.phone_number ?? "");

  // GNAF address autocomplete — single field
  const [addressQuery, setAddressQuery] = useState(verification?.address_line ?? "");
  const [selectedAddress, setSelectedAddress] = useState<ParsedAddress | null>(
    verification?.address_line && verification?.city && verification?.postcode
      ? { street: verification.address_line, suburb: verification.city, postcode: verification.postcode }
      : null
  );
  const [addressResults, setAddressResults] = useState<AddressrResult[]>([]);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [notInArea, setNotInArea] = useState(false);
  const addressDropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // sydney_postcodes for service area validation
  const [sydneyPostcodes, setSydneyPostcodes] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch("/api/sydney-postcodes")
      .then((res) => res.json())
      .then((data: { suburb: string; postcode: string }[]) => {
        setSydneyPostcodes(new Set(data.map((d) => d.postcode)));
      })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addressDropdownRef.current && !addressDropdownRef.current.contains(e.target as Node)) {
        setShowAddressDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // GNAF address search — debounced, NSW only
  const searchAddress = useCallback((query: string) => {
    if (query.trim().length < 4) {
      setAddressResults([]);
      setShowAddressDropdown(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setAddressLoading(true);
      try {
        const res = await fetch(
          `/api/address-search?q=${encodeURIComponent(query)}`
        );
        if (!res.ok) {
          setAddressResults([]);
          setShowAddressDropdown(false);
          return;
        }
        const data: AddressrResult[] = await res.json();
        // Only show NSW results
        const nswOnly = data.filter((r) => r.sla.includes(" NSW "));
        setAddressResults(nswOnly.slice(0, 8));
        setShowAddressDropdown(nswOnly.length > 0);
      } catch {
        setAddressResults([]);
        setShowAddressDropdown(false);
      } finally {
        setAddressLoading(false);
      }
    }, 300);
  }, []);

  function handleAddressChange(val: string) {
    setAddressQuery(val);
    setSelectedAddress(null);
    setNotInArea(false);
    searchAddress(val);
  }

  function handleAddressSelect(result: AddressrResult) {
    const parsed = parseGnafAddress(result.ssla || result.sla);
    if (!parsed) {
      // Fallback — shouldn't happen for NSW results
      setShowAddressDropdown(false);
      return;
    }

    // Check if postcode is in our service area
    if (sydneyPostcodes.size > 0 && !sydneyPostcodes.has(parsed.postcode)) {
      setNotInArea(true);
      setSelectedAddress(null);
      setAddressQuery(toTitleCase(result.ssla || result.sla));
      setShowAddressDropdown(false);
      return;
    }

    setAddressQuery(parsed.street);
    setSelectedAddress(parsed);
    setShowAddressDropdown(false);
    setAddressResults([]);
    setNotInArea(false);
  }

  function handlePhoneChange(val: string) {
    setPhone(val);
  }

  if (locked) {
    return (
      <div className="text-sm text-slate-500 py-4">
        Complete the ID section first to unlock Contact Information.
      </div>
    );
  }

  const phoneValid = AU_MOBILE_REGEX.test(normalisePhone(phone));
  const canSave = phoneValid && selectedAddress;

  async function handleSave() {
    setIsSaving(true);
    setError(null);

    try {
      const result = await Promise.race([
        submitParentContactSection({
          phone_number: normalisePhone(phone),
          address_line: selectedAddress!.street,
          city: selectedAddress!.suburb,
          state: "NSW",
          postcode: selectedAddress!.postcode,
          country: "Australia",
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Save timed out — please try again")), 15000)),
      ]);

      if (!result.success) {
        setError(result.error ?? "Failed to save");
        setIsSaving(false);
        return;
      }

      setIsSaving(false);
      setIsVerifying(true);
      await new Promise(resolve => setTimeout(resolve, 1200));
      setIsVerifying(false);
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
      setIsSaving(false);
    }
  }

  const displayAddress = selectedAddress?.street ?? verification?.address_line;
  const displaySuburb = selectedAddress?.suburb ?? verification?.city;
  const displayPostcode = selectedAddress?.postcode ?? verification?.postcode;

  if (!editing && isCompleted) {
    return (
      <div className="space-y-4">
        <div className="space-y-1 text-sm text-green-700">
          {phone && <p>{formatPhoneDisplay(phone) || phone}</p>}
          {displayAddress && <p>{displayAddress}</p>}
          {displaySuburb && <p>{displaySuburb}, NSW {displayPostcode}</p>}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setEditing(true)}
          size="sm"
        >
          Edit
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      <div className="space-y-2">
        <Label htmlFor="parent_phone_number" className="text-sm font-medium text-slate-700">Phone Number</Label>
        <div className="flex gap-2">
          <div className="flex items-center rounded-md border border-input bg-slate-50 px-3 h-9 text-sm text-slate-700 flex-shrink-0">
            <span>+61</span>
          </div>
          <div className="flex-1 space-y-1">
            <Input
              id="parent_phone_number"
              type="tel"
              placeholder="04XX XXX XXX"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              disabled={isSaving}
            />
            {phoneValid && (
              <p className="text-xs text-green-600 font-medium mt-1.5 flex items-center gap-1">
                {formatPhoneDisplay(phone)}
                <Check className="h-3 w-3" />
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="parent_address" className="text-sm font-medium text-slate-700">Address</Label>
          <span className="text-xs text-slate-400">NSW only</span>
        </div>
        <div className="relative" ref={addressDropdownRef}>
          <div className="relative">
            <Input
              id="parent_address"
              placeholder="Start typing your address..."
              value={addressQuery}
              onChange={(e) => handleAddressChange(e.target.value)}
              onFocus={() => {
                if (addressResults.length > 0) setShowAddressDropdown(true);
              }}
              disabled={isSaving}
              autoComplete="off"
            />
            {addressLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
            )}
          </div>
          {showAddressDropdown && (
            <div className={`absolute z-50 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg bottom-full mb-1`}>
              {addressResults.map((r) => (
                <button
                  key={r.pid}
                  type="button"
                  onClick={() => handleAddressSelect(r)}
                  className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 cursor-pointer"
                >
                  {toTitleCase(r.ssla || r.sla)}
                </button>
              ))}
            </div>
          )}
          {selectedAddress && (
            <p className="text-xs text-green-600 font-medium mt-1.5 flex items-center gap-1">
              {selectedAddress.street}, {selectedAddress.suburb} NSW {selectedAddress.postcode}
              <Check className="h-3 w-3" />
            </p>
          )}
          {notInArea && (
            <p className="text-xs text-amber-600 mt-1.5">
              This address is outside our service area. We currently only operate in Greater Sydney, NSW.
            </p>
          )}
        </div>
      </div>

      <Button
        type="button"
        onClick={handleSave}
        disabled={!canSave || isSaving || isVerifying}
        className="w-full bg-violet-600 hover:bg-violet-700 text-white"
      >
        {isSaving || isVerifying ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Verifying...
          </>
        ) : (
          "Verify"
        )}
      </Button>
    </div>
  );
}
