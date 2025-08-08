<p align="center">
  <a href="https://www.medusajs.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/59018053/229103275-b5e482bb-4601-46e6-8142-244f531cebdb.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    <img alt="Medusa logo" src="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    </picture>
  </a>
</p>
<h1 align="center">
  Medusa Shiprocket Fulfillment Plugin
</h1>

> ⚠️ **WORK IN PROGRESS: This plugin is under active development. Do not use in a production environment.**

<h4 align="center">
  <a href="https://docs.medusajs.com">Documentation</a> |
  <a href="https://www.medusajs.com">Website</a>
</h4>

<p align="center">
  Shiprocket Fulfillment provider for MedusaJS v2.0+.
</p>
<p align="center">
  <a href="https://github.com/medusajs/medusa/blob/master/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs welcome!" />
  </a>
  <a href="https://discord.gg/xpCwq3Kfn8">
    <img src="https://img.shields.io/badge/chat-on%20discord-7289DA.svg" alt="Discord Chat" />
  </a>
  <a href="https://twitter.com/intent/follow?screen_name=medusajs">
    <img src="https://img.shields.io/twitter/follow/medusajs.svg?label=Follow%20@medusajs" alt="Follow @medusajs" />
  </a>
</p>

## Features

*   **Rate Calculation:** Calculate shipping rates on checkout.
*   **Fulfillment Creation:** Create fulfillments in Shiprocket.
*   **Fulfillment Cancellation:** Cancel fulfillments in Shiprocket.
*   **Tracking:** Get tracking information for fulfillments.

## Future Features

*   **Order Splitting:** Allow splitting an order into multiple shipments.
*   **Return Management:** Handle returns and reverse shipments through Shiprocket.

## Compatibility

This plugin is compatible with versions >= 2.4.0 of `@medusajs/medusa`.

## Getting Started

1.  **Install the plugin:**
    ```bash
    yarn add medusa-shiprocket-fulfillment-plugin
    ```

2.  **Configure the plugin:**
    In your `medusa-config.js`, add the following to your `modules` object:
    ```javascript
    modules: [
      {
        resolve: "@medusajs/medusa/fulfillment",
        options: {
          providers: [
            {
              resolve: "medusa-shiprocket-fulfillment-plugin/providers/shiprocket",
              id: "shiprocket-fulfillment",
              options: {
                email: process.env.SHIPROCKET_EMAIL,
                password: process.env.SHIPROCKET_PASSWORD,
                pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION, // optional
              },
            },
          ],
        },
      },
    ]

3.  **Add the following to your `.env` file:**
    ```
    SHIPROCKET_EMAIL=<your-shiprocket-email>
    SHIPROCKET_PASSWORD=<your-shiprocket-password>
    SHIPROCKET_COD=<true-or-false>
    SHIPROCKET_ALLOWED_COURIER_IDS=<comma-separated-courier-ids>
    SHIPROCKET_PICKUP_LOCATION=<your-pickup-location>
    ```

## What is Medusa

Medusa is a set of commerce modules and tools that allow you to build rich, reliable, and performant commerce applications without reinventing core commerce logic. The modules can be customized and used to build advanced ecommerce stores, marketplaces, or any product that needs foundational commerce primitives. All modules are open-source and freely available on npm.

Learn more about [Medusa’s architecture](https://docs.medusajs.com/learn/introduction/architecture) and [commerce modules](https://docs.medusajs.com/learn/fundamentals/modules/commerce-modules) in the Docs.

## Community & Contributions

The community and core team are available in [GitHub Discussions](https://github.com/medusajs/medusa/discussions), where you can ask for support, discuss roadmap, and share ideas.

Join our [Discord server](https://discord.com/invite/medusajs) to meet other community members.

## Other channels

- [GitHub Issues](https://github.com/medusajs/medusa/issues)
- [Twitter](https://twitter.com/medusajs)
- [LinkedIn](https://www.linkedin.com/company/medusajs)
- [Medusa Blog](https://medusajs.com/blog/)