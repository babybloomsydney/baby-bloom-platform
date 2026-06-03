import { describe, it, expect } from "vitest";
import { isValidABN, normaliseABN, formatABNDisplay } from "./abn";

describe("normaliseABN", () => {
  it("strips spaces, hyphens, mixed garbage", () => {
    expect(normaliseABN("51 824 753 556")).toBe("51824753556");
    expect(normaliseABN("51-824-753-556")).toBe("51824753556");
    expect(normaliseABN("51 824 753 556 extra")).toBe("51824753556");
    expect(normaliseABN("abcdef")).toBe("");
    expect(normaliseABN("")).toBe("");
  });
});

describe("isValidABN", () => {
  it("accepts Department of the Treasury ABN in any format", () => {
    expect(isValidABN("51 824 753 556")).toBe(true);
    expect(isValidABN("51-824-753-556")).toBe(true);
    expect(isValidABN("51824753556")).toBe(true);
  });

  it("rejects 11-digit values that fail the checksum", () => {
    expect(isValidABN("12345678901")).toBe(false);
    expect(isValidABN("00000000000")).toBe(false);
    expect(isValidABN("51824753557")).toBe(false); // last-digit mutation
  });

  it("rejects values starting with 0 even when the modulo passes", () => {
    // ATO never issues ABNs with a leading zero. 01234567891 is a
    // false-positive of a naive weighted-sum check; we explicitly
    // reject it.
    expect(isValidABN("01234567891")).toBe(false);
    expect(isValidABN("0 123 456 7891")).toBe(false);
  });

  it("rejects wrong-length inputs", () => {
    expect(isValidABN("123")).toBe(false);
    expect(isValidABN("")).toBe(false);
    expect(isValidABN("abcdefghijk")).toBe(false);
  });
});

describe("formatABNDisplay", () => {
  it("formats 11-digit input as XX XXX XXX XXX", () => {
    expect(formatABNDisplay("51824753556")).toBe("51 824 753 556");
    expect(formatABNDisplay("51 824 753 556")).toBe("51 824 753 556");
  });

  it("returns input unchanged when length is not 11 post-normalise", () => {
    expect(formatABNDisplay("abc")).toBe("abc");
    expect(formatABNDisplay("123")).toBe("123");
  });
});
