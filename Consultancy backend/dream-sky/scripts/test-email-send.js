require("dotenv").config();
const { sendMail, isConfigured } = require("../src/services/email.service");

(async () => {
    if (!isConfigured()) {
        console.error("SMTP is not configured. Add SMTP_HOST / SMTP_USER / SMTP_PASS to .env and try again.");
        process.exit(1);
    }

    const to = process.argv[2] || process.env.SMTP_USER;
    console.log(`Sending test email to ${to} ...`);

    await sendMail({
        to,
        subject: "DreamSky — Test Email",
        text: "This is a test email sent from the DreamSky backend. If you received this, email sending works!",
        html: "<p>This is a <strong>test email</strong> sent from the DreamSky backend. If you received this, email sending works!</p>",
    });

    console.log("Done. Check the recipient inbox (and spam folder).");
    process.exit(0);
})().catch((err) => {
    console.error("Test email failed:", err.message);
    console.error(err);
    process.exit(1);
});
