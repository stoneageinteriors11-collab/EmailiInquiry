const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 15000
});

async function verifyEmailConnection() {
  try {
    await transporter.verify();
    console.log("Email service connection successful.");
    return true;
  } catch (error) {
    console.error("Email service connection failed:");
    console.error(error.message);
    return false;
  }
}

async function sendEmail({
  to,
  subject,
  text,
  html,
  replyTo
}) {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
    html
  };

  if (replyTo) {
    mailOptions.replyTo = replyTo;
  }

  const info = await transporter.sendMail(mailOptions);

  console.log("Email sent:", {
    messageId: info.messageId,
    to,
    subject
  });

  return info;
}

module.exports = {
  transporter,
  verifyEmailConnection,
  sendEmail
};