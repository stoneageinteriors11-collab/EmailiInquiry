const express = require("express");
const router = express.Router();

const { Resend } = require("resend");
const { pool } = require("../database/db");

const resend = new Resend(process.env.RESEND_API_KEY);


/*
|--------------------------------------------------------------------------
| CLEAN CUSTOMER EMAIL REPLY
|--------------------------------------------------------------------------
|
| Removes the previous email chain from replies such as:
|
| Testing resend
|
| Best Regards,
| Taabish shaikh
|
| > On 13 Aug 2026, at 11:47, Stoneage Interiors wrote:
| > New Testing
| > Enquiry reference: SA-2026-395966
|
*/

function cleanEmailReply(body) {

  if (!body) {
    return "";
  }

  let text = String(body)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");


  /*
  |--------------------------------------------------------------------------
  | Remove Gmail / Apple / common "On ... wrote:" quoted section
  |--------------------------------------------------------------------------
  */

  const onWroteRegex =
    /\n\s*(?:On\s.+?wrote:|On\s.+?,\s*.+?\s+wrote:)\s*[\s\S]*$/i;

  text = text.replace(onWroteRegex, "");


  /*
  |--------------------------------------------------------------------------
  | Remove "-----Original Message-----" and everything after it
  |--------------------------------------------------------------------------
  */

  text = text.replace(
    /\n\s*-{2,}\s*Original Message\s*-{2,}[\s\S]*$/i,
    ""
  );


  /*
  |--------------------------------------------------------------------------
  | Remove common forwarded/reply separators
  |--------------------------------------------------------------------------
  */

  text = text.replace(
    /\n\s*_{5,}\s*\n[\s\S]*$/i,
    ""
  );


  /*
  |--------------------------------------------------------------------------
  | Remove quoted lines beginning with >
  |--------------------------------------------------------------------------
  */

  const lines = text.split("\n");

  const cleanedLines = [];

  for (const line of lines) {

    /*
     * If the line starts with ">"
     * it is normally part of the previous email.
     */

    if (/^\s*>/.test(line)) {
      continue;
    }

    cleanedLines.push(line);
  }

  text = cleanedLines.join("\n");


  /*
  |--------------------------------------------------------------------------
  | Remove common quoted email header blocks
  |--------------------------------------------------------------------------
  |
  | Example:
  |
  | From: Stoneage Interiors
  | Sent: Wednesday...
  | To: customer@gmail.com
  | Subject: Re: Your enquiry...
  |
  */

  text = text.replace(
    /\n\s*From:\s*.+\n\s*Sent:\s*.+\n\s*To:\s*.+\n\s*Subject:\s*.+[\s\S]*$/i,
    ""
  );


  /*
  |--------------------------------------------------------------------------
  | Clean excessive blank lines
  |--------------------------------------------------------------------------
  */

  text = text
    .replace(/\n{3,}/g, "\n\n")
    .trim();


  return text;
}


/*
|--------------------------------------------------------------------------
| Resend webhook
|--------------------------------------------------------------------------
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

      const svixId =
        req.headers["svix-id"];

      const svixTimestamp =
        req.headers["svix-timestamp"];

      const svixSignature =
        req.headers["svix-signature"];


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


      const event =
        resend.webhooks.verify({

          payload,

          headers: {
            id: svixId,
            timestamp: svixTimestamp,
            signature: svixSignature
          },

          webhookSecret:
            process.env.RESEND_WEBHOOK_SECRET

        });


      console.log(
        "Webhook event:",
        event.type
      );


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


      const emailData =
        event.data;


      console.log(
        "Received email ID:",
        emailData.email_id
      );

      console.log(
        "From:",
        emailData.from
      );

      console.log(
        "To:",
        emailData.to
      );

      console.log(
        "Subject:",
        emailData.subject
      );


      /*
      |--------------------------------------------------------------------------
      | Get complete received email from Resend
      |--------------------------------------------------------------------------
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

        console.error(
          receivedEmailError
        );

        return res.status(500).json({
          error:
            "Unable to retrieve received email."
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
      | Subject
      |--------------------------------------------------------------------------
      */

      const subject =
        emailData.subject || "";


      /*
      |--------------------------------------------------------------------------
      | Get original email body
      |--------------------------------------------------------------------------
      */

      const originalBody =
        receivedEmail.text ||
        receivedEmail.html ||
        "Customer sent an email, but no readable body was found.";


      /*
      |--------------------------------------------------------------------------
      | CLEAN THE REPLY
      |--------------------------------------------------------------------------
      |
      | This is the important part.
      |
      | Instead of saving the complete email chain,
      | we save only the customer's new message.
      |
      */

      const body =
        cleanEmailReply(originalBody);


      console.log(
        "Original email body:"
      );

      console.log(
        originalBody
      );


      console.log(
        "Cleaned customer reply:"
      );

      console.log(
        body
      );


      /*
      |--------------------------------------------------------------------------
      | Find enquiry
      |--------------------------------------------------------------------------
      */

      const enquiryResult =
        await pool.query(
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

        return res.status(200).json({
          received: true,
          message:
            "No matching enquiry found."
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


      /*
      |--------------------------------------------------------------------------
      | Success logs
      |--------------------------------------------------------------------------
      */

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

      console.log(
        "Saved body:",
        body
      );


      /*
      |--------------------------------------------------------------------------
      | Tell Resend webhook succeeded
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

      console.error(
        error
      );


      return res.status(500).json({
        error:
          "Webhook processing failed."
      });

    }

  }
);


module.exports = router;