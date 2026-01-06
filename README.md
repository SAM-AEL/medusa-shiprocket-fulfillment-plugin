<p align="center">
  <a href="https://www.shiprocket.in">
    <img src="https://custom-icon-badges.demolab.com/badge/Shiprocket-purple?style=for-the-badge&logo=package&logoColor=white" alt="Shiprocket Logo" height="50">
  </a>
</p>

<h1 align="center">Medusa Shiprocket Fulfillment Plugin</h1>

<p align="center">
  <strong>Logistics integration for Medusa v2 stores in the Indian market.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/medusa-shiprocket-fulfillment-plugin">
    <img src="https://img.shields.io/npm/v/medusa-shiprocket-fulfillment-plugin?color=blue&style=flat-square" alt="NPM Version">
  </a>
  <a href="https://www.npmjs.com/package/medusa-shiprocket-fulfillment-plugin">
    <img src="https://img.shields.io/npm/dw/medusa-shiprocket-fulfillment-plugin?style=flat-square" alt="NPM Downloads">
  </a>
  <a href="https://github.com/SAM-AEL/medusa-shiprocket-fulfillment-plugin/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/SAM-AEL/medusa-shiprocket-fulfillment-plugin?style=flat-square" alt="License">
  </a>
</p>

<hr />

## Overview

The **Medusa Shiprocket Fulfillment Plugin** provides a direct integration with [Shiprocket](https://www.shiprocket.in/), allowing Medusa v2 stores to manage shipping operations within India. It automates fulfillment workflows, provides delivery estimates at checkout, and handles post-purchase tracking and documentation.

## Core Features

| Feature | Functionality |
| :--- | :--- |
| **Real-time Rates** | Support for dynamic shipping rate calculation at checkout based on destination pincode and weight. |
| **Delivery Estimates** | Public API for surfacing estimated delivery dates and fastest courier options on the storefront. |
| **Automated Shipments** | Automated order creation in Shiprocket and AWB assignment during Medusa fulfillment. |
| **Document Management** | One-click generation and retrieval of Shipping Labels, Manifests, and Invoices. |
| **Admin Tracking** | Integrated dashboard widget for real-time shipment status, scan history, and manual synchronization. |
| **Webhook Support** | Native listener for Shiprocket status updates to keep the database and customer informed. |
| **Returns & Cancellations** | Support for creating return shipments and cancelling existing orders directly from Medusa. |

## Prerequisites

- **Medusa v2** installed and configured.
- A registered **Shiprocket Account**.
- Configured **Pickup Locations** in the Shiprocket dashboard.

## Installation

Install the package via yarn or npm:

```bash
yarn add medusa-shiprocket-fulfillment-plugin
# or
npm install medusa-shiprocket-fulfillment-plugin
```

## Configuration

### 1. Environment Variables

Store your credentials and configuration in your `.env` file:

```bash
SHIPROCKET_EMAIL="your_email@example.com"
SHIPROCKET_PASSWORD="your_shiprocket_password"
SHIPROCKET_PICKUP_LOCATION="Primary" # Nickname of the pickup location in Shiprocket
SHIPROCKET_WEBHOOK_TOKEN="secure-token" # Used to authenticate incoming status updates
```

### 2. Medusa Config

The plugin requires registration as both a fulfillment module and a standard plugin in `medusa-config.ts`:

```typescript
module.exports = defineConfig({
  modules: [
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          {
            resolve: "medusa-shiprocket-fulfillment-plugin",
            id: "shiprocket",
            options: {
              email: process.env.SHIPROCKET_EMAIL,
              password: process.env.SHIPROCKET_PASSWORD,
              pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION,
              cod: "false", // Enable string "true" for COD support
            },
          },
        ],
      },
    },
  ],
  plugins: [
    {
      resolve: "medusa-shiprocket-fulfillment-plugin",
      options: {},
    },
  ],
});
```

## Admin Experience

The plugin includes a redesigned **Shipment & Tracking** widget that appears on order detail pages.

### Real-time Synchronization
The widget provides a **Sync Status** button that allows admins to manually refresh tracking data from Shiprocket. This action also regenerates and updates shipping documents if they were previously unavailable.

### Document Management
A unified 3-column quick-action grid provides immediate access to:
- **Shipping Label**: Direct download for the assigned courier label.
- **Invoice**: Access to the Shiprocket-generated order invoice.
- **Manifest**: Retrieval of the carrier manifest for pickup.

### Tracking Timeline
A detailed, interactive timeline displays the full lifecycle of a shipment, mapping Shiprocket's internal status codes to human-readable activities with timestamped location updates.

## API Reference

### Delivery Estimates (`/store/shiprocket/delivery-estimate`)
A public endpoint used during the checkout process to show serviceability and estimated delivery times.
- **Query Params**: `delivery_pincode`, `pickup_pincode` (optional), `weight`, `cod`.
- **Response**: List of available couriers with estimated days and rates.

### Webhook Listener (`/hooks/fulfillment/shiprocket`)
Processes status updates from Shiprocket. Requires `SHIPROCKET_WEBHOOK_TOKEN` to be configured in both the environment and the Shiprocket dashboard.

### Tracking Details (`/store/shiprocket/tracking/:awb`)
Retrieves the latest stored tracking information for a specific AWB, used for custom storefront tracking pages.

## License

MIT License.
