import { MedusaError } from "@medusajs/utils"
import { AxiosInstance } from "axios"
import { handleError } from "../core/handle-error"
import { ShiprocketCalculateRateRequest, ShiprocketCalculateRateResponse } from "../types"

/**
 * Calculates the shipping rate for a given order.
 * @param axios - The Axios instance to use for the request.
 * @param data - The data needed to calculate the rate.
 * @returns The calculated shipping rate.
 */
export const calculate = async (
    axios: AxiosInstance,
    data: ShiprocketCalculateRateRequest
): Promise<number> => {
    try {
        const response = await axios.get<ShiprocketCalculateRateResponse>(
            "/courier/serviceability/",
            { params: data }
        )

        const availableCouriers = response.data.data.available_courier_companies

        if (!availableCouriers?.length) {
            throw new MedusaError(
                MedusaError.Types.NOT_FOUND,
                "No couriers available for this route"
            )
        }

        // Filter by allowed courier IDs if specified
        const filtered = data.allowed_courier_ids?.length
            ? availableCouriers.filter((c) =>
                data.allowed_courier_ids!.includes(c.id)
            )
            : availableCouriers

        if (!filtered?.length) {
            throw new MedusaError(
                MedusaError.Types.NOT_FOUND,
                "No allowed couriers available for this route"
            )
        }

        // Get the cheapest courier
        const cheapest = filtered.reduce((min, curr) =>
            Number(curr.rate) < Number(min.rate) ? curr : min
        )

        return Math.ceil(Number(cheapest?.rate) || 0)
    } catch (error) {
        handleError(error)
        throw new MedusaError(
            MedusaError.Types.UNEXPECTED_STATE,
            "Rate calculation failed unexpectedly"
        )
    }
}
