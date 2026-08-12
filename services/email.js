const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

async function sendEmail({
  to,
  subject,
  text,
  html,
  replyTo
}) {
  if (!to) {
    throw new Error("Recipient email address is required.");
  }

  if (!subject) {
    throw new Error("Email subject is required.");
  }

  if (!text && !html) {
    throw new Error("Email body is required.");
  }

  const result = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    replyTo: replyTo || process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM,
    subject,
    text,
    html
  });

  return {
    messageId: result.messageId,
    response: result.response
  };
}

async function verifyEmailConnection() {
  await transporter.verify();
  console.log("SMTP connection verified.");
}

module.exports = {
  sendEmail,
  verifyEmailConnection
};