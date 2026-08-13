const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

console.log("Email service ready.");
console.log("Email FROM:", process.env.EMAIL_FROM);

async function sendEnquiryReply({
  to,
  subject,
  body,
  enquiryReference,
  attachments = []
}) {
  if (!to) {
    throw new Error("Customer email address is missing.");
  }

  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is missing.");
  }

  if (!process.env.EMAIL_FROM) {
    throw new Error("EMAIL_FROM is missing.");
  }

  console.log("=================================");
  console.log("SENDING ENQUIRY REPLY");
  console.log("=================================");
  console.log("To:", to);
  console.log("From:", process.env.EMAIL_FROM);
  console.log("Reply-To:", to);
  console.log("Subject:", subject);
  console.log("Reference:", enquiryReference);
  console.log("=================================");

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,

    // Customer receives the email
    to: [to],

    // When admin/customer clicks reply,
    // the reply goes back to the customer
    replyTo: process.env.EMAIL_REPLY_TO,

    subject,
      attachments: attachments.map(file => ({
    filename: file.originalname,
    content: file.buffer
  })),

    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
        <p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>

        ${
          enquiryReference
            ? `
              <hr style="margin: 30px 0; border: 0; border-top: 1px solid #ddd;">

              <p style="font-size: 12px; color: #777;">
                Enquiry reference: ${escapeHtml(enquiryReference)}
              </p>
            `
            : ""
        }
      </div>
    `
  });

  if (error) {
    console.error("=================================");
    console.error("RESEND ERROR");
    console.error("=================================");
    console.error(error);
    console.error("=================================");

    throw new Error(
      error.message || "Unable to send email."
    );
  }

  console.log("Email sent successfully.");
  console.log("Resend ID:", data?.id);

  return data;
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


module.exports = {
  sendEnquiryReply
};