require("dotenv").config({ override: false });

const app = require("./app");
const prisma = require("./prisma");
const { startNotificationPoller, stopNotificationPoller } = require("./services/notification.poller");

const PORT = process.env.PORT || 5000;

let server = null;
let isShuttingDown = false;

function _resetShutdownForTesting() {
  isShuttingDown = false;
}

async function handleGracefulShutdown(signal = "SIGTERM", options = {}) {
  if (isShuttingDown) {
    console.log(`[Server] Graceful shutdown already in progress. Ignoring duplicate signal ${signal}.`);
    return { alreadyShuttingDown: true };
  }
  isShuttingDown = true;
  console.log(`[Server] Received ${signal}. Initiating graceful shutdown...`);

  const pollerStopper = options.stopNotificationPoller || stopNotificationPoller;
  const targetServer = options.server || server;
  const targetPrisma = options.prismaClient || prisma;
  const pollerTimeoutMs = typeof options.pollerTimeoutMs === "number" ? options.pollerTimeoutMs : 10_000;

  // 1. Stop notification poller and await active sweeps
  let pollerResult = null;
  try {
    pollerResult = await pollerStopper({ timeoutMs: pollerTimeoutMs });
    if (pollerResult?.timedOut) {
      console.warn(`[Server] WARNING: Notification poller shutdown timed out after ${pollerTimeoutMs}ms. In-flight sweeps are still executing.`);
    } else {
      console.log("[Server] Notification poller stopped:", pollerResult);
    }
  } catch (pollerErr) {
    console.error("[Server] Error stopping notification poller during shutdown:", pollerErr.message);
  }

  // 2. Stop accepting new HTTP requests and close active server connections
  await new Promise((resolve) => {
    if (targetServer && typeof targetServer.close === "function" && targetServer.listening) {
      targetServer.close((err) => {
        if (err) {
          console.error("[Server] Error closing HTTP server:", err.message);
        } else {
          console.log("[Server] HTTP server closed successfully.");
        }
        resolve();
      });
    } else {
      resolve();
    }
  });

  // 3. Disconnect database pool ONLY IF poller did not time out with active sweeps (F-06)
  // Do not close the PostgreSQL pool while tracked sweeps may still be using it!
  if (pollerResult?.timedOut) {
    console.warn("[Server] WARNING: Database connection pool closure skipped because tracked sweeps may still be active.");
  } else {
    try {
      if (targetPrisma?.$pool?.end) {
        await targetPrisma.$pool.end();
      }
      if (targetPrisma?.$disconnect) {
        await targetPrisma.$disconnect();
      }
      console.log("[Server] Database connection closed cleanly.");
    } catch (dbErr) {
      console.error("[Server] Error disconnecting database during shutdown:", dbErr.message);
    }
  }

  if (pollerResult?.timedOut) {
    console.warn("[Server] Graceful shutdown completed with warnings (poller timed out).");
    if (process.env.NODE_ENV !== "test" && !options.skipExit) {
      process.exit(1); // Abnormal forced exit
    }
    return { completed: false, timedOut: true, signal, pollerResult };
  }

  console.log("[Server] Graceful shutdown complete.");

  if (process.env.NODE_ENV !== "test" && !options.skipExit) {
    process.exit(0);
  }

  return { completed: true, signal, pollerResult };
}

// Register OS termination signal handlers only outside test mode
if (process.env.NODE_ENV !== "test") {
  process.on("SIGTERM", () => {
    handleGracefulShutdown("SIGTERM").catch((err) => {
      console.error("[Server] Unhandled error during SIGTERM shutdown:", err);
      process.exit(1);
    });
  });

  process.on("SIGINT", () => {
    handleGracefulShutdown("SIGINT").catch((err) => {
      console.error("[Server] Unhandled error during SIGINT shutdown:", err);
      process.exit(1);
    });
  });
}

function startServer() {
  if (server) return server;
  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (process.env.ENABLE_NOTIFICATION_POLLER === "true") {
      console.log("[Notification Poller] ENABLE_NOTIFICATION_POLLER is true — starting background reminder poller.");
      startNotificationPoller();
    } else {
      console.log("[Notification Poller] Background reminder poller is disabled (ENABLE_NOTIFICATION_POLLER !== 'true').");
    }
  });
  return server;
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}

module.exports = {
  app,
  server,
  startServer,
  handleGracefulShutdown,
  _resetShutdownForTesting,
};
