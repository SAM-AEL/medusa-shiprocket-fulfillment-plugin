import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import ShiprocketClient from "../../../../providers/shiprocket/client"
import { deliveryEstimateCache, getCacheKey } from "./cache"
import { rateLimiter, getClientIdentifier } from "./rate-limiter"

// Make this route public (no publishable API key required)
export const AUTHENTICATE = false

// Cache for pickup location pincode (long TTL - 1 hour)
let cachedPickupPincode: { value: string; expiresAt: number } | null = null

/**
 * GET /store/shiprocket/delivery-estimate
 * 
 * Check delivery serviceability and get estimated delivery dates for a pincode.
 * 
 * Features:
 * - Rate limited: 30 requests per minute per IP
 * - Cached: Results cached for 10 minutes
 * - Auto-fetches pickup pincode from Shiprocket using SHIPROCKET_PICKUP_LOCATION
 * 
 * Query parameters:
 * - delivery_pincode: The delivery destination pincode (required)
 * - pickup_pincode: The pickup location pincode (optional, auto-fetched from SHIPROCKET_PICKUP_LOCATION)
 * - weight: Package weight in kg (optional, defaults to 0.5)
 * - cod: Cash on delivery flag, 0 or 1 (optional, defaults to 0)
 * 
 * Returns:
 * - serviceable: boolean indicating if delivery is possible
 * - fastest_delivery: the fastest courier option with estimated date
 * - all_options: all available courier options sorted by delivery time
 */
export async function GET(
    req: MedusaRequest,
    res: MedusaResponse
) {
    // Rate limiting check
    const clientId = getClientIdentifier(req)
    if (!rateLimiter.isAllowed(clientId)) {
        const resetTime = rateLimiter.getResetTime(clientId)
        res.setHeader("X-RateLimit-Limit", "30")
        res.setHeader("X-RateLimit-Remaining", "0")
        res.setHeader("X-RateLimit-Reset", resetTime.toString())
        res.setHeader("Retry-After", resetTime.toString())
        return res.status(429).json({
            error: "Too many requests",
            message: `Rate limit exceeded. Try again in ${resetTime} seconds.`,
        })
    }

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", "30")
    res.setHeader("X-RateLimit-Remaining", rateLimiter.getRemaining(clientId).toString())

    const { pickup_pincode, delivery_pincode, weight, cod } = req.query as {
        pickup_pincode?: string
        delivery_pincode?: string
        weight?: string
        cod?: string
    }

    // Get credentials from environment
    const email = process.env.SHIPROCKET_EMAIL
    const password = process.env.SHIPROCKET_PASSWORD
    const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION

    // Validate credentials are configured
    if (!email || !password) {
        return res.status(500).json({
            error: "Configuration error",
            message: "Shiprocket credentials not configured. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD environment variables.",
        })
    }

    // Validate delivery pincode is provided
    if (!delivery_pincode) {
        return res.status(400).json({
            error: "Missing delivery_pincode",
            message: "'delivery_pincode' query parameter is required",
        })
    }

    // Validate delivery pincode format (Indian pincodes are 6 digits)
    const pincodeRegex = /^\d{6}$/
    if (!pincodeRegex.test(delivery_pincode)) {
        return res.status(400).json({
            error: "Invalid delivery_pincode",
            message: "Delivery pincode must be a 6-digit number",
        })
    }

    let client: ShiprocketClient | null = null

    try {
        // Create client instance
        client = new ShiprocketClient({ email, password })

        // Determine pickup pincode
        let pickupPincode = pickup_pincode

        if (!pickupPincode) {
            // Check if we have a cached pickup pincode
            if (cachedPickupPincode && Date.now() < cachedPickupPincode.expiresAt) {
                pickupPincode = cachedPickupPincode.value
            } else if (pickupLocation) {
                // Fetch from Shiprocket using the location name
                const fetchedPincode = await client.getPickupPincode(pickupLocation)
                if (fetchedPincode) {
                    pickupPincode = fetchedPincode
                    // Cache for 1 hour
                    cachedPickupPincode = {
                        value: fetchedPincode,
                        expiresAt: Date.now() + 60 * 60 * 1000,
                    }
                }
            }
        }

        if (!pickupPincode) {
            return res.status(400).json({
                error: "Missing pickup pincode",
                message: "Either provide 'pickup_pincode' query parameter or set SHIPROCKET_PICKUP_LOCATION environment variable to auto-fetch the pincode",
            })
        }

        // Validate pickup pincode format
        if (!pincodeRegex.test(pickupPincode)) {
            return res.status(400).json({
                error: "Invalid pickup_pincode",
                message: "Pickup pincode must be a 6-digit number",
            })
        }

        // Check cache for delivery estimate
        const cacheKey = getCacheKey(
            pickupPincode,
            delivery_pincode,
            weight ? parseFloat(weight) : undefined,
            cod ? parseInt(cod) : undefined
        )
        const cachedResult = deliveryEstimateCache.get(cacheKey)
        if (cachedResult) {
            res.setHeader("X-Cache", "HIT")
            return res.json(cachedResult)
        }
        res.setHeader("X-Cache", "MISS")

        // Get delivery estimate
        const estimate = await client.getDeliveryEstimate({
            pickup_postcode: pickupPincode,
            delivery_postcode: delivery_pincode,
            weight: weight ? parseFloat(weight) : undefined,
            cod: cod ? parseInt(cod) : undefined,
        })

        // Cache the result
        deliveryEstimateCache.set(cacheKey, estimate)

        return res.json(estimate)
    } catch (error: any) {
        console.error("Delivery estimate error:", error)
        return res.status(500).json({
            error: "Failed to get delivery estimate",
            message: error.message || "An unexpected error occurred",
        })
    } finally {
        // Dispose client after use
        if (client) {
            client.dispose()
        }
    }
}
