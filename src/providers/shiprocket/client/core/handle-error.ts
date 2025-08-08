import { MedusaError } from "@medusajs/utils"
import { AxiosError, ShiprocketError } from "../types"

export const handleError = (error: AxiosError<ShiprocketError>): never => {
    const message = error.response?.data?.message || error.message
    const code = error.response?.status || 500

    if (code === 401) {
        throw new MedusaError(
            MedusaError.Types.UNAUTHORIZED,
            "Authentication failed with Shiprocket"
        )
    }

    if (code === 429) {
        throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            "Rate limit exceeded. Please try again later."
        )
    }

    if (code === 400 && error.response?.data?.errors) {
        const validationErrors = Object.entries(error.response.data.errors)
            .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(", ") : msgs}`)
            .join("; ")
        throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            `Validation failed: ${validationErrors}`
        )
    }

    throw new MedusaError(
        code === 404
            ? MedusaError.Types.NOT_FOUND
            : code === 400
            ? MedusaError.Types.INVALID_DATA
            : MedusaError.Types.UNEXPECTED_STATE,
        message
    )
}
