const { Resend } = require("resend");

const resend = new Resend(
  process.env.RESEND_API_KEY
);

const EMAIL_FROM =
  process.env.EMAIL_FROM ||
  "Stoneage Interiors <enquiries@stoneageinteriors.com>";

const EMAIL_REPLY_TO =
  process.env.EMAIL_REPLY_TO ||
  "enquiries@stoneageinteriors.com";


async function sendEnquiryReply({
  to,
  subject,
  body
}) {

  console.log("=================================");
  console.log("RESEND EMAIL");
  console.log("=================================");

  console.log("To:", to);
  console.log("From:", EMAIL_FROM);
  console.log("Reply-To:", EMAIL_REPLY_TO);
  console.log("Subject:", subject);

  if (!process.env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY is missing."
    );
  }

  if (!to) {
    throw new Error(
      "Recipient email is missing."
    );
  }

  if (!body) {
    throw new Error(
      "Email body is empty."
    );
  }


  try {

    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject,
      text: body,
      replyTo: [EMAIL_REPLY_TO]
    });


    console.log("Resend result:");
    console.log(result);


    if (result.error) {

      console.error(
        "================================="
      );

      console.error(
        "RESEND API ERROR"
      );

      console.error(
        "================================="
      );

      console.error(
        "Name:",
        result.error.name
      );

      console.error(
        "Message:",
        result.error.message
      );

      console.error(
        "Status:",
        result.error.statusCode
      );

      console.error(
        "================================="
      );

      throw new Error(
        `Resend: ${result.error.message}`
      );
    }


    console.log(
      "Email sent successfully."
    );

    console.log(
      "Resend Email ID:",
      result.data?.id
    );

    console.log(
      "================================="
    );


    return result.data;

  } catch (error) {

    console.error(
      "Email service exception:"
    );

    console.error(
      error
    );

    throw error;
  }
}


module.exports = {
  sendEnquiryReply
};