import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type RateLimitPolicy = {
  limit: number;
  windowSeconds: number;
  blockSeconds?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

type MemoryEntry = { windowStartedAt: number; hits: number; blockedUntil: number };
const memory = new Map<string, MemoryEntry>();

function memoryCheck(key: string, policy: RateLimitPolicy): RateLimitResult {
  const now = Date.now();
  const windowMs = policy.windowSeconds * 1000;
  const blockMs = (policy.blockSeconds || policy.windowSeconds) * 1000;
  let entry = memory.get(key);
  if (!entry || now - entry.windowStartedAt >= windowMs) {
    entry = { windowStartedAt: now, hits: 0, blockedUntil: 0 };
  }
  if (entry.blockedUntil > now) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  entry.hits += 1;
  if (entry.hits > policy.limit) {
    entry.blockedUntil = now + blockMs;
    memory.set(key, entry);
    return { allowed: false, remaining: 0, retryAfter: Math.ceil(blockMs / 1000) };
  }
  memory.set(key, entry);
  if (memory.size > 10_000) {
    for (const [candidate, value] of memory) {
      if (now - value.windowStartedAt > windowMs * 2 && value.blockedUntil < now) memory.delete(candidate);
      if (memory.size <= 8_000) break;
    }
  }
  return { allowed: true, remaining: Math.max(0, policy.limit - entry.hits), retryAfter: 0 };
}

export async function checkRateLimit(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase.rpc("check_api_rate_limit", {
      p_key: key,
      p_limit: policy.limit,
      p_window_seconds: policy.windowSeconds,
      p_block_seconds: policy.blockSeconds || policy.windowSeconds,
    });
    if (!error && data && typeof data === "object") {
      const value = data as Record<string, unknown>;
      return {
        allowed: value.allowed === true,
        remaining: Math.max(0, Number(value.remaining) || 0),
        retryAfter: Math.max(0, Number(value.retry_after) || 0),
      };
    }
    if (error && !/does not exist|function/i.test(error.message)) {
      console.error("Rate limit Supabase:", error.message);
    }
  }
  return memoryCheck(key, policy);
}

export function rateLimitHeaders(result: RateLimitResult) {
  const headers = new Headers();
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  if (!result.allowed) headers.set("Retry-After", String(Math.max(1, result.retryAfter)));
  return headers;
}
