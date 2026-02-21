import { AbstractFulfillmentProviderService, MedusaError } from "@medusajs/framework/utils";
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

type InjectedDependencies = {
    logger: Logger;
};

type Options = {
    email: string;
    password: string;
    pickup_location?: string;
    cod?: 0 | 1 | "true" | "false";
    timeout?: number;
};

class ShipRocketFulfillmentProviderService extends AbstractFulfillmentProviderService {
    static identifier = "shiprocket";

    protected logger_: Logger;
    protected options_: Options;
    protected client: ShiprocketClient;

    /**
     * Validates the plugin options at startup.
     * @param options - The plugin configuration options
     * @throws Error if required options are missing
     */
    static validateOptions(options: Record<string, unknown>): void {
        if (!options.email || typeof options.email !== "string") {
            throw new Error("Shiprocket plugin requires 'email' option (API user email)");
        }
        if (!options.password || typeof options.password !== "string") {
            throw new Error("Shiprocket plugin requires 'password' option (API user password)");
        }
        // Validate pickup_location if provided
        if (options.pickup_location && typeof options.pickup_location !== "string") {
            throw new Error("Shiprocket 'pickup_location' option must be a string");
        }
    }

    /**
     * Constructs a new instance of the ShipRocketFulfillmentProviderService.
     */
    constructor({ logger }: InjectedDependencies, options: Options) {
        super();
        this.logger_ = logger;
        this.options_ = options;
        this.client = new ShiprocketClient({
            email: options.email,
            password: options.password,
            pickup_location: options.pickup_location,
            timeout: options.timeout,
            logger: logger,
        });

        this.logger_.info("Shiprocket fulfillment provider initialized");
    }

