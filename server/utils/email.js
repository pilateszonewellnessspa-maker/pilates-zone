/**
 * Email Utility — Brevo SMTP via Nodemailer
 *
 * Required .env variables:
 *   SMTP_HOST=smtp-relay.brevo.com
 *   SMTP_PORT=587
 *   SMTP_USER=your_brevo_login_email
 *   SMTP_PASS=your_brevo_smtp_key
 *   EMAIL_FROM=Pilates Zone <your_brevo_login_email>
 */

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: false,   // STARTTLS on port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.EMAIL_FROM || 'Pilates Zone <noreply@pilateszone.com>';

// ── Shared branded HTML wrapper ────────────────────────────────
const wrap = (body) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body  { font-family:Arial,sans-serif; background:#F5F0E8; margin:0; padding:0; }
    .box  { max-width:520px; margin:40px auto; background:#fff; border-radius:6px; overflow:hidden; box-shadow:0 4px 24px rgba(58,53,48,.10); }
    .hdr  { background:#2A2520; padding:32px 40px; text-align:center; }
    .hdr h1 { color:#B8962E; font-size:1.6rem; letter-spacing:.12em; margin:0; }
    .hdr p  { color:rgba(197,190,176,.6); font-size:.7rem; letter-spacing:.2em; text-transform:uppercase; margin:4px 0 0; }
    .bdy  { padding:40px; }
    .bdy p  { color:#3A3530; font-size:.92rem; line-height:1.7; }
    .ftr  { background:#F5F0E8; padding:20px 40px; text-align:center; }
    .ftr p  { font-size:.72rem; color:#9C937F; margin:0; }
  </style>
</head>
<body>
  <div class="box">
    <div class="hdr"><h1>PILATES ZONE</h1><p>Wellness Spa</p></div>
    <div class="bdy">${body}</div>
    <div class="ftr"><p>© 2025 Pilates Zone Wellness Spa. All rights reserved.</p></div>
  </div>
</body>
</html>`;

// ── Send OTP email (email verification) ────────────────────────
exports.sendOTPEmail = async ({ to, name, otp }) => {
  const html = wrap(`
    <p>Hello <strong>${name}</strong>,</p>
    <p>Thank you for joining Pilates Zone. Use the OTP below to verify your email. It expires in <strong>10 minutes</strong>.</p>
    <div style="background:#F5F0E8;border:2px solid #B8962E;border-radius:6px;text-align:center;padding:20px;margin:28px 0;">
      <span style="font-size:2.4rem;font-weight:700;color:#B8962E;letter-spacing:.3em;">${otp}</span>
    </div>
    <p>If you did not request this, you can safely ignore this email.</p>
    <p>With warm regards,<br><strong>Pilates Zone Team</strong></p>
  `);

  const info = await transporter.sendMail({
    from: FROM, to,
    subject: 'Your Pilates Zone Email Verification OTP',
    html,
  });
  console.log('✅ OTP email sent:', info.messageId);
  return info;
};

// ── Send receipt email (after payment approved) ─────────────────
exports.sendReceiptEmail = async ({ to, name, receipt }) => {
  const html = wrap(`
    <p>Dear <strong>${name}</strong>,</p>
    <p>Your payment was verified! Your membership is now active.</p>
    <div style="background:#F5F0E8;border-left:3px solid #B8962E;padding:20px 24px;margin:24px 0;border-radius:0 4px 4px 0;">
      <table style="width:100%;font-size:.875rem;color:#3A3530;border-collapse:collapse;">
        <tr style="border-bottom:1px solid rgba(184,150,46,.12)"><td style="padding:6px 0;color:#9C937F;">Invoice #</td><td>${receipt.invoiceNumber}</td></tr>
        <tr style="border-bottom:1px solid rgba(184,150,46,.12)"><td style="padding:6px 0;color:#9C937F;">Plan</td><td>${receipt.planName}</td></tr>
        <tr style="border-bottom:1px solid rgba(184,150,46,.12)"><td style="padding:6px 0;color:#9C937F;">Date</td><td>${new Date(receipt.createdAt || Date.now()).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}</td></tr>
        <tr><td style="padding:6px 0;color:#9C937F;font-weight:700;">Amount Paid</td><td style="color:#B8962E;font-weight:700;font-size:1rem;">₹${Number(receipt.amount).toLocaleString('en-IN')}</td></tr>
      </table>
    </div>
    <p>Log in to your dashboard to view your full receipt.</p>
  `);

  const info = await transporter.sendMail({
    from: FROM, to,
    subject: `Payment Confirmed – ${receipt.planName} | Pilates Zone`,
    html,
  });
  console.log('✅ Receipt email sent:', info.messageId);
  return info;
};

// ── Send password reset email ───────────────────────────────────
exports.sendPasswordResetEmail = async ({ to, name, resetLink }) => {
  const html = wrap(`
    <p>Hello <strong>${name}</strong>,</p>
    <p>We received a request to reset your password. Click the button below — this link expires in <strong>1 hour</strong>.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${resetLink}"
         style="display:inline-block;background:#B8962E;color:#fff;text-decoration:none;padding:14px 36px;border-radius:2px;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;font-weight:600;">
        Reset My Password
      </a>
    </div>
    <p style="font-size:.78rem;color:#9C937F;">If you did not request a password reset, you can safely ignore this email.</p>
    <p>With warm regards,<br><strong>Pilates Zone Team</strong></p>
  `);

  const info = await transporter.sendMail({
    from: FROM, to,
    subject: 'Reset Your Pilates Zone Password',
    html,
  });
  console.log('✅ Password reset email sent:', info.messageId);
  return info;
};
