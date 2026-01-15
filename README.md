# Shiprocket Fulfillment Plugin for Medusa v2

Full-featured Shiprocket integration for Medusa e-commerce stores operating in India.

[![npm version](https://img.shields.io/npm/v/medusa-shiprocket-fulfillment-plugin?style=flat-square)](https://www.npmjs.com/package/medusa-shiprocket-fulfillment-plugin)
[![License: MIT](https://img.shields.io/github/license/SAM-AEL/medusa-shiprocket-fulfillment-plugin?style=flat-square)](LICENSE)

---

## Features

### Checkout & Storefront
- **Dynamic shipping rates** based on destination pincode and package weight
- **Delivery estimates** with fastest courier options
- **Serviceability check** for pincode validation
- **Real-time tracking** with scan history and status updates

### Admin Dashboard
- **Unified admin widget** for shipment management on order pages
- **Manual sync** for tracking data and document regeneration
- **Document downloads** (labels, invoices, manifests)
- **Interactive timeline** showing shipment lifecycle with human-readable statuses

### Fulfillment Operations
- **Auto shipment creation** in Shiprocket when fulfillment is created
- **AWB auto-assignment** with courier selection based on preference
- **Return shipments** support
- **Order cancellation** through Medusa admin
- **Webhook integration** for real-time status synchronization

### Technical
- **HTTP keep-alive** connection pooling for performance
- **Token caching** (8-day refresh cycle)
- **Delivery estimate caching** (4-hour TTL)
- **Rate limiting** (30 req/min per IP on public endpoints)
- **LRU cache** with bounded memory
- **Timing-attack resistant** webhook authentication

---

## Installation

```bash
yarn add medusa-shiprocket-fulfillment-plugin
```

---

## Configuration

### Environment Variables

Add to your `.env`:

```bash
# Required
SHIPROCKET_EMAIL="your_email@example.com"
SHIPROCKET_PASSWORD="your_shiprocket_password"

# Optional
SHIPROCKET_PICKUP_LOCATION="Primary"           # Pickup location nickname
SHIPROCKET_WEBHOOK_TOKEN="secure_random_token" # Webhook auth token
SHIPROCKET_DELIVERY_PREFERENCE="FAST"          # FAST or CHEAP (default: FAST)
```

### Medusa Config

Add to `medusa-config.ts`:

```typescript
import { defineConfig } from "@medusajs/framework/utils"

export default defineConfig({
  // Register as fulfillment provider
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
              cod: "false", // "true" to enable Cash on Delivery
            },
          },
        ],
      },
    },
  ],
  
  // Register as plugin for admin UI and webhooks
  plugins: [
    {
      resolve: "medusa-shiprocket-fulfillment-plugin",
      options: {},
    },
  ],
})
```

### Shiprocket Dashboard Setup

1. **Create API credentials**:
   - Login to Shiprocket → Settings → API
   - Generate API credentials
   - Add to your `.env` file

2. **Configure pickup location**:
   - Settings → Pickup Addresses
   - Set a nickname (e.g., "Primary")
   - Use this in `SHIPROCKET_PICKUP_LOCATION`

3. **Setup webhook** (optional but recommended):
   - Settings → Webhooks → Add Webhook
   - URL: `https://your-domain.com/hooks/fulfillment/shiprocket`
   - Add header: `x-api-key: YOUR_SHIPROCKET_WEBHOOK_TOKEN`
   - Save

---

## API Reference

### Store APIs (Public)

#### `GET /store/shiprocket/delivery-estimate`

Get delivery estimates for a pincode.

**Query Parameters**:
```typescript
{
  delivery_pincode: string      // Required - 6-digit Indian pincode
  pickup_pincode?: string        // Optional - Auto-fetched from SHIPROCKET_PICKUP_LOCATION
  weight?: number                // Optional - Package weight in kg (default: 0.5)
  cod?: 0 | 1                    // Optional - Cash on delivery flag (default: 0)
}
```

**Response**:
```typescript
{
  serviceable: boolean
  preference: "FAST" | "CHEAP"
  courier_name: string | null
  courier_company_id: number | null
  etd: string | null                    // ISO date
  estimated_delivery_days: number | null
  rate: number | null
  is_surface: boolean | null
  courier_count: number
}
```

**Example**:
```bash
curl "https://your-store.com/store/shiprocket/delivery-estimate?delivery_pincode=110001"
```

**Features**:
- Rate limited: 30 requests/min per IP
- Cached for 4 hours per unique route
- No authentication required

---

#### `GET /store/shiprocket/tracking/:awb`

Get tracking information for an AWB (Air Waybill number).

**Response**:
```typescript
{
  awb: string
  courier_name: string
  current_status: string
  etd: Date | null
  scans: Array<{
    date: string
    status: string
    activity: string
    location: string
  }>
}
```

**Example**:
```bash
curl "https://your-store.com/store/shiprocket/tracking/SHPR12345"
```

---

### Admin APIs (Authenticated)

#### `POST /admin/shiprocket/tracking/:awb/sync`

Manually sync tracking data and regenerate documents.

**Request Body** (optional):
```typescript
{
  fulfillment_id?: string  // Auto-updates fulfillment with new document URLs
}
```

**Response**:
```typescript
{
  success: true
  message: "Tracking data synced successfully"
  tracking: {
    id: string
    awb: string
    current_status: string
    courier_name: string
    etd: Date | null
    updated_at: Date
  }
  documents?: {
    label_url: string
    invoice_url: string
    manifest_url: string
  }
}
```

---

### Webhook Endpoint

#### `POST /hooks/fulfillment/shiprocket`

Receives real-time shipment updates from Shiprocket.

**Authentication**: Requires `x-api-key` header matching `SHIPROCKET_WEBHOOK_TOKEN`.

**Payload**: Automatically handled by Shiprocket. Updates tracking database and emits `shiprocket.tracking.updated` event.

---

## Admin Widget

The plugin adds a **Shipment & Tracking** widget to order detail pages in the Medusa admin.

### Features

1. **Status Overview**
   - Current shipment status with color-coded badge
   - Courier name and AWB number
   - Estimated delivery date

2. **Quick Actions**
   - Download shipping label
   - Download invoice
   - Download manifest
   - Sync tracking data

3. **Tracking Timeline**
   - Interactive timeline with all scan events
   - Location and timestamp for each update
   - Human-readable status descriptions

4. **Automatic Updates**
   - Real-time via webhooks
   - Manual sync on demand
   - Auto-refresh on fulfillment creation

---

## Fulfillment Workflow

### Creating a Shipment

1. **Admin creates fulfillment** in Medusa
2. **Plugin validates** order data (dimensions, weight, addresses)
3. **Creates order** in Shiprocket
4. **Auto-assigns AWB** with preferred courier
5. **Generates documents** (label, invoice, manifest)
6. **Returns tracking info** to Medusa

### Courier Selection

Uses `SHIPROCKET_DELIVERY_PREFERENCE`:
- **FAST** (default): Selects courier with fastest delivery
- **CHEAP**: Selects courier with lowest rate

### Tracking Updates

Two methods:
1. **Webhooks**: Real-time updates from Shiprocket (recommended)
2. **Manual Sync**: On-demand via admin widget

### Cancellation

Through Medusa admin → Fulfillment → Cancel
- Cancels order in Shiprocket
- Updates local tracking status

### Returns

Create return fulfillment in Medusa:
- Generates return AWB in Shiprocket
- Creates reverse shipment
- Provides return label

---

## Data Validation

The plugin validates all inputs to prevent errors:

### Phone Numbers
- Must be 10 digits
- Auto-sanitizes (removes spaces, dashes, +91)
- Clear error: `"Phone must be 10 digits, got 3: ABC-123"`

### Pincodes
- Must be 6 digits
- Auto-sanitizes non-numeric characters
- Clear error: `"Pincode must be 6 digits, got 5: 12345"`

### Dimensions & Weight
- Required for all variants
- Must be set on Product → Variant details
- Weight in grams (converted to kg for Shiprocket)
- Length, width, height in cm

---

## Performance

### Caching Strategy

| Cache Type | TTL | Max Size | Eviction |
|-----------|-----|----------|----------|
| Auth Token | 8 days | 1 entry | Time-based |
| Delivery Estimates | 4 hours | 1,000 entries | LRU |
| Pickup Pincodes | 1 hour | 1 entry | Time-based |
| Rate Limiter | 1 minute | 10,000 IPs | Time + Size |

### Connection Pooling

- **HTTP keep-alive** enabled
- Max 10 concurrent connections to Shiprocket
- Shared axios instance across all requests
- Auto-reconnect on 401 errors

### Rate Limiting

Public endpoints:
- 30 requests per minute per IP
- X-RateLimit headers in responses
- 429 status when exceeded

---

## Events

The plugin emits events you can subscribe to:

### `shiprocket.tracking.updated`

```typescript
{
  awb: string
  tracking_id: string
  current_status: string
  shipment_status_id: number
}
```

**Example Subscriber**:
```typescript
// src/subscribers/shiprocket-notifications.ts
export default async function (container) {
  const eventBus = container.resolve("event_bus")
  
  eventBus.subscribe("shiprocket.tracking.updated", async (data) => {
    // Send notification to customer
    console.log(`Shipment ${data.awb} status: ${data.current_status}`)
  })
}
```

---

## Troubleshooting

### "Missing dimensions/weight for product"

**Cause**: Product variant doesn't have weight/dimensions set.

**Fix**: 
1. Go to Products → Select Product → Variants
2. Click variant → Edit
3. Set Weight (grams), Length, Width, Height (cm)

---

### "No couriers available for route"

**Cause**: Shiprocket doesn't service the delivery pincode, or pickup location not configured.

**Fix**:
1. Verify pincode serviceability on Shiprocket dashboard
2. Check `SHIPROCKET_PICKUP_LOCATION` matches Shiprocket nickname exactly
3. Ensure pickup location has valid address with pincode

---

### Webhook not receiving updates

**Cause**: Webhook URL or token misconfigured.

**Fix**:
1. Verify webhook URL is publicly accessible
2. Check `x-api-key` header in Shiprocket dashboard matches `SHIPROCKET_WEBHOOK_TOKEN`
3. Test webhook with manual sync button in admin

---

### Rate limit exceeded on delivery estimate

**Cause**: More than 30 requests per minute from same IP.

**Fix**:
- Cache delivery estimates on your frontend
- Use the 4-hour server-side cache by reusing same route params
- Check `X-RateLimit-Remaining` header

---

## Development

### Building the Plugin

```bash
yarn build
```

### Local Testing with yalc

```bash
# In plugin directory
npx yalc push

# In your Medusa project
npx yalc add medusa-shiprocket-fulfillment-plugin
yarn install
```

### Running Tests

```bash
yarn test
```

---

## Security

- ✅ Timing-attack resistant webhook authentication
- ✅ Input validation for all user data
- ✅ Rate limiting on public endpoints
- ✅ No credentials in logs or error messages
- ✅ HTTPS-only API communication
- ✅ Environment variable configuration

---

## Requirements

- **Medusa**: v2.12.3+
- **Node.js**: v20+
- **Shiprocket Account**: Active with API access

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Support

For issues or questions:
- **GitHub Issues**: [Report a bug](https://github.com/SAM-AEL/medusa-shiprocket-fulfillment-plugin/issues)
- **Documentation**: [Shiprocket API Docs](https://apidocs.shiprocket.in/)

---

## Changelog

### 0.4.2 (2026-01-15)
- Added timing-attack resistant token comparison
- Implemented bounded cache sizes with LRU eviction
- Enhanced phone/pincode validation with clear error messages
- Memory optimization for high-traffic scenarios

### 0.4.1
- Admin widget improvements
- Document generation enhancements
- Tracking sync reliability

### 0.4.0
- Initial release for Medusa v2
- Full Shiprocket API integration
- Admin dashboard widgets