    /**
     * Returns the fulfillment options for Shiprocket.
     */
    async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
        return [
            {
                id: "shiprocket-standard",
                name: "Standard Shipping",
                is_return: false,
            },
            {
                id: "shiprocket-return",
                name: "Return Shipping",
                is_return: true,
            },
        ];
    }

    /**
     * Determines whether the fulfillment option can calculate the shipping rate.
     */
    async canCalculate(_data: CreateShippingOptionDTO): Promise<boolean> {
        return true;
    }

    /**
     * Calculates the shipping rate for a given order.
     */
    async calculatePrice(
        _optionData: CalculateShippingOptionPriceDTO["optionData"],
        _data: CalculateShippingOptionPriceDTO["data"],
        context: CalculateShippingOptionPriceDTO["context"]
    ): Promise<CalculatedShippingOptionPrice> {
        const pickupPostcode = context["from_location"]?.address?.postal_code as string;
        const deliveryPostcode = context["shipping_address"]?.postal_code as string;

        if (!pickupPostcode) {
            this.logger_.warn(
                "Shiprocket: Missing pickup postcode. Ensure a Stock Location with an address is linked to the Sales Channel."
            );
        }

        if (!pickupPostcode || !deliveryPostcode) {
            throw new MedusaError(
                MedusaError.Types.INVALID_DATA,
                "Both pickup and delivery postcodes are required for rate calculation"
            );
        }

        // Calculate total weight from items
        const items = (context["items"] || []) as any[];
        let totalWeightGrams = 0;

        for (const item of items) {
            const quantity = item.quantity || 1;
            const itemWeight = item.variant?.weight ?? item.metadata?.weight ?? 0;
            totalWeightGrams += itemWeight * quantity;
        }

        // Convert to kg, default to 0.5kg if no weight set
        const weightKg = totalWeightGrams > 0 ? totalWeightGrams / 1000 : 0.5;

        const params = {
            pickup_postcode: pickupPostcode,
            delivery_postcode: deliveryPostcode,
            weight: weightKg,
            cod: (this.options_.cod === "true" || this.options_.cod === 1) ? 1 : 0 as number,
        };

        this.logger_.debug(`Shiprocket: Calculating rate for ${pickupPostcode} -> ${deliveryPostcode}, weight: ${weightKg}kg`);

        const price = await this.client.calculate(params);

        this.logger_.debug(`Shiprocket: Calculated rate: ${price}`);

        return {
            calculated_amount: price,
            is_calculated_price_tax_inclusive: true,
        };
    }

    /**
     * Creates a fulfillment in Shiprocket.
     */
    async createFulfillment(
        data: Record<string, unknown>,
        items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
        order: Partial<FulfillmentOrderDTO> | undefined,
        fulfillment: Partial<Omit<FulfillmentDTO, "provider_id">>
    ): Promise<CreateFulfillmentResult> {
        const orderId = order?.id || "unknown";
        this.logger_.info(`Shiprocket: Creating fulfillment for order ${orderId}`);

        try {
            const externalData = await this.client.create(fulfillment, items, order);

            this.logger_.info(
                `Shiprocket: Fulfillment created - Order ID: ${externalData.order_id}, ` +
                `Shipment ID: ${externalData.shipment_id}, AWB: ${externalData.awb}`
            );

            const { label, manifest, invoice } = await this.client.createDocuments(externalData);

            // Only include label if it was successfully generated
            const labelsEntry = label ? [{
                tracking_number: externalData.tracking_number || "",
                tracking_url: externalData.tracking_url || "",
                label_url: label,
            }] : [];

            return {
                data: {
                    ...((fulfillment as object) || {}),
                    ...externalData,
                },
                labels: labelsEntry,
            };
        } catch (err: any) {
            this.logger_.error(`Shiprocket: Failed to create fulfillment for order ${orderId}: ${err.message}`);
            throw new MedusaError(
                MedusaError.Types.INVALID_DATA,
                err?.message || "Failed to create fulfillment"
            );
        }
    }

    /**
     * Cancels a fulfillment in Shiprocket.
     */
    async cancelFulfillment(data: Record<string, unknown>): Promise<void> {
        const orderId = data.order_id as string;

        if (!orderId) {
            throw new MedusaError(
                MedusaError.Types.INVALID_DATA,
                "Shiprocket order_id is required to cancel fulfillment"
            );
        }

        this.logger_.info(`Shiprocket: Cancelling fulfillment for order ${orderId}`);

        await this.client.cancel(orderId);

        this.logger_.info(`Shiprocket: Fulfillment cancelled for order ${orderId}`);
    }

    /**
     * Creates a return fulfillment in Shiprocket.
     */
    async createReturnFulfillment(
        fulfillment: Record<string, unknown>
    ): Promise<CreateFulfillmentResult> {
        this.logger_.info(`Shiprocket: Creating return fulfillment`);

        const externalData = await this.client.createReturn(fulfillment);

        this.logger_.info(`Shiprocket: Return fulfillment created - AWB: ${externalData.awb || externalData.tracking_number}`);

        return {
            data: {
                ...((fulfillment as object) || {}),
                ...externalData,
            },
            labels: [
                {
                    tracking_number: externalData.tracking_number || externalData.awb || "",
                    tracking_url: externalData.tracking_url || "",
                    label_url: externalData.label_url || "",
                },
            ],
        };
    }

    /**
     * Retrieves the documents associated with a fulfillment.
     */
    async getFulfillmentDocuments(_data: Record<string, unknown>): Promise<never[]> {
        // Shiprocket documents are fetched during fulfillment creation
        return [];
    }

    /**
     * Retrieves the documents associated with a shipment.
     */
    async getShipmentDocuments(_data: any): Promise<never[]> {
        // Shiprocket documents are fetched during fulfillment creation
        return [];
    }

    /**
     * Retrieves the documents associated with a return fulfillment.
     */
    async getReturnDocuments(_data: Record<string, unknown>): Promise<never[]> {
        return [];
    }

    /**
     * Retrieves the documents associated with a fulfillment by type.
     */
    async retrieveDocuments(
        _fulfillmentData: Record<string, unknown>,
        _documentType: string
    ): Promise<void> {
        this.logger_.debug("Shiprocket: Document retrieval by type not supported");
    }

    /**
     * Validates the fulfillment data.
     */
    async validateFulfillmentData(
        _optionData: Record<string, unknown>,
        data: Record<string, unknown>,
        _context: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        return {
            ...data,
            external_id: `shiprocket_${Date.now()}`,
        };
    }

    /**
     * Validates a fulfillment option.
     */
    async validateOption(data: Record<string, unknown>): Promise<boolean> {
        return data.id === "shiprocket-standard" || data.id === "shiprocket-return" || data.external_id !== undefined;
    }
}

export default ShipRocketFulfillmentProviderService;
