import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils";
import {
    CalculatedShippingOptionPrice,
    CalculateShippingOptionPriceDTO,
    CreateFulfillmentResult,
    CreateShippingOptionDTO,
    FulfillmentDTO,
    FulfillmentItemDTO,
    FulfillmentOption,
    FulfillmentOrderDTO,
    Logger,
} from "@medusajs/framework/types";

import ShiprocketClient from "./client";
import {
    ShiprocketTrackingResponse,
    ShiprocketCreateOrderResponse,
} from "./types";

type InjectedDependencies = {
    logger: Logger;
};

type Options = {
    email: string;
    password: string;
    pickup_location?: string;
    cod?: 0 | 1 | "true" | "false";
};

class ShipRocketFulfillmentProviderService extends AbstractFulfillmentProviderService {
    static identifier = "shiprocket";

    protected logger_: Logger;
    protected options_: Options;
    protected client: ShiprocketClient;

    constructor({ logger }: InjectedDependencies, options: Options) {
        super();
        this.logger_ = logger;
        this.options_ = options;
        this.client = new ShiprocketClient({
            email: options.email,
            password: options.password,
            pickup_location: options.pickup_location,
        });
    }

    /**
     * Fulfillment Options
     * @returns
     */
    async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
        /**
         * replace working code with this if you want access to specific courier partners instead of generic ones
         */
        // const services = await this.client.getCourierServices();
        // const fulfillmentOptions = services["courier_data"].map((service: any) => ({
        //   id: service.name + "_" + service.id,
        //   name: service.name,
        //   is_return: false,
        // }));

        const fulfillmentOptions = [
            {
                id: "Standard Shipping",
                name: "Standard Shipping",
                is_return: false,
            },
            {
                id: "Express Shipping",
                name: "Express Shipping",
                is_return: false,
            }
        ];

