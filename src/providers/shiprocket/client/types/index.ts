import { AxiosError } from "axios"

export interface ShiprocketClientOptions {
    email: string
    password: string
    pickup_location?: string
    timeout?: number
}

export interface ShiprocketError {
    message: string
    errors?: Record<string, string | string[]>
}

export interface ShiprocketAuthResponse {
    token: string
}

export interface ShiprocketCalculateRateRequest {
    pickup_postcode: string
    delivery_postcode: string
    weight: number
    cod?: number
    declared_value?: number
    allowed_courier_ids?: number[]
}

export interface ShiprocketCourierCompany {
    id: number
    courier_name: string
    rate: string
    days: string
    is_surface: boolean
}

export interface ShiprocketCalculateRateResponse {
    data: {
        available_courier_companies: ShiprocketCourierCompany[]
    }
}

export interface ShiprocketCreateOrderResponse {
    order_id: string
    shipment_id: string
    status: string
    status_code: number
    awb?: string
    courier_company_id?: number
    courier_name?: string
    tracking_number?: string
    tracking_url?: string
    label_url?: string,
    payment_method: string,
    shipping_charges: string,
    transaction_charges: string,
    giftwrap_charges: string
}

export interface ShiprocketTrackingResponse {
    tracking_data: {
        track_status: string
        shipment_status: string
        current_status: string
        etd?: string
        scans: {
            date: string
            activity: string
            location: string
        }[]
    }
}

export interface ShiprocketDeliveryEstimateRequest {
    pickup_postcode: string
    delivery_postcode: string
    weight?: number
    cod?: number
}

export interface ShiprocketDeliveryEstimate {
    courier_name: string
    courier_company_id: number
    estimated_days: number
    estimated_delivery_date: string
    rate: number
    is_surface: boolean
}

export interface ShiprocketDeliveryEstimateResponse {
    serviceable: boolean
    fastest_delivery: ShiprocketDeliveryEstimate | null
    all_options: ShiprocketDeliveryEstimate[]
}

export interface ShiprocketPickupLocation {
    id: number
    pickup_location: string  // The location name/nickname
    name: string
    email: string
    phone: string
    address: string
    address_2?: string
    city: string
    state: string
    country: string
    pin_code: string
    lat?: string
    long?: string
    status: number
    rto_address_id?: number
    new: number
}

export interface ShiprocketPickupLocationsResponse {
    data: {
        shipping_address: ShiprocketPickupLocation[]
    }
}

export type { AxiosError }
