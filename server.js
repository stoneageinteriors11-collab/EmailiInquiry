require("dotenv").config();

const path = require("path");
const fs = require("fs");

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { shopifyApp } = require("@shopify/shopify-app-express");
const { ApiVersion } = require("@shopify/shopify-api");

const { pool, initDatabase } = require("./database/db");

const enquiryRoutes = require("./routes/enquiries");
const proxyRoutes = require("./routes/proxy");

const PORT = Number(process.env.PORT || 3000);

if (
  !process.env.SHOPIFY_API_KEY ||
  !process.env.SHOPIFY_API_SECRET ||
  !process.env.HOST ||
  !process.env.DATABASE_URL
) {
  console.warn(
    "Missing one or more required environment variables."
  );
}

const shopify = shopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,

    scopes: process.env.SCOPES
      ? process.env.SCOPES.split(",").map((scope) => scope.trim())
      : [],

    hostName: process.env.HOST.replace(/^https?:\/\//, ""),

    apiVersion: ApiVersion.July26
  },

  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback"
  },

  webhooks: {
    path: "/api/webhooks"
  }
});

const app = express();

app.set("trust proxy", 1);

/*
|--------------------------------------------------------------------------
| Security
|--------------------------------------------------------------------------
*/

app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false
  })
);

/*
|--------------------------------------------------------------------------
| Body parsing
|--------------------------------------------------------------------------
*/

app.use(
  express.urlencoded({
    extended: true,
    limit: "100kb"
  })
);

app.use(
  express.json({
    limit: "100kb"
  })
);

/*
|--------------------------------------------------------------------------
| Shopify OAuth
|--------------------------------------------------------------------------
*/

app.get(
  shopify.config.auth.path,
  shopify.auth.begin()
);

app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);

/*
|--------------------------------------------------------------------------
| Shopify Webhooks
|--------------------------------------------------------------------------
*/

app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({
    webhookHandlers: {}
  })
);

/*
|--------------------------------------------------------------------------
| Storefront App Proxy
|--------------------------------------------------------------------------
|
| Shopify:
|
| /apps/enquiry/submit
|
| forwards to:
|
| /proxy/submit
|
*/

const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error: "Too many submissions. Please try again later."
  }
});

app.use(
  "/proxy",
  submitLimiter,
  proxyRoutes
);

/*
|--------------------------------------------------------------------------
| Admin API
|--------------------------------------------------------------------------
*/

app.use(
  "/api/enquiries",
  shopify.validateAuthenticatedSession(),
  enquiryRoutes
);

/*
|--------------------------------------------------------------------------
| Shopify CSP
|--------------------------------------------------------------------------
*/

app.use(shopify.cspHeaders());

/*
|--------------------------------------------------------------------------
| Admin frontend
|--------------------------------------------------------------------------
*/

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

/*
|--------------------------------------------------------------------------
| Admin app
|--------------------------------------------------------------------------
*/

app.get(
  "/",
  shopify.ensureInstalledOnShop(),
  (req, res) => {
    const html = fs
      .readFileSync(
        path.join(__dirname, "public", "admin.html"),
        "utf8"
      )
      .replaceAll(
        "%SHOPIFY_API_KEY%",
        process.env.SHOPIFY_API_KEY || ""
      );

    res.type("html").send(html);
  }
);

/*
|--------------------------------------------------------------------------
| Health check
|--------------------------------------------------------------------------
*/

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      service: "stoneage-enquiry-app"
    });
  } catch (error) {
    console.error("Health check failed:", error);

    res.status(503).json({
      ok: false
    });
  }
});

/*
|--------------------------------------------------------------------------
| 404 handler
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl
  });
});

/*
|--------------------------------------------------------------------------
| Start server
|--------------------------------------------------------------------------
*/

(async () => {
  try {
    await initDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `Stoneage Enquiry Manager running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "Startup failed:",
      error
    );

    process.exit(1);
  }
})();