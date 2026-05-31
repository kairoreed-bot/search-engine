import Redis from "ioredis"

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379"
const redis = new Redis(REDIS_URL, {
  retryStrategy: () => null,
  lazyConnect: true,
})
redis.on("error", () => {})

// --- Redis ---

export async function getCached(key: string): Promise<string | null> {
  try {
    return await redis.get(key)
  } catch {
    return null
  }
}

export async function setCache(key: string, value: string, ttl = 3600): Promise<void> {
  try {
    await redis.set(key, value, "EX", ttl)
  } catch {
    // no-op
  }
}

export async function closeRedis(): Promise<void> {
  try {
    await redis.quit()
  } catch {
    // not connected
  }
}

// --- In-memory fallback cache ---

const memCache = new Map<string, { data: any; expiresAt: number }>()

function memKey(...parts: string[]): string {
  return parts.join(":")
}

export function memGet<T>(key: string): T | null {
  const entry = memCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    memCache.delete(key)
    return null
  }
  return entry.data as T
}

export function memSet(key: string, data: any, ttlMs = 300_000): void {
  memCache.set(key, { data, expiresAt: Date.now() + ttlMs })
}
