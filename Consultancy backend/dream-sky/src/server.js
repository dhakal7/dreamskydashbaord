require("dotenv").config();

const app = require("./app");
const { startNotificationPoller } = require("./services/notification.poller");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Start background notification poller (event reminders every 60s)
    startNotificationPoller();
});