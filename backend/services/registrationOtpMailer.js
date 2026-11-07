
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

const sendRegistrationOtpEmail = async (to, code) => {
  const safeCode = String(code).trim();

  if (!/^\d{6}$/.test(safeCode)) {
    throw new Error("Invalid registration OTP.");
  }

  // Same logo used in the password reset email.
  const logoUrl = "https://www.ewctoken.com/logo.png";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Verify Your EWC Email</title>
</head>

<body style="margin:0;padding:0;background-color:#0b0f0e;font-family:Arial,Helvetica,sans-serif;color:#f3f4f6;">

<table role="presentation"
  cellpadding="0"
  cellspacing="0"
  border="0"
  width="100%"
  style="background-color:#0b0f0e;">

  <tr>
    <td align="center" style="padding:44px 16px 50px;">

      <!-- BRAND HEADER -->
      <table role="presentation"
        cellpadding="0"
        cellspacing="0"
        border="0"
        width="100%"
        style="max-width:520px;">

        <tr>
          <td align="center" style="padding-bottom:32px;">

            <img
              src="${logoUrl}"
              width="150"
              alt="Elevate World Community"
              style="display:block;width:150px;max-width:100%;height:auto;border:0;"
            >

          </td>
        </tr>
      </table>

      <!-- MAIN CARD -->
      <table role="presentation"
        cellpadding="0"
        cellspacing="0"
        border="0"
        width="100%"
        style="max-width:520px;background-color:#191e21;border:1px solid #3a3421;border-radius:20px;">

        <!-- GOLD ACCENT -->
        <tr>
          <td align="center" style="padding:0;">
            <div style="height:3px;width:140px;background-color:#ffc400;"></div>
          </td>
        </tr>

        <!-- HEADER -->
        <tr>
          <td align="center" style="padding:38px 32px 12px;">

            <!-- EMAIL ICON -->
            <table role="presentation"
              cellpadding="0"
              cellspacing="0"
              border="0">

              <tr>
                <td
                  align="center"
                  width="62"
                  height="62"
                  style="width:62px;height:62px;border-radius:16px;background-color:#29291e;border:1px solid #574718;color:#ffc400;font-size:28px;">

                  &#9993;

                </td>
              </tr>
            </table>

            <h1 style="margin:28px 0 12px;color:#f5f5f5;font-size:30px;line-height:38px;font-weight:700;">
              Verify Your Email
            </h1>

            <p style="margin:0;color:#929ba5;font-size:15px;line-height:25px;">
              One final step to join Elevate World Community.
            </p>

          </td>
        </tr>

        <!-- WELCOME MESSAGE -->
        <tr>
          <td style="padding:24px 32px 8px;">

            <p style="margin:0 0 18px;color:#e5e7eb;font-size:15px;line-height:25px;">
              Welcome to EWC!
            </p>

            <p style="margin:0;color:#aeb5bf;font-size:15px;line-height:26px;">
              Thank you for choosing to join Elevate World Community.
              To complete your account registration, please verify your
              email address using the secure verification code below.
            </p>

          </td>
        </tr>

        <!-- OTP CODE -->
        <tr>
          <td align="center" style="padding:28px 32px 12px;">

            <table role="presentation"
              cellpadding="0"
              cellspacing="0"
              border="0"
              width="100%">

              <tr>
                <td
                  align="center"
                  style="background-color:#111618;border:1px solid #574718;border-radius:12px;padding:24px 12px;">

                  <p style="margin:0 0 15px;color:#929ba5;font-size:12px;font-weight:700;letter-spacing:2px;">
                    YOUR VERIFICATION CODE
                  </p>

                  <p style="margin:0;color:#ffc400;font-size:38px;line-height:48px;font-weight:800;letter-spacing:8px;font-family:Arial,Helvetica,sans-serif;">
                    ${safeCode}
                  </p>

                </td>
              </tr>

            </table>

          </td>
        </tr>

        <!-- EXPIRY MESSAGE -->
        <tr>
          <td align="center" style="padding:12px 32px 30px;">

            <p style="margin:0;color:#aeb5bf;font-size:13px;line-height:23px;">
              This verification code expires in
              <strong style="color:#ffc400;">5 minutes</strong>.
            </p>

            <p style="margin:7px 0 0;color:#929ba5;font-size:12px;line-height:20px;">
              Enter the code on the EWC registration page
              to activate the next step.
            </p>

          </td>
        </tr>

        <!-- SECURITY NOTE -->
        <tr>
          <td style="padding:0 32px 30px;">

            <table role="presentation"
              cellpadding="0"
              cellspacing="0"
              border="0"
              width="100%"
              style="background-color:#111618;border:1px solid #333a36;border-radius:12px;">

              <tr>
                <td style="padding:18px 20px;">

                  <p style="margin:0 0 10px;color:#f1c64a;font-size:14px;font-weight:700;">
                    Security Information
                  </p>

                  <p style="margin:0;color:#aeb5bf;font-size:13px;line-height:23px;">

                    &#8226; Your verification code is valid for
                    <strong style="color:#fff;">5 minutes</strong>.<br>

                    &#8226; The code can only be used once.<br>

                    &#8226; Never share your code with anyone,
                    including EWC support staff.<br>

                    &#8226; If you didn't request this code,
                    you can safely ignore this email.

                  </p>

                </td>
              </tr>

            </table>

          </td>
        </tr>

        <!-- HELP TEXT -->
        <tr>
          <td style="padding:0 32px 30px;">

            <p style="margin:0;color:#929ba5;font-size:13px;line-height:23px;">
              Didn't receive the code in time?
              Return to the registration page and request
              a new verification code.
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
      <table role="presentation"
        width="100%"
        cellpadding="0"
        cellspacing="0"
        border="0"
        style="max-width:520px;">

        <tr>
          <td align="center" style="padding:28px 14px;">

            <p style="margin:0;color:#6e7780;font-size:12px;line-height:21px;">
              This is an automated verification email from EWC.<br>
              Please do not share your verification code with anyone.
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
    subject: "EWC | Verify Your Email Address",

    text: `Welcome to Elevate World Community!

Thank you for registering with EWC.

Your email verification code is:

${safeCode}

This code expires in 5 minutes and can only be used once.

Enter this code on the EWC registration page to complete your account registration.

SECURITY INFORMATION:
- Never share your verification code.
- EWC Support will never ask for your verification code.
- If you did not request this code, ignore this email.

EWC Support Team
Elevate World Community`,

    html,
  });
};

module.exports = {
  sendRegistrationOtpEmail,
};
