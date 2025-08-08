
import axios, { AxiosInstance, AxiosError } from "axios";
import { filterAllowedCouriers, getCheapestCourier, slugify } from "../utils"
import { MedusaError } from "@medusajs/framework/utils";
import {
    ShiprocketClientOptions,
    ShiprocketAuthResponse,
    ShiprocketCalculateRateRequest,
    ShiprocketCalculateRateResponse,
    ShiprocketCreateOrderRequest,
    ShiprocketCreateOrderResponse,
    ShiprocketCancelOrderRequest,
    ShiprocketTrackingResponse,
    ShiprocketError
} from "../types";

class ShiprocketClient {
    private email: string;
    private password: string;
    private pickup_location?: string;
    private axios: AxiosInstance;
    // IMPORTANT: Token is sensitive data - never log or expose
    private token: string | null = null;
    // IMPORTANT: Token expiry is critical for security
    private tokenExpiry: number | null = null;
    // IMPORTANT: Must be cleared on cleanup
    private refreshTimeout: NodeJS.Timeout | null = null;
    // IMPORTANT: Flag to track if instance is disposed
    private isDisposed = false;

    constructor(options: ShiprocketClientOptions) {
        if (!options.email || !options.password) {
            throw new MedusaError(MedusaError.Types.INVALID_DATA, "Shiprocket API credentials are required");
        }
        this.email = options.email;
        this.password = options.password;
        this.pickup_location = options.pickup_location;
        this.axios = axios.create({
            baseURL: "https://apiv2.shiprocket.in/v1/external",
            headers: {
                "Content-Type": "application/json",
            },
            timeout: 10000, // IMPORTANT: 10s timeout to prevent hanging requests
        });

        // IMPORTANT: Ensure cleanup on process exit
        process.on('beforeExit', () => this.dispose());
    }

