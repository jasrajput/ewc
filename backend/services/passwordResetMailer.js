
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_APP_PASSWORD,
  },
});

const sendPasswordResetEmail = async (email, resetLink) => {
  await transporter.sendMail({
    from: `"EWC Support" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "EWC - Reset Your Password",
    text: [
      "We received a request to reset your EWC password.",
      "",
      "Use this link to set a new password:",
      resetLink,
      "",
      "This link expires in 15 minutes and can be used only once.",
      "If you didn't request this, you can ignore this email.",
      "",
      "EWC Support",
    ].join("\n"),
  });
};

module.exports = { sendPasswordResetEmail };
