import { MedusaError } from "@medusajs/utils"
import { AxiosInstance } from "axios"
import { handleError } from "../core/handle-error"
import { ShiprocketCreateOrderResponse } from "../types"

/**
 * Creates a new fulfillment in Shiprocket.
 * @param axios - The Axios instance to use for the request.
 * @param pickup_location - The pickup location for the fulfillment.
 * @param fulfillment - The fulfillment data.
 * @param items - The items in the fulfillment.
 * @param order - The order associated with the fulfillment.
 * @returns The created order data.
 */
export const create = async (
    axios: AxiosInstance,
    pickup_location: string | undefined,
    fulfillment: any,
    items: any[],
    order: any
): Promise<ShiprocketCreateOrderResponse> => {
    try {
        // Format order_date as d-m-Y H:i (Shiprocket expects DD-MM-YYYY HH:mm)
        const createdAt = new Date(order.created_at)
        const pad = (n: number) => n.toString().padStart(2, '0')
        const order_date = `${pad(createdAt.getDate())}-${pad(createdAt.getMonth() + 1)}-${createdAt.getFullYear()} ${pad(createdAt.getHours())}:${pad(createdAt.getMinutes())}`

        // Calculate sub_total for current fulfillment: use fulfillment quantity, but unit price from order.items
        const totalCost = items.reduce((sum, it) => {

            // Find the matching order item by line_item_id
            const orderItem = Array.isArray(order.items)
                ? order.items.find((oi: any) => oi.id === it.line_item_id)
                : null
            const unit = Number(orderItem?.unit_price ?? orderItem?.detail?.unit_price ?? 0)

            const qty = Number(it?.quantity ?? it?.raw_quantity?.value ?? 0)

            if (isNaN(unit) || isNaN(qty)) {
                throw new MedusaError(
                    MedusaError.Types.INVALID_DATA,
                    `Invalid unit price or quantity for fulfillment item: ${JSON.stringify(it)} (order item: ${JSON.stringify(orderItem)})`
                )
            }
            return sum + unit * qty
        }, 0)

        // Helper to get a safe value or fallback
        const safe = (v: any, fallback: any) => v != null ? v : fallback

        // Use shipping_address for shipping fields, customer for billing
        const shipping = order.shipping_address || fulfillment?.delivery_address || {}
        const billing = order.customer || {}
        const region = order.region || {}

        // Default dimensions/weight if missing
        const defaultWeight = 0.5
        const defaultLength = 10
        const defaultBreadth = 15
        const defaultHeight = 20

        const orderData = {
            order_id: order.id + "-" + Math.random().toString().slice(2, 12),
            order_date,
            pickup_location: pickup_location || "Primary",
            billing_customer_name: safe(billing.first_name, ""),
            billing_last_name: safe(billing.last_name, ""),
            billing_address: safe(shipping.address_1, ""),
            billing_address_2: safe(shipping.address_2, ""),
            billing_city: safe(shipping.city, ""),
            billing_pincode: safe(shipping.postal_code, ""),
            billing_state: safe(shipping.province, ""),
            billing_country: safe(region.name, "India"),
            billing_email: safe(billing.email, ""),
            billing_phone: safe(shipping.phone, ""),
            shipping_is_billing: true,
            shipping_customer_name: safe(shipping.first_name, ""),
            shipping_last_name: safe(shipping.last_name, ""),
            shipping_address: safe(shipping.address_1, ""),
            shipping_address_2: safe(shipping.address_2, ""),
            shipping_city: safe(shipping.city, ""),
            shipping_pincode: safe(shipping.postal_code, ""),
            shipping_country: safe(region.name, "India"),
            shipping_state: safe(shipping.province, ""),
            shipping_email: safe(billing.email, ""),
            shipping_phone: safe(shipping.phone, ""),
            order_items: items.map(item => {
                // Try to get variant fields, fallback to defaults
                const variant = item.variant || {}
                const selling_price = Math.round(Number(item.unit_price || item.detail?.unit_price || 0))
                return {
                    name: item.title,
                    sku: variant.sku || item.sku || item.id,
                    units: Number(item.quantity || item.raw_quantity?.value || 1),
                    selling_price,
                    hsn: variant.hs_code || "",
                    weight: safe(variant.weight, defaultWeight),
                    length: safe(variant.length, defaultLength),
                    breadth: safe(variant.width, defaultBreadth),
                    height: safe(variant.height, defaultHeight),
                }
            }),
            payment_method: "Prepaid",
            shipping_charges: 0,
            giftwrap_charges: 0,
            transaction_charges: 0,
            total_discount: Number(order.discount_total || 0),
            sub_total: totalCost,
            length: defaultLength,
            breadth: defaultBreadth,
            height: defaultHeight,
            weight: defaultWeight
        }

        const orderCreated = await axios.post<ShiprocketCreateOrderResponse>(
            "/orders/create/adhoc",
            orderData
        )

        if (!orderCreated.data?.shipment_id) {
            throw new MedusaError(
                MedusaError.Types.INVALID_DATA,
                "Failed to create Shiprocket order"
            )
        }

        const awbCreated = await axios.post(
            `/courier/assign/awb`,
            {
                shipment_id: orderCreated.data.shipment_id,
                courier_id: orderCreated.data.courier_company_id,
            }
        )

        return {
            order_id: awbCreated.data.response.data.order_id,
            shipment_id: awbCreated.data.response.data.shipment_id,
            status: orderCreated.data.status,
            status_code: orderCreated.data.status_code,
            awb: awbCreated.data.response.data.awb_code,
            courier_company_id: awbCreated.data.response.data.courier_company_id,
            courier_name: orderCreated.data.courier_name,
            tracking_number: awbCreated.data.response.data.awb_code,
            tracking_url: "https://shiprocket.co/tracking/" + awbCreated.data.response.data.awb_code,
            label_url: orderCreated.data.label_url,
        }

    } catch (error) {
        handleError(error)
        throw new MedusaError(
            MedusaError.Types.UNEXPECTED_STATE,
            "Order creation failed unexpectedly"
        )
    }
}
