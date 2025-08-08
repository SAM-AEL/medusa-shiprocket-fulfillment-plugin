import { MedusaError } from "@medusajs/utils"
import { AxiosInstance } from "axios"
import { handleError } from "../core/handle-error"
import { ShiprocketAuthResponse } from "../types"

/**
 * Authenticates with the Shiprocket API to get a token.
 * @param axios - The Axios instance to use for the request.
 * @param email - The user's email.
 * @param password - The user's password.
 * @param isDisposed - Whether the client is disposed.
 * @returns The authentication token and its expiry time.
 */
export const authenticate = async (
    axios: AxiosInstance,
    email: string,
    password: string,
    isDisposed: boolean
): Promise<{ token: string; tokenExpiry: number }> => {
    if (isDisposed) {
        throw new MedusaError(
            MedusaError.Types.UNEXPECTED_STATE,
            "Cannot authenticate disposed client"
        )
    }

    try {
        const response = await axios.post<ShiprocketAuthResponse>("/auth/login", {
            email,
            password,
        })

        if (!response.data.token) {
            throw new MedusaError(
                MedusaError.Types.INVALID_DATA,
                "No token received in authentication response"
            )
        }

        return {
            token: response.data.token,
            // Token valid for 10 days, refresh after 8
            tokenExpiry: Date.now() + 8 * 24 * 60 * 60 * 1000,
        }
    } catch (error) {
        handleError(error)
        throw new MedusaError(
            MedusaError.Types.UNEXPECTED_STATE,
            "Authentication failed unexpectedly"
        )
    }
}
