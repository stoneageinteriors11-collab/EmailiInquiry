const express = require("express");
const router = express.Router();
const { pool } = require("../database/db");
const { sendEnquiryReply } = require("../services/email");

const STATUSES = ["NEW", "CONTACTED", "QUOTATION_SENT", "FOLLOW_UP", "WON", "LOST"];

const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    files: 5,
    fileSize: 10 * 1024 * 1024
  }
});

router.get("/", async (req, res) => {
  const status = req.query.status;
  const search = String(req.query.search || "").trim();

  const values = [];
  const where = [];

  if (status && STATUSES.includes(status)) {
    values.push(status);
    where.push(`status = $${values.length}`);
  }

  if (search) {
    values.push(`%${search}%`);
    where.push(`(
      reference ILIKE $${values.length}
      OR name ILIKE $${values.length}
      OR company ILIKE $${values.length}
      OR email ILIKE $${values.length}
    )`);
  }

  const sql = `
    SELECT id, reference, name, company, email, interested_in, status, assigned_to, created_at, updated_at
    FROM enquiries
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY created_at DESC
    LIMIT 200
  `;

  try {
    const result = await pool.query(sql, values);
    res.json({ enquiries: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load enquiries." });
  }
});

router.get("/stats", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT status, COUNT(*)::int AS count
      FROM enquiries
      GROUP BY status
    `);

    const stats = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const row of result.rows) stats[row.status] = row.count;

    res.json({ stats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load stats." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const enquiry = await pool.query(
      `SELECT * FROM enquiries WHERE id = $1`,
      [req.params.id]
    );

    if (!enquiry.rowCount) {
      return res.status(404).json({ error: "Enquiry not found." });
    }

    const messages = await pool.query(
      `SELECT * FROM messages WHERE enquiry_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );

    const notes = await pool.query(
      `SELECT * FROM internal_notes WHERE enquiry_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );

    res.json({
      enquiry: enquiry.rows[0],
      messages: messages.rows,
      notes: notes.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load enquiry." });
  }
});

router.patch("/:id/status", async (req, res) => {
  const { status } = req.body;

  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }

  try {
    const result = await pool.query(
      `UPDATE enquiries
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Enquiry not found." });
    }

    res.json({ enquiry: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to update status." });
  }
});

router.patch("/:id/assignment", async (req, res) => {
  const assignedTo = String(req.body.assignedTo || "").trim() || null;

  try {
    const result = await pool.query(
      `UPDATE enquiries
       SET assigned_to = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [assignedTo, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Enquiry not found." });
    }

    res.json({ enquiry: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to update assignment." });
  }
});

router.post("/:id/notes", async (req, res) => {
  const body = String(req.body.body || "").trim();
  const author = String(req.body.author || "Admin").trim();

  if (!body) return res.status(400).json({ error: "Note cannot be empty." });

  try {
    const result = await pool.query(
      `INSERT INTO internal_notes (enquiry_id, author, body)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.id, author, body]
    );

    await pool.query(
      `UPDATE enquiries SET updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );

    res.status(201).json({ note: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to save note." });
  }
});

// Reply endpoint is intentionally left as a V2 feature.
// It will call the transactional email provider and store an OUTBOUND message.
// See services/email.js for the interface.
router.post(
  "/:id/reply",
  upload.array("attachments", 5),
  async (req, res) => {

    const body = String(req.body.body || "").trim();

    if (!body) {
      return res.status(400).json({
        error: "Reply cannot be empty."
      });
    }

    try {

      /*
       * ---------------------------------------------------------
       * Load enquiry
       * ---------------------------------------------------------
       */

      const enquiryResult = await pool.query(
        `
        SELECT *
        FROM enquiries
        WHERE id = $1
        `,
        [req.params.id]
      );

      if (!enquiryResult.rowCount) {
        return res.status(404).json({
          error: "Enquiry not found."
        });
      }

      const enquiry = enquiryResult.rows[0];


      /*
       * ---------------------------------------------------------
       * Customer email
       * ---------------------------------------------------------
       */

      if (!enquiry.email) {
        return res.status(400).json({
          error: "Customer email address is missing."
        });
      }


      /*
       * ---------------------------------------------------------
       * Subject
       * ---------------------------------------------------------
       */

      const subject =
        `Re: Your enquiry ${enquiry.reference}`;


      /*
       * ---------------------------------------------------------
       * Send email
       *
       * IMPORTANT:
       * Save the returned Resend result into emailResult.
       * This fixes the current ReferenceError.
       * ---------------------------------------------------------
       */

      const emailResult = await sendEnquiryReply({
        to: enquiry.email,
        subject,
        body,
        enquiryReference: enquiry.reference,
        attachments: req.files || []
      });


      /*
       * ---------------------------------------------------------
       * Store outbound message
       * ---------------------------------------------------------
       */

     const attachments = (req.files || []).map(file => ({
  filename: file.originalname,
  size: file.size,
  mimetype: file.mimetype
}));


const messageResult = await pool.query(
  `
  INSERT INTO messages
  (
    enquiry_id,
    direction,
    from_email,
    to_email,
    subject,
    body,
    provider_message_id,
    attachments
  )
  VALUES
  (
    $1,
    'OUTBOUND',
    $2,
    $3,
    $4,
    $5,
    $6,
    $7
  )
  RETURNING *
  `,
  [
    enquiry.id,
    process.env.EMAIL_FROM,
    enquiry.email,
    subject,
    body,
    emailResult?.id || null,
    JSON.stringify(attachments)
  ]
);


      /*
       * ---------------------------------------------------------
       * Update enquiry status
       * ---------------------------------------------------------
       */

      if (enquiry.status === "NEW") {

        await pool.query(
          `
          UPDATE enquiries
          SET
            status = 'CONTACTED',
            updated_at = NOW()
          WHERE id = $1
          `,
          [enquiry.id]
        );

      } else {

        await pool.query(
          `
          UPDATE enquiries
          SET
            updated_at = NOW()
          WHERE id = $1
          `,
          [enquiry.id]
        );

      }


      /*
       * ---------------------------------------------------------
       * Success
       * ---------------------------------------------------------
       */

      console.log("=================================");
      console.log("REPLY SENT SUCCESSFULLY");
      console.log("=================================");
      console.log("Enquiry:", enquiry.reference);
      console.log("Customer:", enquiry.email);
      console.log("Resend ID:", emailResult?.id);
      console.log("Attachments:", req.files?.length || 0);
      console.log("=================================");


      return res.status(201).json({
        success: true,
        message: messageResult.rows[0]
      });


    } catch (error) {

      console.error("=================================");
      console.error("REPLY FAILED");
      console.error("=================================");
      console.error(error);
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
      console.error("=================================");

      return res.status(500).json({
        error: error.message || "Unable to send reply."
      });

    }
  }
);

module.exports = router;
