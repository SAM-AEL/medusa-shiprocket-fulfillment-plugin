import { AxiosInstance } from "axios"
import { handleError } from "../core/handle-error"

/**
 * Cancels an order in Shiprocket.
 * @param axios - The Axios instance to use for the request.
 * @param orderId - The ID of the order to cancel.
 */
export const cancel = async (
    axios: AxiosInstance,
    orderId: string
): Promise<void> => {
    try {
        await axios.post(`/orders/cancel`, {
            ids: [orderId],
        })
    } catch (error) {
        handleError(error)
    }
}
