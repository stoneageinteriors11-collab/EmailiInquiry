const express = require("express");
const crypto = require("crypto");
const { pool } = require("../database/db");

const router = express.Router();

function timingSafeEqualHex(a, b) {
  try {
    const aa = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");

    return (
      aa.length === bb.length &&
      crypto.timingSafeEqual(aa, bb)
    );
  } catch {
    return false;
  }
}

function verifyAppProxy(req) {
  const signature = req.query.signature;
  const shop = req.query.shop;
  const timestamp = Number(req.query.timestamp);

  if (!signature || !shop || !timestamp) {
    return false;
  }

  // Reject requests older than 5 minutes.
  if (
    Math.abs(
      Math.floor(Date.now() / 1000) - timestamp
    ) > 300
  ) {
    return false;
  }

  const params = Object.keys(req.query)
    .filter((key) => key !== "signature")
    .sort()
    .map((key) => {
      const value = Array.isArray(req.query[key])
        ? req.query[key].join(",")
        : req.query[key];

      return `${key}=${value}`;
    })
    .join("");

  const calculated = crypto
    .createHmac(
      "sha256",
      process.env.SHOPIFY_API_SECRET
    )
    .update(params, "utf8")
    .digest("hex");

  return timingSafeEqualHex(
    calculated,
    signature
  );
}

function clean(value, max = 10000) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function makeReference() {
  const year = new Date().getFullYear();
  const random = Math.floor(
    100000 + Math.random() * 900000
  );

  return `SA-${year}-${random}`;
}

router.post("/submit", async (req, res) => {

  console.log("=================================");
  console.log("APP PROXY ENQUIRY REQUEST");
  console.log("=================================");
  console.log("Method:", req.method);
  console.log("Path:", req.path);
  console.log("Shop:", req.query.shop);
  console.log("Timestamp:", req.query.timestamp);
  console.log("Has signature:", Boolean(req.query.signature));
  console.log("Content-Type:", req.headers["content-type"]);
  console.log("Body:", req.body);
  console.log("=================================");
  /*
   * Verify Shopify App Proxy signature
   */
  if (!verifyAppProxy(req)) {
    return res.status(401).json({
      error: "Invalid Shopify request."
    });
  }

  /*
   * Honeypot
   */
const body = req.body || {};

console.log("Body:", body);

if (clean(body.website, 200)) {
  return res.status(400).json({
    error: "Invalid submission."
  });
}

const contact = body.contact || {};

const name = clean(contact.name, 255);

const company = clean(
  contact.company,
  255
);

const email = clean(
  contact.email,
  320
).toLowerCase();

const phone = clean(
  contact.phone,
  100
);

const country = clean(
  contact.country,
  100
);

const profession = clean(
  contact.profession,
  150
);

const howDiscovered = clean(
  contact.how_discovered,
  150
);

const interestedIn = clean(
  contact.interested_in,
  1000
);

const projectDetails = clean(
  contact.body,
  10000
);

const shop = clean(
  req.query.shop,
  255
);

console.log("Parsed enquiry:");
console.log({
  name,
  company,
  email,
  phone,
  country,
  profession,
  howDiscovered,
  interestedIn,
  projectDetails,
  shop
});

if (!name || !email) {
  return res.status(400).json({
    error: "Name and email are required."
  });
}

if (
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
) {
  return res.status(400).json({
    error: "Please enter a valid email address."
  });
}
  try {
    /*
     * Generate unique reference
     */
    let reference;

    for (let attempt = 0; attempt < 5; attempt++) {
      reference = makeReference();

      const exists = await pool.query(
        `
        SELECT 1
        FROM enquiries
        WHERE reference = $1
        `,
        [reference]
      );

      if (!exists.rowCount) {
        break;
      }
    }

    /*
     * Insert enquiry
     */
    const result = await pool.query(
      `
      INSERT INTO enquiries
      (
        reference,
        shop,
        name,
        company,
        email,
        phone,
        country,
        profession,
        how_discovered,
        interested_in,
        project_details
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
      )
      RETURNING id, reference, created_at
      `,
      [
        reference,
        shop,
        name,
        company || null,
        email,
        phone || null,
        country || null,
        profession || null,
        howDiscovered || null,
        interestedIn || null,
        projectDetails || null
      ]
    );

    const enquiry = result.rows[0];

    /*
     * Store original enquiry as inbound message
     */
    await pool.query(
      `
      INSERT INTO messages
      (
        enquiry_id,
        direction,
        from_email,
        to_email,
        subject,
        body
      )
      VALUES
      (
        $1,
        'INBOUND',
        $2,
        NULL,
        $3,
        $4
      )
      `,
      [
        enquiry.id,
        email,
        `New enquiry ${enquiry.reference}`,
        projectDetails ||
          "Customer submitted an enquiry."
      ]
    );

    /*
     * Success
     */
    return res.status(201).json({
      success: true,
      reference: enquiry.reference,
      message:
        "Thank you for your enquiry — we'll be in touch shortly."
    });

  } catch (error) {
    console.error(
      "Enquiry submission failed:",
      error
    );
 console.error("=================================");
    console.error("ENQUIRY SUBMISSION FAILED");
    console.error("=================================");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("Detail:", error.detail);
    console.error("Hint:", error.hint);
    console.error("Constraint:", error.constraint);
    console.error("Table:", error.table);
    console.error("Column:", error.column);
    console.error("Stack:", error.stack);
    console.error("=================================");
    return res.status(500).json({
      error:
        "Unable to submit your enquiry."
    });
  }
});

module.exports = router;