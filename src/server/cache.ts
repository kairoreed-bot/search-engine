import Redis from "ioredis"

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379"
const redis = new Redis(REDIS_URL)

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
    // cache write failure is non-fatal
  }
}

export async function closeRedis(): Promise<void> {
  await redis.quit()
}
