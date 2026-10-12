import type { Scenario } from "../engine";

/** Scenario <-> URL-safe base64 JSON, for share links. */
export function encode(s: Scenario): string {
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decode(text: string): Scenario | null {
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return looksLikeScenario(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Shape check for untrusted input; ``validate`` checks the values afterwards. */
export function looksLikeScenario(x: unknown): x is Scenario {
  if (typeof x !== "object" || x === null) return false;
  const s = x as Record<string, unknown>;
  const dist = (d: unknown) => typeof d === "object" && d !== null && typeof (d as { kind?: unknown }).kind === "string";
  return (
    typeof s.name === "string" &&
    typeof s.participants === "number" &&
    typeof s.horizon === "number" &&
    dist(s.discountRate) &&
    dist(s.deadweight) &&
    dist(s.implementation) &&
    Array.isArray(s.costs) &&
    Array.isArray(s.effects) &&
    s.costs.every((c: unknown) => typeof c === "object" && c !== null && dist((c as { perParticipant?: unknown }).perParticipant)) &&
    s.effects.every(
      (e: unknown) =>
        typeof e === "object" &&
        e !== null &&
        dist((e as { perParticipant?: unknown }).perParticipant) &&
        dist((e as { decay?: unknown }).decay) &&
        Array.isArray((e as { values?: unknown }).values),
    )
  );
}
