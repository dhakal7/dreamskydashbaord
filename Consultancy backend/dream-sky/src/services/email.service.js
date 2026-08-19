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

const staffInvitationHtml = (staffName, email, role, tempPassword) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#2563eb;padding:20px 28px">
    <h2 style="color:#ffffff;margin:0;font-size:20px">DreamSky Staff Invitation</h2>
  </div>
  <div style="padding:28px">
    <p style="font-size:15px;color:#111827">Hello <strong>${staffName}</strong>,</p>
    <p style="font-size:15px;color:#374151;line-height:1.6">
      You have been invited to join the DreamSky Education Consultancy team as <strong>${role.replace(/_/g, " ")}</strong>.
      Below are your temporary credentials to access the CRM portal.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
      <tr>
        <td style="padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;color:#6b7280">Login Email</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600">${email}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;color:#6b7280">Temporary Password</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600">${tempPassword}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;color:#6b7280">Assigned Role</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600">${role}</td>
      </tr>
    </table>
    <p style="font-size:14px;color:#6b7280;line-height:1.5">
      Please sign in to your dashboard and change your password immediately.
    </p>
  </div>
</div>`;

const sendStaffInvitationEmail = ({ to, staffName, role, tempPassword }) => {
    const subject = "Invitation to Join DreamSky Education Consultancy CRM";
    const text = `Hello ${staffName},\n\nYou have been invited to join DreamSky as ${role}.\n\nLogin Email: ${to}\nTemporary Password: ${tempPassword}\n\nPlease sign in and update your password.\n\nDreamSky Team`;
    return sendMail({ to, subject, text, html: staffInvitationHtml(staffName, to, role, tempPassword) });
};

const sendEventNotificationEmail = ({ to, recipientName, eventTitle, datetime, location, description }) => {
    const subject = `Event Announcement: ${eventTitle}`;
    const text = `Hi ${recipientName},\n\nYou are invited to the upcoming event: ${eventTitle}\n\nDate & Time: ${datetime}\nLocation: ${location || "TBD"}\nDetails: ${description || ""}\n\nDreamSky Team`;
    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#dc2626;padding:20px 28px">
    <h2 style="color:#ffffff;margin:0;font-size:20px">DreamSky Event Announcement</h2>
  </div>
  <div style="padding:28px">
    <p style="font-size:15px;color:#111827">Hi <strong>${recipientName}</strong>,</p>
    <p style="font-size:15px;color:#374151;line-height:1.6">
      You are invited to an upcoming event hosted by DreamSky Education Consultancy:
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
      <h3 style="margin:0 0 8px 0;color:#111827">${eventTitle}</h3>
      <p style="margin:4px 0;font-size:14px;color:#4b5563"><strong>Date & Time:</strong> ${datetime}</p>
      <p style="margin:4px 0;font-size:14px;color:#4b5563"><strong>Location:</strong> ${location || "Online / TBD"}</p>
      ${description ? `<p style="margin:8px 0 0 0;font-size:14px;color:#6b7280">${description}</p>` : ""}
    </div>
  </div>
</div>`;
    return sendMail({ to, subject, text, html });
};

const sendFeeDueEmail = ({ to, studentName, feeCategory, dueAmount, currency = "NPR", dueDate, notes }) => {
    const subject = `Fee Payment Reminder Notice — ${feeCategory} Due (${currency} ${dueAmount.toLocaleString()})`;
    const text = `Hi ${studentName},\n\nThis is a friendly reminder from DreamSky Education Consultancy regarding your pending ${feeCategory}.\n\nFee Category: ${feeCategory}\nDue Amount: ${currency} ${dueAmount}\nDue Date: ${dueDate || 'Immediate'}\n${notes ? `Notes: ${notes}\n` : ''}\nPlease clear your due balance at the front desk or via online bank transfer at your earliest convenience.\n\nThank you,\nFront Desk Team\nDreamSky Education Consultancy`;
    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#d97706;padding:22px 28px">
    <h2 style="color:#ffffff;margin:0;font-size:20px">DreamSky Education Consultancy</h2>
    <p style="color:#fef3c7;margin:4px 0 0 0;font-size:13px font-weight:500">Official Fee Due Reminder</p>
  </div>
  <div style="padding:28px">
    <p style="font-size:15px;color:#111827">Dear <strong>${studentName}</strong>,</p>
    <p style="font-size:14px;color:#374151;line-height:1.6">
      This is an official notice regarding an outstanding fee balance associated with your account.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
      <tr style="background:#f9fafb">
        <td style="padding:10px 14px;border:1px solid #e5e7eb;color:#6b7280">Fee Description</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;color:#111827">${feeCategory}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;color:#6b7280">Outstanding Balance</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:700;color:#dc2626">${currency} ${dueAmount.toLocaleString()}</td>
      </tr>
      <tr style="background:#f9fafb">
        <td style="padding:10px 14px;border:1px solid #e5e7eb;color:#6b7280">Payment Due Date</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-weight:600;color:#111827">${dueDate || 'Immediate'}</td>
      </tr>
    </table>
    ${notes ? `<p style="font-size:13px;color:#4b5563;background:#fffbeb;padding:12px;border-left:4px solid #f59e0b;border-radius:4px"><strong>Note from Front Desk:</strong> ${notes}</p>` : ''}
    <p style="font-size:14px;color:#374151;line-height:1.5">
      Kindly visit our Front Desk or process an online transfer to settle your due fee promptly.
    </p>
    <p style="font-size:13px;color:#9ca3af;margin-top:24px;border-top:1px dashed #e5e7eb;padding-top:12px">
      If you have already completed this payment, please disregard this automated notification or submit your receipt copy to the front desk officer.
    </p>
  </div>
</div>`;
    return sendMail({ to, subject, text, html });
};

const sendNotificationEmail = ({ to, subject, body }) =>
    sendMail({
        to,
        subject,
        text: body,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:20px;border:1px solid #e5e7eb;border-radius:12px"><p style="color:#374151;font-size:15px;line-height:1.6">${body.replace(/\n/g, "<br/>")}</p></div>`,
    });

module.exports = {
    sendMail,
    sendWelcomeStudentEmail,
    sendStaffInvitationEmail,
    sendEventNotificationEmail,
    sendNotificationEmail,
    sendFeeDueEmail,
    isConfigured
};


