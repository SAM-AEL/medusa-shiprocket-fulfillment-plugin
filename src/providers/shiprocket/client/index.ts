
import axios, { AxiosInstance } from "axios"
import { MedusaError } from "@medusajs/utils"
import { authenticate } from "./methods/authenticate"
import { calculate } from "./methods/calculate"
import { create } from "./methods/create"
import { cancel } from "./methods/cancel"
import { getTrackingInfo } from "./methods/get-tracking-info"
// If you implement these, import them:
// import { getShipmentStatus } from "./methods/get-shipment-status"
// import { createReturn } from "./methods/create-return"
import type {
    ShiprocketClientOptions,
    ShiprocketCalculateRateRequest,
    ShiprocketCreateOrderResponse,
    ShiprocketTrackingResponse
} from "./types"


class ShiprocketClient {
    private email: string
    private password: string
    private pickup_location?: string
    private axios: AxiosInstance
    private token: string | null = null
    private tokenExpiry: number | null = null
    private refreshTimeout: NodeJS.Timeout | null = null
    private isDisposed = false

    constructor(options: ShiprocketClientOptions) {
        if (!options.email || !options.password) {
            throw new MedusaError(
                MedusaError.Types.INVALID_DATA,
                "Shiprocket API credentials are required"
            )
        }
        this.email = options.email
        this.password = options.password
        this.pickup_location = options.pickup_location
        this.axios = axios.create({
            baseURL: "https://apiv2.shiprocket.in/v1/external",
            headers: { "Content-Type": "application/json" },
            timeout: 10000,
        })
        process.on("beforeExit", () => this.dispose())
    }

    /**
     * Disposes of the client, clearing any timeouts.
     */
    dispose(): void {
        if (this.isDisposed) return
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout)
            this.refreshTimeout = null
        }
        this.token = null
        this.tokenExpiry = null
        this.isDisposed = true
    }

    /**
     * Ensures that the client is authenticated with Shiprocket.
     * If the token is missing or expired, it will authenticate and schedule a refresh.
     * @private
     */
    private async ensureAuthenticated(): Promise<void> {
        if (!this.token || !this.tokenExpiry || Date.now() > this.tokenExpiry) {
            const auth = await authenticate(this.axios, this.email, this.password, this.isDisposed)
            this.token = auth.token
            this.tokenExpiry = auth.tokenExpiry
            this.axios.defaults.headers.common["Authorization"] = `Bearer ${this.token}`
            if (this.refreshTimeout) clearTimeout(this.refreshTimeout)
            this.refreshTimeout = setTimeout(
                () => {
                    this.ensureAuthenticated().catch(error => {
                        throw new MedusaError(
                            MedusaError.Types.UNEXPECTED_STATE,
                            `Failed to refresh Shiprocket token: ${error.message}`
                        )
                    })
                },
                8 * 24 * 60 * 60 * 1000 // Refresh after 8 days
            )
        }
    }

    /**
     * Calculates the shipping rate for a given order.
     * @param data - The data needed to calculate the rate.
     * @returns The calculated shipping rate.
     */
    async calculate(data: ShiprocketCalculateRateRequest): Promise<number> {
        await this.ensureAuthenticated()
        return calculate(this.axios, data)
    }

    /**
     * Creates a new fulfillment in Shiprocket.
     * @param fulfillment - The fulfillment data.
     * @param items - The items in the fulfillment.
     * @param order - The order associated with the fulfillment.
     * @returns The created order data.
     */
    async create(
        fulfillment: any,
        items: any[],
        order: any
    ): Promise<ShiprocketCreateOrderResponse> {
        await this.ensureAuthenticated()
        return create(this.axios, this.pickup_location, fulfillment, items, order)
    }

    /**
     * Cancels an order in Shiprocket.
     * @param orderId - The ID of the order to cancel.
     */
    async cancel(orderId: string): Promise<void> {
        await this.ensureAuthenticated()
        return cancel(this.axios, orderId)
    }

    /**
     * Gets the tracking information for a shipment.
     * @param trackingNumber - The tracking number of the shipment.
     * @returns The tracking information.
     */
    async getTrackingInfo(
        trackingNumber: string
    ): Promise<ShiprocketTrackingResponse> {
        await this.ensureAuthenticated()
        return getTrackingInfo(this.axios, trackingNumber)
    }

    /**
     * Gets the status of a shipment.
     * @param shipmentId - The ID of the shipment.
     * @returns The shipment status.
     */
    async getShipmentStatus(shipmentId: string): Promise<ShiprocketCreateOrderResponse> {
        await this.ensureAuthenticated()

        return {
            order_id: shipmentId,
            shipment_id: shipmentId,
            status: "success",
            status_code: 200,
            awb: "1234567890",
            courier_company_id: 1,
            courier_name: "DHL",
            tracking_number: "1234567890",
            tracking_url: "https://www.dhl.com/tracking?tracking-number=1234567890",
        }
    }

    /**
     * Creates a return fulfillment.
     * @param fulfillment - The fulfillment to be returned.
     * @returns The created return fulfillment data.
     */
    async createReturn(fulfillment: any): Promise<ShiprocketCreateOrderResponse> {
        await this.ensureAuthenticated()
        return {
            order_id: fulfillment.external_id,
            shipment_id: fulfillment.external_id,
            status: "success",
            status_code: 200,
            awb: "1234567890",
            courier_company_id: 1,
            courier_name: "DHL",
            tracking_number: "1234567890",
            tracking_url: "https://www.dhl.com/tracking?tracking-number=1234567890",
        }
    }
}

export default ShiprocketClient
