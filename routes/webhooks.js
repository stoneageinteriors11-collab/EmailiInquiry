const express = require("express");
const router = express.Router();

const { Resend } = require("resend");
const { pool } = require("../database/db");

const resend = new Resend(process.env.RESEND_API_KEY);


/*
|--------------------------------------------------------------------------
| Resend webhook
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This route receives the RAW request body because Resend webhook
| signatures must be verified against the original body.
|
*/

router.post(
  "/resend",

  express.raw({
    type: "application/json"
  }),

  async (req, res) => {

    try {

      console.log("=================================");
      console.log("RESEND WEBHOOK RECEIVED");
      console.log("=================================");

      /*
      |--------------------------------------------------------------------------
      | Verify webhook
      |--------------------------------------------------------------------------
      */

      const payload = req.body.toString();

      const svixId = req.headers["svix-id"];
      const svixTimestamp = req.headers["svix-timestamp"];
      const svixSignature = req.headers["svix-signature"];

      if (
        !svixId ||
        !svixTimestamp ||
        !svixSignature
      ) {

        console.error(
          "Missing Resend webhook signature headers."
        );

        return res.status(400).json({
          error: "Missing webhook signature."
        });

      }


      const event = resend.webhooks.verify({

        payload,

        headers: {
          id: svixId,
          timestamp: svixTimestamp,
          signature: svixSignature
        },

        webhookSecret:
          process.env.RESEND_WEBHOOK_SECRET

      });


      console.log("Webhook event:", event.type);


      /*
      |--------------------------------------------------------------------------
      | Only process received emails
      |--------------------------------------------------------------------------
      */

      if (event.type !== "email.received") {

        console.log(
          "Ignoring event:",
          event.type
        );

        return res.status(200).json({
          received: true
        });

      }


      const emailData = event.data;


      console.log("Received email ID:", emailData.email_id);
      console.log("From:", emailData.from);
      console.log("To:", emailData.to);
      console.log("Subject:", emailData.subject);


      /*
      |--------------------------------------------------------------------------
      | Get the complete email from Resend
      |--------------------------------------------------------------------------
      |
      | The webhook itself does NOT contain the email body.
      | We therefore retrieve it using email_id.
      |
      */

      const {
        data: receivedEmail,
        error: receivedEmailError
      } = await resend.emails.receiving.get(
        emailData.email_id
      );


      if (receivedEmailError) {

        console.error(
          "Unable to retrieve received email:"
        );

        console.error(receivedEmailError);

        return res.status(500).json({
          error: "Unable to retrieve received email."
        });

      }


      /*
      |--------------------------------------------------------------------------
      | Customer email
      |--------------------------------------------------------------------------
      */

      const customerEmail =
        emailData.from;


      /*
      |--------------------------------------------------------------------------
      | Email subject
      |--------------------------------------------------------------------------
      */

      const subject =
        emailData.subject || "";


      /*
      |--------------------------------------------------------------------------
      | Email body
      |--------------------------------------------------------------------------
      */

      const body =
        receivedEmail.text ||
        receivedEmail.html ||
        "Customer sent an email, but no readable body was found.";


      /*
      |--------------------------------------------------------------------------
      | Find the enquiry
      |--------------------------------------------------------------------------
      |
      | The customer is replying to the Resend inbound address.
      |
      | We identify the enquiry using the customer's email address.
      |
      */

      const enquiryResult = await pool.query(
        `
        SELECT *
        FROM enquiries
        WHERE LOWER(email) = LOWER($1)
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [customerEmail]
      );


      if (!enquiryResult.rowCount) {

        console.warn(
          "No enquiry found for customer email:",
          customerEmail
        );

        /*
        |--------------------------------------------------------------------------
        | We still return 200 so Resend doesn't keep retrying forever.
        |--------------------------------------------------------------------------
        */

        return res.status(200).json({
          received: true,
          message: "No matching enquiry found."
        });

      }


      const enquiry =
        enquiryResult.rows[0];


      /*
      |--------------------------------------------------------------------------
      | Prevent duplicate messages
      |--------------------------------------------------------------------------
      */

      const existingMessage =
        await pool.query(
          `
          SELECT id
          FROM messages
          WHERE provider_message_id = $1
          LIMIT 1
          `,
          [emailData.email_id]
        );


      if (existingMessage.rowCount) {

        console.log(
          "Message already exists. Ignoring duplicate webhook."
        );

        return res.status(200).json({
          received: true,
          duplicate: true
        });

      }


      /*
      |--------------------------------------------------------------------------
      | Save customer reply
      |--------------------------------------------------------------------------
      */

      const messageResult =
        await pool.query(
          `
          INSERT INTO messages (
            enquiry_id,
            direction,
            from_email,
            to_email,
            subject,
            body,
            provider_message_id
          )

          VALUES (
            $1,
            'INBOUND',
            $2,
            $3,
            $4,
            $5,
            $6
          )

          RETURNING *
          `,
          [
            enquiry.id,
            customerEmail,
            Array.isArray(emailData.to)
              ? emailData.to.join(", ")
              : emailData.to,
            subject,
            body,
            emailData.email_id
          ]
        );


      /*
      |--------------------------------------------------------------------------
      | Update enquiry
      |--------------------------------------------------------------------------
      */

      await pool.query(
        `
        UPDATE enquiries

        SET
          status = CASE
            WHEN status = 'NEW'
            THEN 'CONTACTED'
            ELSE status
          END,

          updated_at = NOW()

        WHERE id = $1
        `,
        [enquiry.id]
      );


      console.log(
        "Customer reply saved successfully."
      );

      console.log(
        "Enquiry:",
        enquiry.reference
      );

      console.log(
        "Message ID:",
        messageResult.rows[0].id
      );


      /*
      |--------------------------------------------------------------------------
      | Tell Resend we received the webhook
      |--------------------------------------------------------------------------
      */

      return res.status(200).json({
        received: true
      });


    } catch (error) {

      console.error(
        "================================="
      );

      console.error(
        "RESEND WEBHOOK ERROR"
      );

      console.error(
        "================================="
      );

      console.error(error);


      return res.status(500).json({
        error: "Webhook processing failed."
      });

    }

  }
);


module.exports = router;