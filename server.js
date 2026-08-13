require("dotenv").config();

const path = require("path");
const fs = require("fs");
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
const webhooksRouter = require("./routes/webhooks");
const PORT = Number(process.env.PORT || 3000);


/*
|--------------------------------------------------------------------------
| Environment validation
|--------------------------------------------------------------------------
*/

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


/*
|--------------------------------------------------------------------------
| Shopify
|--------------------------------------------------------------------------
*/

const shopify = shopifyApp({
  api: {
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,

  scopes: process.env.SCOPES
    ?.split(",")
    .map(scope => scope.trim())
    .filter(Boolean) || [],

  hostScheme: "https",

  hostName: "emailiinquiry.onrender.com",

  apiVersion: ApiVersion.July26,
},

  auth: {
    path: "/api/auth",

    callbackPath:
      "/api/auth/callback",
  },

  webhooks: {
    path: "/api/webhooks",
  },

  sessionStorage:
    new PostgreSQLSessionStorage(
      process.env.DATABASE_URL
    ),

  isEmbeddedApp: true,

  exitIframePath:
    "/exitiframe",
});


/*
|--------------------------------------------------------------------------
| Express
|--------------------------------------------------------------------------
*/

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
    frameguard: false,
  })
);

// webhook
app.use("/api/webhooks", webhooksRouter);

/*
|--------------------------------------------------------------------------
| Body parsing
|--------------------------------------------------------------------------
*/

app.use(
  express.urlencoded({
    extended: true,
    limit: "100kb",
  })
);

app.use(
  express.json({
    limit: "100kb",
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
| Exit iframe
|--------------------------------------------------------------------------
*/

app.get("/exitiframe", (req, res) => {

  const shop = req.query.shop;
  const host = req.query.host;

  if (!shop || !host) {
    return res.status(400).send(
      "Missing shop or host."
    );
  }

  const authUrl =
    `/api/auth` +
    `?shop=${encodeURIComponent(shop)}` +
    `&host=${encodeURIComponent(host)}`;

  res.type("html").send(`
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>Redirecting...</title>

<meta
  name="shopify-api-key"
  content="${process.env.SHOPIFY_API_KEY}"
>

<script
  src="https://cdn.shopify.com/shopifycloud/app-bridge.js">
</script>

</head>

<body>

<p>Redirecting...</p>

<script>

window.top.location.href =
  ${JSON.stringify(authUrl)};

</script>

</body>

</html>
  `);
});


/*
|--------------------------------------------------------------------------
| Shopify Webhooks
|--------------------------------------------------------------------------
*/

app.post(
  shopify.config.webhooks.path,

  express.text({
    type: "*/*"
  }),

  shopify.processWebhooks({
    webhookHandlers: {}
  })
);


/*
|--------------------------------------------------------------------------
| Storefront App Proxy
|--------------------------------------------------------------------------
*/

const submitLimiter =
  rateLimit({

    windowMs:
      10 * 60 * 1000,

    limit: 30,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      error:
        "Too many submissions. Please try again later."
    }

  });


app.use(
  "/proxy",
  submitLimiter,
  proxyRoutes
);


/*
|--------------------------------------------------------------------------
| Admin enquiry API
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

app.use(
  shopify.cspHeaders()
);


/*
|--------------------------------------------------------------------------
| Static files
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

    const html =
      fs.readFileSync(
        path.join(
          __dirname,
          "public",
          "admin.html"
        ),
        "utf8"
      )
      .replaceAll(
        "%SHOPIFY_API_KEY%",
        process.env.SHOPIFY_API_KEY || ""
      );

    res
      .type("html")
      .send(html);
  }
);


/*
|--------------------------------------------------------------------------
| Health check
|--------------------------------------------------------------------------
*/

app.get(
  "/health",

  async (_req, res) => {

    try {

      await pool.query("SELECT 1");

      res.json({
        ok: true
      });

    } catch {

      res.status(503).json({
        ok: false
      });

    }

  }
);

/*
|--------------------------------------------------------------------------
| Start server
|--------------------------------------------------------------------------
*/

(async () => {

  try {

    await initDatabase();
// await verifyEmailConnection()
//   .then(() => {
//     console.log("Email service ready.");
//   })
//   .catch((error) => {
//     console.error("Email service connection failed:");
//     console.error(error.message);
//   });

    app.listen(
      PORT,
      () => {
        console.log(
          `Stoneage Enquiry Manager running on port ${PORT}`
        );
      }
    );

  } catch (error) {

    console.error(
      "Startup failed:",
      error
    );

    process.exit(1);
  }

})();