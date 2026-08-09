require("dotenv").config();

const config = {
    port: process.env.PORT || 5000,
    nodeEnv: process.env.NODE_ENV || "development",
    databaseUrl: process.env.DATABASE_URL,
};

module.exports = config;
