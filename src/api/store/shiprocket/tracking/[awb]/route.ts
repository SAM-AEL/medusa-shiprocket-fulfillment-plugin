import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// Module identifier - must match what's registered in medusa-config.ts
const SHIPROCKET_TRACKING_MODULE = "shiprocketTrackingModuleService"

/**
 * Public Tracking API
 * 
 * URL: GET /store/shiprocket/tracking/:awb
 * 
 * Returns tracking status and scan history for a shipment.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
    let { awb } = req.params

    // Fallback: parse from URL if params is empty
    if (!awb && req.url) {
        const parts = req.url.split('/')
        const lastPart = parts[parts.length - 1]
        // Remove query params if any
        awb = lastPart.split('?')[0]
    }

    if (!awb) {
        return res.status(400).json({
            success: false,
            error: "AWB parameter is required"
        })
    }

    try {
        const trackingService = req.scope.resolve<any>(SHIPROCKET_TRACKING_MODULE)

        const tracking = await trackingService.findByAwb(awb)

        if (!tracking) {
            return res.status(404).json({
                success: false,
                error: "Tracking not found"
            })
        }

        // Security: Check ownership if linked to a Medusa Order
        if (tracking.medusa_order_id) {
            try {
                // Attempt to verify ownership
                const orderModule = req.scope.resolve("order")
                const order = await orderModule.retrieveOrder(tracking.medusa_order_id, {
                    select: ["customer_id"]
                })

                // Get current user from auth context
                const actorId = (req as any).auth_context?.actor_id

                // If order has a customer and it doesn't match the requester
                if (order.customer_id && order.customer_id !== actorId) {
                    return res.status(403).json({
                        success: false,
                        error: "Access denied. You do not own this order."
                    })
                }
            } catch (e) {
                // Ownership verification failed - deny access for security
                const logger = req.scope.resolve("logger")
                logger.warn(`Tracking ownership check failed for AWB ${awb}: ${(e as Error).message}`)

                // If the error is not "order not found", deny access
                // (order not found shouldn't happen if ID exists, so it's likely a system error)
                if (!(e as Error).message.toLowerCase().includes("not found")) {
                    return res.status(403).json({
                        success: false,
                        error: "Access denied. Unable to verify order ownership."
                    })
                }
            }
        }

        // Return cleaned tracking data
        return res.status(200).json({
            success: true,
            tracking: {
                awb: tracking.awb,
                courier_name: tracking.courier_name,
                current_status: tracking.current_status,
                current_status_id: tracking.current_status_id,
                shipment_status: tracking.shipment_status,
                shipment_status_id: tracking.shipment_status_id,
                current_timestamp: tracking.current_timestamp,
                etd: tracking.etd,
                is_return: tracking.is_return,
                pod_status: tracking.pod_status,
                scans: tracking.scans || [],
                updated_at: tracking.updated_at,
            },
        })
    } catch (error: any) {
        const logger = req.scope.resolve("logger")
        logger.error(`Tracking API error: ${error.message}`, error)
        return res.status(500).json({
            success: false,
            error: "Internal server error"
        })
    }
}
