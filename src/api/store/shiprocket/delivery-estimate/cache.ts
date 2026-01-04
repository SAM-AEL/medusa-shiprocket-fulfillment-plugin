/**
 * Simple in-memory cache with TTL for delivery estimates
 * Cache key: `${pickup_pincode}-${delivery_pincode}-${weight}-${cod}`
 */

interface CacheEntry<T> {
    data: T
    expiresAt: number
}

class SimpleCache<T> {
    private cache = new Map<string, CacheEntry<T>>()
    private readonly ttlMs: number
    private readonly maxSize: number

    constructor(ttlMs: number = 10 * 60 * 1000, maxSize: number = 1000) {
        // Default: 10 minutes TTL, max 1000 entries
        this.ttlMs = ttlMs
        this.maxSize = maxSize
    }

    get(key: string): T | null {
        const entry = this.cache.get(key)
        if (!entry) return null

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key)
            return null
        }

        return entry.data
    }

    set(key: string, data: T): void {
        // Evict oldest entries if cache is full
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value
            if (oldestKey) this.cache.delete(oldestKey)
        }

        this.cache.set(key, {
            data,
            expiresAt: Date.now() + this.ttlMs,
        })
    }

    clear(): void {
        this.cache.clear()
    }

    get size(): number {
        return this.cache.size
    }
}

// Singleton cache instance for delivery estimates (10 min TTL)
export const deliveryEstimateCache = new SimpleCache<any>(10 * 60 * 1000)

/**
 * Generate cache key for delivery estimate
 */
export function getCacheKey(
    pickupPincode: string,
    deliveryPincode: string,
    weight?: number,
    cod?: number
): string {
    return `${pickupPincode}-${deliveryPincode}-${weight || 0.5}-${cod || 0}`
}
