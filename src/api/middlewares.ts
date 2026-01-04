import { defineMiddlewares } from "@medusajs/framework/http"

export default defineMiddlewares({
    routes: [
        {
            // Make delivery estimate endpoint public (no API key required)
            matcher: "/store/shiprocket/delivery-estimate",
            middlewares: [],
            // Disable authentication for this route
            bodyParser: { sizeLimit: "1kb" },
        },
    ],
})
