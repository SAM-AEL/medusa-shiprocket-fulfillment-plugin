import axios, { AxiosInstance } from "axios"
import { MedusaError } from "@medusajs/utils"
import { authenticate } from "./methods/authenticate"
import { handleError } from "./handle-error"
import { getShiprocketManager } from "./manager"
import { validateAndSanitizePhone, validateAndSanitizePincode, requireField } from "../utils/validation"

import type {
    ShiprocketClientOptions,
    ShiprocketCalculateRateRequest,
    ShiprocketCalculateRateResponse,
    ShiprocketCreateOrderResponse,
    ShiprocketTrackingResponse,
    ShiprocketDeliveryEstimateRequest,
    ShiprocketDeliveryEstimateResponse,
    ShiprocketPickupLocation,
    ShiprocketPickupLocationsResponse,
} from "./types"

const DEFAULT_TIMEOUT = 15000 // 15 seconds

export default class ShiprocketClient {
    private email: string
    private password: string
    private pickup_location?: string
    private axios: AxiosInstance
    private token: string | null = null
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
        // We do not instantiate a new `axios` here. We will use the shared one from `manager.ts`
        // We keep this structure compatible with existing code but route requests through the manager.
    }

    dispose(): void {
        this.isDisposed = true
        // If we were holding onto anything else, we'd dispose it here
    }

    private async getSharedAxios(): Promise<AxiosInstance> {
        if (this.isDisposed) {
            throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "ShiprocketClient is disposed")
        }
        const manager = getShiprocketManager()
        return await manager.getAxios()
    }

    /**
     * Get all pickup locations with their pincodes
     * @param locationName Optional - filter by location name/nickname
     */
    async getPickupLocations(locationName?: string): Promise<ShiprocketPickupLocation[]> {
        try {
            const response = await (await this.getSharedAxios()).get<ShiprocketPickupLocationsResponse>(
                "/settings/company/pickup"
            )

            const locations = response.data.data.shipping_address || []

            // Filter by location name if provided
            if (locationName) {
                return locations.filter(
                    (loc) => loc.pickup_location.toLowerCase() === locationName.toLowerCase()
                )
            }

            return locations
        } catch (error: any) {
            handleError(error, { operation: "getPickupLocations" })
            return []
        }
    }

    /**
     * Get pincode for a pickup location by name
     */
    async getPickupPincode(locationName: string): Promise<string | null> {
        const locations = await this.getPickupLocations(locationName)
        return locations[0]?.pin_code || null
    }

    /**
     * Calculate shipping rate for a route
     */
    async calculate(data: ShiprocketCalculateRateRequest): Promise<number> {
        try {
            const response = await (await this.getSharedAxios()).get<ShiprocketCalculateRateResponse>(
                "/courier/serviceability/",
                { params: data }
            )

            const availableCouriers = response.data.data.available_courier_companies
            if (!availableCouriers?.length) {
                throw new MedusaError(
                    MedusaError.Types.NOT_FOUND,
                    `No couriers available for route ${data.pickup_postcode} -> ${data.delivery_postcode}`
                )
            }

            // Filter by allowed courier IDs if specified
            const filtered = data.allowed_courier_ids?.length
                ? availableCouriers.filter((c) => data.allowed_courier_ids!.includes(c.id))
                : availableCouriers

            if (!filtered?.length) {
                throw new MedusaError(
                    MedusaError.Types.NOT_FOUND,
                    "No allowed couriers available for this route"
                )
            }

            // Return cheapest rate
            const cheapest = filtered.reduce((min, curr) =>
                Number(curr.rate) < Number(min.rate) ? curr : min
            )

            return Math.ceil(Number(cheapest?.rate) || 0)
        } catch (error: any) {
            if (error instanceof MedusaError) throw error
            handleError(error, { operation: "calculate" })
        }
    }

    /**
     * Get delivery estimate for a route - returns raw Shiprocket API response
     */
    async getDeliveryEstimate(data: ShiprocketDeliveryEstimateRequest): Promise<any> {
        try {
            const response = await (await this.getSharedAxios()).get(
                "/courier/serviceability/",
                {
                    params: {
                        pickup_postcode: data.pickup_postcode,
                        delivery_postcode: data.delivery_postcode,
                        weight: data.weight || 0.5,
                        cod: data.cod || 0,
                    }
                }
            )

            return response.data
        } catch (error: any) {
            if (error instanceof MedusaError) throw error
            if (error?.response?.status === 404) {
                return {
                    status: 404,
                    data: { available_courier_companies: [] }
                }
            }
            handleError(error, { operation: "getDeliveryEstimate" })
        }
    }

    /**
     * Create an order in Shiprocket and assign AWB
     */
    async create(
        fulfillment: any,
        items: any[],
        order: any
    ): Promise<ShiprocketCreateOrderResponse> {
        // Map order items by ID for quick lookup
        const orderItemMap = new Map()
        if (Array.isArray(order.items)) {
            order.items.forEach((orderItem: any) => {
                orderItemMap.set(orderItem.id, orderItem)
            })
        }

        let totalWeight = 0
        let totalLength = 0
        let totalBreadth = 0
        let totalHeight = 0

        try {
            // strict DD-MM-YYYY HH:mm for shiprocket
            const d = new Date(order.created_at)
            const pad = (n: number) => n.toString().padStart(2, "0")
            const orderDate = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`

            // Calculate totals and dimensions
            for (const item of items) {
                const orderItem = orderItemMap.get(item.line_item_id)
                if (!orderItem) {
                    throw new MedusaError(
                        MedusaError.Types.INVALID_DATA,
                        `Order item not found for fulfillment item: ${item.title}`
                    )
                }

                const variant = orderItem.variant
                if (!variant) {
                    throw new MedusaError(
                        MedusaError.Types.INVALID_DATA,
                        `Variant data missing for item: ${item.title}`
                    )
                }

                const product = (variant as any).product

                // Check Variant first (preferred), then Product as fallback
                // Weight: Medusa uses grams. Shiprocket needs kg.
                const weightGrams = Number(variant.weight || product?.weight || 0)
                const weight = weightGrams / 1000

                const length = Number(variant.length || product?.length || 0)
                const breadth = Number(variant.width || product?.width || 0)
                const height = Number(variant.height || product?.height || 0)

                // Strict Validation: Shiprocket fines for incorrect dimensions
                if (!weight || !length || !breadth || !height) {
                    throw new MedusaError(
                        MedusaError.Types.INVALID_DATA,
                        `Missing dimensions/weight for "${item.title}". Please set them on the Variant.`
                    )
                }

                const quantity = Number(item.quantity || item.raw_quantity?.value || 1)
                totalWeight += weight * quantity
                totalLength = Math.max(totalLength, length)
                totalBreadth = Math.max(totalBreadth, breadth)
                totalHeight += height * quantity
            }

            const shipping = order.shipping_address || fulfillment?.delivery_address || {}
            const billing = order.billing_address || order.customer || {}

            // Build order payload
            const orderData = {
                order_id: `${order.id}-${Math.floor(Date.now() / 1000)}`,
                order_date: orderDate,
                pickup_location: this.pickup_location || "Primary",

                billing_customer_name: requireField(billing.first_name, "Billing First Name"),
                billing_last_name: billing.last_name || "",
                billing_address: requireField(shipping.address_1 || billing.address_1, "Billing Address"),
                billing_address_2: shipping.address_2 || billing.address_2 || "",
                billing_city: requireField(shipping.city || billing.city, "Billing City"),
                billing_pincode: validateAndSanitizePincode(requireField(shipping.postal_code || billing.postal_code, "Billing Pincode"), "Billing Pincode"),
                billing_state: requireField(shipping.province || billing.province, "Billing State"),
                billing_country: requireField(shipping.country_code || billing.country_code || "IN", "Billing Country"),
                billing_email: requireField(billing.email || order.email, "Billing Email"),
                billing_phone: validateAndSanitizePhone(requireField(shipping.phone || billing.phone, "Billing Phone"), "Billing Phone"),

                shipping_is_billing: true,
                shipping_customer_name: requireField(shipping.first_name, "Shipping First Name"),
                shipping_last_name: shipping.last_name || "",
                shipping_address: requireField(shipping.address_1, "Shipping Address"),
                shipping_address_2: shipping.address_2 || "",
                shipping_city: requireField(shipping.city, "Shipping City"),
                shipping_pincode: validateAndSanitizePincode(requireField(shipping.postal_code, "Shipping Pincode"), "Shipping Pincode"),
                shipping_country: requireField(shipping.country_code || "IN", "Shipping Country"),
                shipping_state: requireField(shipping.province, "Shipping State"),
                shipping_email: requireField(billing.email || order.email, "Shipping Email"),
                shipping_phone: validateAndSanitizePhone(requireField(shipping.phone, "Shipping Phone"), "Shipping Phone"),

                order_items: items.map((item) => {
                    const orderItem = orderItemMap.get(item.line_item_id)!
                    const variant = orderItem.variant!
                    const selling_price = Math.round(Number(orderItem.unit_price || orderItem.detail?.unit_price || 0))

                    return {
                        name: item.title,
                        sku: variant.sku || orderItem.variant_sku || item.sku || item.id,
                        units: Number(item.quantity || item.raw_quantity?.value || 1),
                        selling_price,
                        discount: "",
                        tax: "",
                        hsn: Number(variant.hs_code || 0),
                    }
                }),

                payment_method: "Prepaid",
                sub_total: items.reduce((sum, item) => {
                    const orderItem = orderItemMap.get(item.line_item_id)!
                    const price = Number(orderItem.unit_price || orderItem.detail?.unit_price || 0)
                    const qty = Number(item.quantity || item.raw_quantity?.value || 1)
                    return sum + (price * qty)
                }, 0),
                length: totalLength,
                breadth: totalBreadth,
                height: totalHeight,
                weight: totalWeight,
            }

            // Create order
            const orderCreated = await (await this.getSharedAxios())
                .post<ShiprocketCreateOrderResponse>("/orders/create/adhoc", orderData)
                .catch((err) => {
                    const apiError = err?.response?.data?.errors
                    if (apiError) {
                        const firstError = Object.values(apiError)[0]
                        const msg = Array.isArray(firstError) ? firstError[0] : firstError
                        throw new MedusaError(MedusaError.Types.INVALID_DATA, `Shiprocket: ${msg}`)
                    }
                    throw err
                })

            if (!orderCreated.data?.shipment_id) {
                throw new MedusaError(
                    MedusaError.Types.INVALID_DATA,
                    "Shiprocket order created but no shipment ID returned"
                )
            }

            // Try to get preferred courier based on SHIPROCKET_DELIVERY_PREFERENCE env
            let courierId: number | null = null
            try {
                const manager = getShiprocketManager()
                const pickupPincode = shipping.postal_code || shipping.zip
                const deliveryPincode = billing.postal_code || billing.zip
                if (pickupPincode && deliveryPincode) {
                    courierId = await manager.getPreferredCourier({
                        pickup_postcode: pickupPincode,
                        delivery_postcode: deliveryPincode,
                        weight: totalWeight,
                        cod: order.payment_status === 'awaiting' ? 1 : 0,
                    })
                }
            } catch {
                // Fallback to auto-assign if courier selection fails
            }

            // Assign AWB with optional courier_id
            const awbPayload: any = { shipment_id: orderCreated.data.shipment_id }
            if (courierId) {
                awbPayload.courier_id = courierId
            }
            const awbCreated = await (await this.getSharedAxios()).post("/courier/assign/awb", awbPayload)

            if (awbCreated.data.awb_assign_status !== 1) {
                // Cancel order to avoid stuck state
                try { await this.cancel(orderCreated.data.order_id) } catch { /* ignore */ }

                throw new MedusaError(
                    MedusaError.Types.NOT_ALLOWED,
                    awbCreated.data.message || "AWB assignment failed - no courier available"
                )
            }

            const responseData = awbCreated.data.response.data

            return {
                ...orderCreated.data,
                awb: responseData.awb_code,
                courier_company_id: responseData.courier_company_id,
                courier_name: responseData.courier_name || orderCreated.data.courier_name,
                tracking_number: responseData.awb_code,
                tracking_url: `https://shiprocket.co/tracking/${responseData.awb_code}`,
            }

        } catch (error: any) {
            if (error instanceof MedusaError) throw error
            handleError(error, { operation: "create", orderId: order?.id })
        }
    }

    /**
     * Cancel an order in Shiprocket
     */
    async cancel(orderId: string): Promise<void> {
        try {
            await (await this.getSharedAxios()).post("/orders/cancel", { ids: [orderId] })
        } catch (error: any) {
            // Check if the order is already cancelled using specific status code / message
            const apiError = error?.response?.data
            const messageStr = JSON.stringify(apiError).toLowerCase()

            if (messageStr.includes("already cancelled") || messageStr.includes("already canceled") || error?.response?.status === 400 && messageStr.includes("cannot cancel")) {
                console.log(`[Shiprocket] Order ${orderId} is already cancelled/cannot be cancelled. Skipping error.`)
                return // Idempotent success
            }

            handleError(error, { operation: "cancel", orderId })
        }
    }

    /**
     * Get tracking information for a shipment
     */
    async getTrackingInfo(trackingNumber: string): Promise<ShiprocketTrackingResponse> {
        try {
            const response = await (await this.getSharedAxios()).get<ShiprocketTrackingResponse>(
                `/courier/track/awb/${trackingNumber}`
            )
            return response.data
        } catch (error: any) {
            handleError(error, { operation: "tracking" })
        }
    }

    /**
     * Create a return order in Shiprocket
     */
    async createReturn(fulfillment: any): Promise<ShiprocketCreateOrderResponse> {
        const returnData = {
            order_id: `${fulfillment.id}-${Math.floor(Date.now() / 1000)}`,
            order_date: new Date().toISOString().split("T")[0],
            pickup_customer_name: fulfillment.pickup_address?.first_name,
            pickup_last_name: fulfillment.pickup_address?.last_name || "",
            pickup_address: fulfillment.pickup_address?.address_1,
            pickup_address_2: fulfillment.pickup_address?.address_2 || "",
            pickup_city: fulfillment.pickup_address?.city,
            pickup_state: fulfillment.pickup_address?.province,
            pickup_country: fulfillment.pickup_address?.country_code || "India",
            pickup_pincode: fulfillment.pickup_address?.postal_code,
            pickup_email: fulfillment.email,
            pickup_phone: fulfillment.pickup_address?.phone,
            order_items: fulfillment.items?.map((item: any) => ({
                name: item.title,
                sku: item.sku,
                units: item.quantity,
                selling_price: item.unit_price,
                discount: "",
                qc_enable: false,
            })) || [],
            payment_method: "Prepaid",
            total_discount: "0",
            sub_total: fulfillment.sub_total || 0,
            length: 10,
            breadth: 10,
            height: 10,
            weight: 0.5,
        }

        try {
            const response = await (await this.getSharedAxios()).post("/orders/create/return", returnData)
            return response.data
        } catch (error: any) {
            handleError(error, { operation: "createReturn" })
        }
    }

    /**
     * Generate documents (manifest, label, invoice) for a shipment
     */
    async createDocuments(fulfillment: any): Promise<{
        manifest: string
        label: string
        invoice: string
    }> {
        const safePost = async (url: string, data: any) =>
            (await this.getSharedAxios()).post(url, data).catch((err) => {
                console.error(`Shiprocket API error at ${url}:`, err?.response?.data || err.message)
                return { data: null }
            })

        // Shiprocket expects arrays for IDs even if it's just one
        const [manifestRes, labelRes, invoiceRes] = await Promise.all([
            safePost("/manifests/generate", { order_ids: [fulfillment.shipment_id] }),
            safePost("/courier/generate/label", { shipment_id: [fulfillment.shipment_id] }),
            safePost("/orders/print/invoice", { ids: [fulfillment.order_id] }),
        ])

        const extractUrl = (res: any, key: string, checkKey?: string, checkVal?: any) => {
            if (!res?.data) return ""
            const item = Array.isArray(res.data) ? res.data[0] : res.data

            // Handle cases where Shiprocket returns { status: 1, manifest_url: "..." }
            const data = res.data?.data || res.data
            const target = Array.isArray(data) ? data[0] : data

            if (!target) return ""
            if (checkKey && target[checkKey] !== checkVal) return ""
            return target[key] || ""
        }

        return {
            manifest: extractUrl(manifestRes, "manifest_url", "status", 1),
            label: extractUrl(labelRes, "label_url", "label_created", 1),
            invoice: extractUrl(invoiceRes, "invoice_url", "is_invoice_created", true),
        }
    }

    /**
     * Generate label for a shipment
     */
    async generateLabel(fulfillment: any): Promise<string> {
        try {
            const res = await (await this.getSharedAxios()).post("/courier/generate/label", {
                shipment_id: [fulfillment.shipment_id],
            })
            const data = res.data?.data || res.data
            const item = Array.isArray(data) ? data[0] : data
            return item?.label_url || ""
        } catch {
            return ""
        }
    }

    /**
     * Generate invoice for an order
     */
    async generateInvoice(fulfillment: any): Promise<string> {
        try {
            const res = await (await this.getSharedAxios()).post("/orders/print/invoice", {
                ids: [fulfillment.order_id],
            })
            const data = res.data?.data || res.data
            const item = Array.isArray(data) ? data[0] : data
            return item?.invoice_url || ""
        } catch {
            return ""
        }
    }
}
