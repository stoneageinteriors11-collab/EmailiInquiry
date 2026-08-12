const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

console.log("Email service ready.");
console.log("Email provider: Resend");
console.log("Email from:", process.env.EMAIL_FROM);

async function sendEnquiryReply({
  to,
  subject,
  body,
  reference
}) {
  if (!to) {
    throw new Error("Recipient email is required.");
  }

  if (!subject) {
    throw new Error("Email subject is required.");
  }

  if (!body) {
    throw new Error("Email body is required.");
  }

  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: [to],

    // IMPORTANT:
    // Customer receives the email,
    // and clicking Reply replies directly to the customer.
    replyTo: to,

    subject,

    text: body,

    html: body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>")
  });

  if (result.error) {
    console.error("Resend email failed:", result.error);
    throw new Error(result.error.message || "Unable to send email.");
  }

  console.log("Email sent successfully.");
  console.log("Resend ID:", result.data?.id);

  return result.data;
}

module.exports = {
  sendEnquiryReply
};