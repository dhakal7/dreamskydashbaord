require("dotenv").config();

const app = require("./app");
const { startNotificationPoller } = require("./services/notification.poller");
const { autoSeedUsers } = require("./utils/auto-seeder");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    autoSeedUsers();
    startNotificationPoller();
});