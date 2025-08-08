import type { MedusaContainer } from "@medusajs/framework/types"
import { ShiprocketClientOptions } from "../providers/shiprocket/client/types"
import ShiprocketClient from "../providers/shiprocket/client"

export default async function refreshShiprocketTokenJob(container: MedusaContainer) {
    const options: ShiprocketClientOptions = {
        email: process.env.SHIPROCKET_EMAIL!,
        password: process.env.SHIPROCKET_PASSWORD!,
    }
    const client = new ShiprocketClient(options)
    try {
        await client["ensureAuthenticated"]?.()
        // Optionally, log or store the refreshed token somewhere if needed
        container.resolve("logger").info("Shiprocket token refreshed")
    } catch (err) {
        // Optionally, log error
        container.resolve("logger").error("Failed to refresh Shiprocket token", err)
    } finally {
        client.dispose()
    }
}

export const config = {
    name: "refresh-shiprocket-token",
    schedule: "0 0 */8 * *", // every 8 days at 00:00
}