        return fulfillmentOptions;
    }

    /**
     * Can Calculate rates on checkout.
     * @param data
     * @returns true
     */
    async canCalculate(data: CreateShippingOptionDTO): Promise<boolean> {
        return true;
    }

    /**
     * Calculate rates on checkout.
     * @param optionData
     * @param data
     * @param context
     * @returns
     */
    async calculatePrice(
        optionData: CalculateShippingOptionPriceDTO["optionData"],
        data: CalculateShippingOptionPriceDTO["data"],
        context: CalculateShippingOptionPriceDTO["context"]
    ): Promise<CalculatedShippingOptionPrice> {

        const params = {
            pickup_postcode: context["from_location"]?.address?.postal_code as string,
            delivery_postcode: context["shipping_address"]?.postal_code as string,
            weight: (context["items"]?.[0]?.metadata?.weight || 0.490) as number,
            cod: (this.options_.cod !== "true") ? 0 : 1 as 0 | 1,
        };

        if (!params.pickup_postcode || !params.delivery_postcode) {
            throw new Error("Both pickup and delivery postcodes are required for rate calculation.");
        }

        const price = await this.client.calculate(params);

        return {
            calculated_amount: price,
            is_calculated_price_tax_inclusive: true,
        };
    }

    /**
     * Creates a fulfillment in Shiprocket.
     * @param data - The fulfillment data.
     * @param items - The items to be fulfilled.
     * @param order - The order to be fulfilled.
     * @param fulfillment - The fulfillment to be created.
     * @returns The created fulfillment data.
     */
    async createFulfillment(
        data: Record<string, unknown>,
        items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
        order: Partial<FulfillmentOrderDTO> | undefined,
        fulfillment: Partial<Omit<FulfillmentDTO, "provider_id">>
    ): Promise<CreateFulfillmentResult> {

        // client creates a fulfillment (create order + awb + pickup)
        const externalData = await this.client.create(fulfillment, items, order);

        return {
            data: {
                ...((fulfillment as object) || {}),
                ...externalData,
            },
            labels: [
                {
                    tracking_number: externalData.tracking_number || "",
                    tracking_url: externalData.tracking_url || "",
                    label_url: externalData.label_url || "",
                },
            ],
        };
    }

    /**
     * Cancels a fulfillment in Shiprocket.
     * @param data - The fulfillment data, containing the order_id.
     * @returns
     */
    async cancelFulfillment(data: Record<string, unknown>): Promise<any> {

        const { order_id } = data as {
            order_id: string;
        };

        if (!order_id) throw new Error("external_id is required for cancellation");

        await this.client.cancel(order_id);
    }

    /**
     * Creates a return fulfillment in Shiprocket.
     * @param fulfillment - The fulfillment to be returned.
     * @returns The created return fulfillment data.
     */
    async createReturnFulfillment(
        fulfillment: Record<string, unknown>
    ): Promise<CreateFulfillmentResult> {
        const externalData = await this.client.createReturn(fulfillment);
        return {
            data: {
                ...((fulfillment as object) || {}),
                ...externalData,
            },
            labels: [
                {
                    tracking_number: externalData.tracking_number || "",
                    tracking_url: externalData.tracking_url || "",
                    label_url: externalData.label_url || "",
                },
            ],
        };
    }

    /**
     * Gets fulfillment documents from Shiprocket.
     * @param data - The fulfillment data.
     * @returns An empty array, as this feature is not yet implemented.
     */
    async getFulfillmentDocuments(data: Record<string, unknown>): Promise<never[]> {
        return [];
    }

    /**
     * Gets return documents from Shiprocket.
     * @param data - The return data.
     * @returns An empty array, as this feature is not yet implemented.
     */
    async getReturnDocuments(data: Record<string, unknown>): Promise<never[]> {
        return [];
    }

    /**
     * Gets shipment documents from Shiprocket.
     * @param data - The shipment data.
     * @returns An empty array, as this feature is not yet implemented.
     */
    async getShipmentDocuments(data: Record<string, unknown>): Promise<never[]> {
        return [];
    }

    /**
     * Retrieves documents from Shiprocket.
     * @param fulfillmentData - The fulfillment data.
     * @param documentType - The type of document to retrieve.
     */
    async retrieveDocuments(
        fulfillmentData: Record<string, unknown>,
        documentType: string
    ): Promise<void> {
        this.logger_.debug("Document retrieval not supported");
    }

    /**
     * Validate fulfillment data
     * @param optionData - The shipping option data
     * @param data - The fulfillment data
     * @param context - Additional context
     */
    async validateFulfillmentData(
        optionData: Record<string, unknown>,
        data: Record<string, unknown>,
        context: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        // We can use any unique identifier here since it will be overwritten by the shipment ID
        return {
            ...data,
            external_id: `temp_${Date.now()}`,
        };
    }

    /**
     * Validate shipping option
     * @param data - The option data to validate
     */
    async validateOption(data: Record<string, unknown>): Promise<boolean> {
        return data.external_id !== undefined;
    }

    /**
     * Get tracking information for a fulfillment
     * @param trackingNumber - The tracking number to look up
     */
    async getTrackingInfo(trackingNumber: string): Promise<ShiprocketTrackingResponse> {
        try {
            const trackingData = await this.client.getTrackingInfo(trackingNumber);
            // Adapt the client response to match the expected ShiprocketTrackingResponse type
            const adaptedTrackingData: ShiprocketTrackingResponse = {
                ...trackingData,
                tracking_data: {
                    ...trackingData.tracking_data,
                    shipment_track: trackingData.tracking_data.scans
                        ? trackingData.tracking_data.scans.map((scan: any) => ({
                            date: scan.date,
                            status: scan.activity, // or scan.status if available
                            activity: scan.activity,
                            location: scan.location,
                        }))
                        : [],
                },
            };
            return adaptedTrackingData;
        } catch (error) {
            this.logger_.error(`Failed to get tracking info for ${trackingNumber}: ${error}`);
            throw error;
        }
    }

    /**
     * Get shipment status for a fulfillment
     * @param shipmentId - The Shiprocket shipment ID
     */
    async getShipmentStatus(shipmentId: string): Promise<ShiprocketCreateOrderResponse> {
        try {
            const statusData = await this.client.getShipmentStatus(shipmentId);
            // Convert courier_company_id to string if it's a number
            const fixedStatusData = {
                ...statusData,
                courier_company_id: statusData.courier_company_id !== undefined
                    ? String(statusData.courier_company_id)
                    : undefined,
            };
            return fixedStatusData;
        } catch (error) {
            this.logger_.error(`Failed to get shipment status for ${shipmentId}: ${error}`);
            throw error;
        }
    }
}

export default ShipRocketFulfillmentProviderService;