    // IMPORTANT: Cleanup method to prevent memory leaks
    dispose(): void {
        if (this.isDisposed) return;
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
            this.refreshTimeout = null;
        }
        this.token = null;
        this.tokenExpiry = null;
        this.isDisposed = true;
    }

    /**
     * Handle Shiprocket API errors
     */
    private handleError(error: AxiosError<ShiprocketError>): never {
        const message = error.response?.data?.message || error.message;
        const code = error.response?.status || 500;

        if (code === 401) {
            throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Authentication failed");
        }

        if (code === 429) {
            throw new MedusaError(
                MedusaError.Types.INVALID_DATA,
                "Rate limit exceeded. Please try again later."
            );
        }

        // Handle validation errors from Shiprocket
        if (code === 400 && error.response?.data?.errors) {
            const validationErrors = Object.entries(error.response.data.errors)
                .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
                .join('; ');
            throw new MedusaError(
                MedusaError.Types.INVALID_DATA,
                `Validation failed: ${validationErrors}`
            );
        }

        throw new MedusaError(
            code === 404 ? MedusaError.Types.NOT_FOUND :
                code === 400 ? MedusaError.Types.INVALID_DATA :
                    MedusaError.Types.UNEXPECTED_STATE,
            message
        );
    }

    /**
     * Authenticate and store the token
     * Token is valid for 10 days. Refresh before expiry.
     */
    async authenticate(): Promise<void> {
        if (this.isDisposed) {
            throw new MedusaError(
                MedusaError.Types.UNEXPECTED_STATE,
                "Cannot authenticate disposed client"
            );
        }

        // IMPORTANT: Maximum retry attempts for authentication
        const MAX_RETRIES = 3;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await this.axios.post<ShiprocketAuthResponse>("/auth/login", {
                    email: this.email,
                    password: this.password,
                });

                // IMPORTANT: Validate token from response
                if (!response.data.token) {
                    throw new MedusaError(
                        MedusaError.Types.INVALID_DATA,
                        "No token received in authentication response"
                    );
                }

                this.token = response.data.token;
                // IMPORTANT: Set expiry to 9 days to ensure refresh before actual 10-day expiry
                this.tokenExpiry = Date.now() + 9 * 24 * 60 * 60 * 1000;
                this.axios.defaults.headers.common["Authorization"] = `Bearer ${this.token}`;

                // IMPORTANT: Schedule refresh after 8 days
                if (this.refreshTimeout) clearTimeout(this.refreshTimeout);
                this.refreshTimeout = setTimeout(() => {
                    this.authenticate().catch(error => {
                        console.error("[CRITICAL] Failed to refresh Shiprocket token:", error);
                        // IMPORTANT: Emit event or notify monitoring system
                    });
                }, 8 * 24 * 60 * 60 * 1000); // 8 days in ms

                // IMPORTANT: Authentication successful, exit retry loop
                return;
            } catch (error) {
                lastError = error as Error;
                // IMPORTANT: Wait before retry, with exponential backoff
                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
                }
            }
        }

        // IMPORTANT: All retries failed
        this.handleError(lastError as AxiosError<ShiprocketError>);
    }

    /**
     * Ensure token is valid before each request
     */
    private async ensureAuthenticated(): Promise<void> {
        if (!this.token || !this.tokenExpiry || Date.now() > this.tokenExpiry) {
            await this.authenticate();
        }
    }

    /**
     * Calculate the Cheapest Courier Service [allowed list]
     */
    async calculate(data: ShiprocketCalculateRateRequest): Promise<number> {
        await this.ensureAuthenticated();

        try {
            const response = await this.axios.post<ShiprocketCalculateRateResponse>(
                "/courier/serviceability/",
                data
            );

            const availableCouriers = response.data.data.available_courier_companies;

            if (!availableCouriers?.length) {
                throw new MedusaError(MedusaError.Types.NOT_FOUND, "No couriers available for this route");
            }

            const filtered = data.allowed_courier_ids?.length
                ? filterAllowedCouriers(availableCouriers, data.allowed_courier_ids)
                : availableCouriers;

            if (!filtered?.length) {
                throw new MedusaError(MedusaError.Types.NOT_FOUND, "No allowed couriers available for this route");
            }

            const cheapest = getCheapestCourier(filtered);
            return Math.ceil(Number(cheapest?.rate) || 0);
        } catch (error) {
            this.handleError(error as AxiosError<ShiprocketError>);
        }
    }

    /**
     * Create order and generate shipment
     */
    async create(fulfillment: any, items: any[], order: any): Promise<ShiprocketCreateOrderResponse> {
        await this.ensureAuthenticated();

        const payload: ShiprocketCreateOrderRequest = {
            order_id: fulfillment.id || order.id || `order_${Date.now()}`,
            order_date: new Date().toISOString(),
            pickup_location: this.pickup_location || "Primary",
            billing_customer_name: fulfillment.delivery_address?.first_name || "",
            billing_last_name: fulfillment.delivery_address?.last_name,
            billing_address: fulfillment.delivery_address?.address_1 || "",
            billing_address_2: fulfillment.delivery_address?.address_2,
            billing_city: fulfillment.delivery_address?.city || "",
            billing_pincode: fulfillment.delivery_address?.postal_code || "",
            billing_state: fulfillment.delivery_address?.province || "",
            billing_country: fulfillment.delivery_address?.country_code || "",
            billing_email: fulfillment.delivery_address?.email || order.email || "",
            billing_phone: fulfillment.delivery_address?.phone || "",
            shipping_is_billing: true,
            order_items: items.map((item: any) => {
                const orderItem = order.items.find((i: any) => i.id === item.line_item_id);
                if (!orderItem) {
                    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Order item not found for line item ${item.line_item_id}`);
                }
                // Convert from cents to whole numbers and handle price extraction
                let selling_price = 0;
                if (typeof item.unit_price === 'number') {
                    selling_price = item.unit_price / 100;
                } else if (item.raw_unit_price?.value && typeof item.raw_unit_price.value === 'number') {
                    selling_price = item.raw_unit_price.value / 100;
                }
                // Ensure minimum price of 1 as required by Shiprocket
                selling_price = Math.max(1, Math.round(selling_price));
                return {
                    name: orderItem.title || "",
                    sku: orderItem.variant?.sku || slugify(`sku-${orderItem.title}`),
                    units: item.quantity || 1,
                    selling_price,
                    discount: item.discount_amount || 0,
                    tax: item.tax_amount || 0,
                    hsn: orderItem.variant?.hs_code || "",
                };
            }),
            payment_method: order.payment_method === "cod" ? "COD" : "Prepaid",
            sub_total: order.subtotal ? Math.round(order.subtotal / 100) : 0,
            length: fulfillment.length || 10,
            breadth: fulfillment.breadth || 10,
            height: fulfillment.height || 10,
            weight: fulfillment.weight || 1,
        };

        try {
            const order = await this.axios.post<ShiprocketCreateOrderResponse>(
                "/orders/create/adhoc",
                payload
            );

            const awbResponse = await this.requestAWB(order.data.shipment_id);
            // Format tracking URL according to Shiprocket's format
            const trackingUrl = awbResponse.awb ?
                `https://shiprocket.co/tracking/${awbResponse.awb}` :
                undefined;

            return {
                ...order.data,
                ...awbResponse,
                tracking_url: trackingUrl,
                tracking_number: awbResponse.awb,
                // Add label URL if available from Shiprocket's response
                label_url: order.data.label_url || `https://app.shiprocket.in/order/${order.data.shipment_id}/label`
            };
        } catch (error) {
            this.handleError(error as AxiosError<ShiprocketError>);
        }
    }

    /**
     * Request AWB number for shipment
     */
    private async requestAWB(shipmentId: string): Promise<Partial<ShiprocketCreateOrderResponse>> {
        try {
            const awb = await this.axios.post<{ awb_code: string; courier_company_id: string }>(
                "/courier/assign/awb",
                { shipment_id: shipmentId }
            );

            const pickup = await this.axios.post(
                "/courier/generate/pickup",
                { shipment_id: [shipmentId] }
            );

            return {
                awb: awb.data.awb_code,
                courier_company_id: awb.data.courier_company_id,
            };
        } catch (error) {
            this.handleError(error as AxiosError<ShiprocketError>);
        }
    }

    /**
     * Cancel order/shipment
     */
    async cancel(orderId: string): Promise<void> {
        await this.ensureAuthenticated();
        try {
            await this.axios.post<{ message: string }>(
                "/orders/cancel",
                { ids: [orderId] }
            );
        } catch (error) {
            this.handleError(error as AxiosError<ShiprocketError>);
        }
    }

    /**
     * Get tracking information
     */
    async getTrackingInfo(trackingNumber: string): Promise<ShiprocketTrackingResponse> {
        await this.ensureAuthenticated();
        try {
            const response = await this.axios.get<{
                tracking_data: ShiprocketTrackingResponse['tracking_data']
            }>(
                `/courier/track/shipment/${trackingNumber}`
            );

            // Format tracking data according to Medusa's expectations
            return {
                tracking_data: response.data.tracking_data,
                tracking_number: trackingNumber,
                tracking_url: `https://shiprocket.co/tracking/${trackingNumber}`,
                status: response.data.tracking_data?.track_status || response.data.tracking_data?.shipment_status || "unknown",
                data: response.data.tracking_data || {},
                raw_response: response.data
            };
        } catch (error) {
            this.handleError(error as AxiosError<ShiprocketError>);
        }
    }

    /**
     * Get order/shipment status
     */
    async getShipmentStatus(shipmentId: string): Promise<ShiprocketCreateOrderResponse> {
        await this.ensureAuthenticated();
        try {
            const response = await this.axios.get<ShiprocketCreateOrderResponse>(
                `/orders/show/${shipmentId}`
            );
            return response.data;
        } catch (error) {
            this.handleError(error as AxiosError<ShiprocketError>);
        }
    }

    /**
     * Create a return shipment (experimental)
     */
    async createReturn(fulfillment: any): Promise<ShiprocketCreateOrderResponse> {
        await this.ensureAuthenticated();

        const payload: ShiprocketCreateOrderRequest = {
            order_id: `return_${fulfillment.id || Date.now()}`,
            order_date: new Date().toISOString(),
            pickup_location: this.pickup_location || "Primary",
            billing_customer_name: fulfillment.shipping_address?.first_name || "",
            billing_last_name: fulfillment.shipping_address?.last_name,
            billing_address: fulfillment.shipping_address?.address_1 || "",
            billing_address_2: fulfillment.shipping_address?.address_2,
            billing_city: fulfillment.shipping_address?.city || "",
            billing_pincode: fulfillment.shipping_address?.postal_code || "",
            billing_state: fulfillment.shipping_address?.province || "",
            billing_country: fulfillment.shipping_address?.country_code || "",
            billing_email: fulfillment.shipping_address?.email || "",
            billing_phone: fulfillment.shipping_address?.phone || "",
            shipping_is_billing: false,
            shipping_customer_name: fulfillment.billing_address?.first_name || "",
            shipping_last_name: fulfillment.billing_address?.last_name,
            shipping_address: fulfillment.billing_address?.address_1 || "",
            shipping_city: fulfillment.billing_address?.city || "",
            shipping_pincode: fulfillment.billing_address?.postal_code || "",
            shipping_state: fulfillment.billing_address?.province || "",
            shipping_country: fulfillment.billing_address?.country_code || "",
            shipping_email: fulfillment.billing_address?.email || "",
            order_items: fulfillment.items.map((item: any) => ({
                name: item.title || "",
                sku: item.variant?.sku || slugify(`sku-${item.title}`),
                units: item.quantity || 1,
                // Convert from cents to whole numbers and handle price extraction
                selling_price: Math.max(1, Math.round(
                    typeof item.unit_price === 'number' ? item.unit_price / 100 :
                        (item.raw_unit_price?.value && typeof item.raw_unit_price.value === 'number' ? item.raw_unit_price.value / 100 : 0)
                )),
                discount: item.discount_amount || 0,
                tax: item.tax_amount || 0,
                hsn: item.variant?.hs_code || "",
            })),
            payment_method: "Prepaid",
            sub_total: fulfillment.subtotal || 0,
            length: fulfillment.length || 10,
            breadth: fulfillment.breadth || 10,
            height: fulfillment.height || 10,
            weight: fulfillment.weight || 1,
        };

        try {
            const response = await this.axios.post<ShiprocketCreateOrderResponse>(
                "/orders/create/return",
                payload
            );

            const awbResponse = await this.requestAWB(response.data.shipment_id);
            // Format tracking URL according to Shiprocket's format
            const trackingUrl = awbResponse.awb ?
                `https://shiprocket.co/tracking/${awbResponse.awb}` :
                undefined;

            return {
                ...response.data,
                ...awbResponse,
                tracking_url: trackingUrl,
                tracking_number: awbResponse.awb,
                // Add label URL if available from Shiprocket's response
                label_url: response.data.label_url || `https://app.shiprocket.in/order/${response.data.shipment_id}/label`
            };
        } catch (error) {
            this.handleError(error as AxiosError<ShiprocketError>);
        }
    }
}

export default ShiprocketClient;
