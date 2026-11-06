
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


const sendPasswordResetEmail = async (
  to,
  resetUrl,
  name = "Member"
) => {
  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);

  const safeName = escapeHtml(name);
  const safeResetUrl = escapeHtml(resetUrl);

  // Set this to the public HTTPS URL of your EWC logo.
  const logoUrl = "https://www.ewctoken.com/logo.png";
  const safeLogoUrl = escapeHtml(logoUrl);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reset Your EWC Password</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0f0e;font-family:Arial,Helvetica,sans-serif;color:#f3f4f6;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0"
  width="100%" style="background-color:#0b0f0e;">
  <tr>
    <td align="center" style="padding:44px 16px 50px;">

      <!-- BRAND HEADER -->
      <table role="presentation" cellpadding="0" cellspacing="0"
        border="0" width="100%" style="max-width:520px;">
        <tr>
          <td align="center" style="padding-bottom:32px;">

            ${
              logoUrl
                ? `<img src="${safeLogoUrl}"
                    width="150"
                    alt="Elevate World Community"
                    style="display:block;width:150px;max-width:100%;height:auto;border:0;">`
                : `
                  <div style="color:#e5b83d;font-size:28px;font-weight:800;letter-spacing:3px;">
                    ELEVATE
                  </div>
                  <div style="color:#b58b26;font-size:12px;font-weight:700;letter-spacing:2px;">
                    WORLD COMMUNITY
                  </div>
                `
            }

          </td>
        </tr>
      </table>

      <!-- MAIN CARD -->
      <table role="presentation" cellpadding="0" cellspacing="0"
        border="0" width="100%"
        style="max-width:520px;background-color:#191e21;border:1px solid #3a3421;border-radius:20px;">

        <!-- GOLD LINE -->
        <tr>
          <td align="center" style="padding:0;">
            <div style="height:3px;width:140px;background-color:#ffc400;"></div>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:38px 32px 12px;">

            <!-- LOCK ICON -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" width="62" height="62"
                  style="width:62px;height:62px;border-radius:16px;background-color:#29291e;border:1px solid #574718;color:#ffc400;font-size:28px;">
                  &#128274;
                </td>
              </tr>
            </table>

            <h1 style="margin:28px 0 12px;color:#f5f5f5;font-size:30px;line-height:38px;font-weight:700;">
              Reset Your Password
            </h1>

            <p style="margin:0;color:#929ba5;font-size:15px;line-height:25px;">
              Secure your EWC account with a new password.
            </p>

          </td>
        </tr>

        <!-- MESSAGE -->
        <tr>
          <td style="padding:24px 32px 8px;">

            <p style="margin:0 0 18px;color:#e5e7eb;font-size:15px;line-height:25px;">
              Hello ${safeName},
            </p>

            <p style="margin:0;color:#aeb5bf;font-size:15px;line-height:26px;">
              We received a request to reset your EWC account password.
              Click the button below to create a new password and regain access to your account.
            </p>

          </td>
        </tr>

        <!-- BUTTON -->
        <tr>
          <td align="center" style="padding:28px 32px;">

            <table role="presentation" cellpadding="0" cellspacing="0"
              border="0" width="100%">
              <tr>
                <td align="center" bgcolor="#ffc400"
                  style="background-color:#ffc400;border-radius:12px;">

                  <a href="${safeResetUrl}"
                    style="display:block;padding:17px 18px;color:#101410;font-size:16px;font-weight:700;text-align:center;text-decoration:none;border-radius:12px;">
                    Reset Password &#8594;
                  </a>

                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- SECURITY NOTE -->
        <tr>
          <td style="padding:0 32px 30px;">

            <table role="presentation" cellpadding="0" cellspacing="0"
              border="0" width="100%"
              style="background-color:#111618;border:1px solid #333a36;border-radius:12px;">
              <tr>
                <td style="padding:18px 20px;">

                  <p style="margin:0 0 10px;color:#f1c64a;font-size:14px;font-weight:700;">
                    Security Information
                  </p>

                  <p style="margin:0;color:#aeb5bf;font-size:13px;line-height:23px;">
                    &#8226; This reset link expires in <strong style="color:#fff;">15 minutes</strong>.<br>
                    &#8226; The link can only be used once.<br>
                    &#8226; If you didn't request this, ignore this email.
                  </p>

                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- FALLBACK LINK -->
        <tr>
          <td style="padding:0 32px 30px;">
            <p style="margin:0 0 10px;color:#929ba5;font-size:12px;line-height:21px;">
              Having trouble with the button? Copy this link into your browser:
            </p>

            <p style="margin:0;overflow-wrap:anywhere;word-break:break-all;">
              <a href="${safeResetUrl}"
                style="color:#ffc400;font-size:12px;line-height:22px;text-decoration:underline;">
                ${safeResetUrl}
              </a>
            </p>
          </td>
        </tr>

        <!-- CARD FOOTER -->
        <tr>
          <td style="border-top:1px solid #303638;padding:24px 32px;text-align:center;">
            <p style="margin:0;color:#f3f4f6;font-size:14px;font-weight:700;">
              EWC Support Team
            </p>
            <p style="margin:8px 0 0;color:#7f8891;font-size:12px;">
              Elevate World Community
            </p>
          </td>
        </tr>

      </table>

      <!-- OUTER FOOTER -->
      <table role="presentation" width="100%" cellpadding="0"
        cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td align="center" style="padding:28px 14px;">
            <p style="margin:0;color:#6e7780;font-size:12px;line-height:21px;">
              This is an automated security email from EWC.<br>
              Please do not share your password reset link with anyone.
            </p>

            <p style="margin:16px 0 0;color:#987725;font-size:11px;letter-spacing:2px;">
              ELEVATE WORLD COMMUNITY
            </p>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>

</body>
</html>
`;

  await transporter.sendMail({
    from: `"EWC Support" <${process.env.SMTP_USER}>`,
    to,
    subject: "EWC | Reset Your Password",
    text: `Hello ${name},

We received a request to reset your EWC password.

Reset your password:
${resetUrl}

This link expires in 15 minutes and can only be used once.

If you did not request this, please ignore this email.

EWC Support Team`,
    html,
  });
};



module.exports = { sendPasswordResetEmail };
