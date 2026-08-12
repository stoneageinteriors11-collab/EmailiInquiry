const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },

  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000
});

console.log("Email service ready.");
console.log("SMTP host:", "smtp.gmail.com");
console.log("SMTP port:", 587);
console.log("SMTP user:", process.env.SMTP_USER);

async function verifyEmailConnection() {
  try {
    await transporter.verify();

    console.log("Email service connection successful.");

    return true;
  } catch (error) {
    console.error("Email service connection failed:");
    console.error("Code:", error.code);
    console.error("Command:", error.command);
    console.error("Response:", error.response);
    console.error("Message:", error.message);

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