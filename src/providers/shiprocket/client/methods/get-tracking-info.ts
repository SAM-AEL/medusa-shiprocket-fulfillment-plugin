import { AxiosInstance } from "axios"
import { MedusaError } from "@medusajs/utils"
import { handleError } from "../core/handle-error"
import { ShiprocketTrackingResponse } from "../types"

/**
 * Gets the tracking information for a shipment.
 * @param axios - The Axios instance to use for the request.
 * @param trackingNumber - The tracking number of the shipment.
 * @returns The tracking information.
 */
export const getTrackingInfo = async (
    axios: AxiosInstance,
    trackingNumber: string
): Promise<ShiprocketTrackingResponse> => {
    try {
        const response = await axios.get<ShiprocketTrackingResponse>(
            `/courier/track/awb/${trackingNumber}`
        )
        return response.data
    } catch (error) {
        handleError(error)
        throw new MedusaError(
            MedusaError.Types.UNEXPECTED_STATE,
            "Tracking info retrieval failed unexpectedly"
        )
    }
}
