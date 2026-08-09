const nodemailer = require("nodemailer");

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || (SMTP_USER ? `"DreamSky Education Consultancy" <${SMTP_USER}>` : "");

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

const isConfigured = () => Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

const sendMail = async ({ to, subject, text, html }) => {
    if (!isConfigured()) {
        console.warn(`[email] SMTP not configured — skipping email to ${to}`);
        return { skipped: true };
    }
    const info = await transporter.sendMail({ from: EMAIL_FROM, to, subject, text, html });
    console.log(`[email] sent "${subject}" to ${to} (messageId: ${info.messageId})`);
    return info;
};

const welcomeHtml = (studentName, email, tempPassword) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#7c3aed;padding:20px 28px">
    <h2 style="color:#ffffff;margin:0;font-size:20px">DreamSky Education Consultancy</h2>
  </div>
  <div style="padding:28px">
    <p style="font-size:15px;color:#111827">Hi <strong>${studentName}</strong>,</p>
    <p style="font-size:15px;color:#374151;line-height:1.6">
      Welcome to DreamSky Education Consultancy! Your student portal account has been created.
      Use the credentials below to sign in and track your applications, visa status, documents and more.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
      <tr>
        <td style="padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;color:#6b7280">Portal email</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600">${email}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;color:#6b7280">Temporary password</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600">${tempPassword}</td>
      </tr>
    </table>
    <p style="font-size:14px;color:#6b7280;line-height:1.5">
      For security, you will be asked to set a new password on your first login.
    </p>
    <p style="font-size:13px;color:#9ca3af;margin-top:24px">
      If you did not expect this email, you can safely ignore it.
    </p>
  </div>
</div>`;

const sendWelcomeStudentEmail = ({ to, studentName, tempPassword }) => {
    const subject = "Welcome to DreamSky — Your Student Portal Access";
    const text = `Hi ${studentName},\n\nWelcome to DreamSky Education Consultancy! Your student portal account has been created.\n\nPortal email: ${to}\nTemporary password: ${tempPassword}\n\nYou will be asked to set a new password on your first login.\n\nDreamSky Education Consultancy`;
    return sendMail({ to, subject, text, html: welcomeHtml(studentName, to, tempPassword) });
};

const sendNotificationEmail = ({ to, subject, body }) =>
    sendMail({
        to,
        subject,
        text: body,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:20px;border:1px solid #e5e7eb;border-radius:12px"><p style="color:#374151;font-size:15px;line-height:1.6">${body.replace(/\n/g, "<br/>")}</p></div>`,
    });

module.exports = { sendMail, sendWelcomeStudentEmail, sendNotificationEmail, isConfigured };
