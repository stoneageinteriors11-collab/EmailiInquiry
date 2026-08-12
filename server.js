require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { shopifyApp } = require("@shopify/shopify-app-express");
const { ApiVersion } = require("@shopify/shopify-api");
const {
  PostgreSQLSessionStorage
} = require("@shopify/shopify-app-session-storage-postgresql");

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
    "Missing one or more required environment variables. Check .env.example."
  );
}

const shopify = shopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: process.env.SCOPES?.split(",") || [],
    hostName: process.env.HOST?.replace(/^https?:\/\//, ""),
    apiVersion: ApiVersion.July26,
  },

  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback",
  },

  webhooks: {
    path: "/api/webhooks",
  },
});

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false
  })
);

app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(express.json({ limit: "100kb" }));

// Shopify OAuth endpoints.
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);

// Shopify webhook endpoint placeholder.
// Add app-specific webhook handlers later when we implement email/customer sync.
app.post(shopify.config.webhooks.path, shopify.processWebhooks({ webhookHandlers: {} }));

// Storefront enquiry submission.
// This route is intentionally NOT protected by the Admin session middleware.
// It is protected by Shopify App Proxy HMAC validation in routes/proxy.js.
const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again later." }
});

app.use("/proxy", submitLimiter, proxyRoutes);

// Admin API routes require an authenticated Shopify Admin request.
app.use("/api/enquiries", shopify.validateAuthenticatedSession(), enquiryRoutes);

// Admin app UI.
app.use(shopify.cspHeaders());
app.use(express.static(path.join(__dirname, "public")));

app.get(
  "/",
  shopify.ensureInstalledOnShop(),
  (req, res) => {
    const fs = require("fs");
    const html = fs.readFileSync(path.join(__dirname, "public", "admin.html"), "utf8")
      .replaceAll("%SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "");
    res.type("html").send(html);
  }
);

// Health check (does not expose secrets).
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

(async () => {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`Stoneage Enquiry Manager running on port ${PORT}`);
  });
})().catch((error) => {
  console.error("Startup failed:", error);
  process.exit(1);
});
