/**
 * Notification Poller — Event Reminder Background Job
 *
 * Runs inside dream-sky's process as a setInterval.
 * Checks every 60 seconds for EventReminder rows that are due (PENDING, scheduledFor <= now)
 * and queues an IN_APP notification for each affected user, then marks the reminder as SENT.
 *
 * No external cron process or worker is required — started in server.js after the
 * server begins listening.
 */
const prisma = require("../prisma");
const { sendNotification } = require("./notification.service");

const POLL_INTERVAL_MS = 60_000; // 60 seconds
let pollerHandle = null;

async function processDueEventReminders() {
  const now = new Date();

  const reminders = await prisma.eventReminder.findMany({
    where: {
      status: "PENDING",
      scheduledFor: { lte: now },
    },
    include: {
      event: true,
    },
    orderBy: { scheduledFor: "asc" },
  });

  for (const reminder of reminders) {
    const event = reminder.event;

    // Determine audience: EVERYONE means no role filter
    const audienceRoles =
      event.audienceRoles.includes("EVERYONE") ? undefined : event.audienceRoles;

    const recipients = await prisma.user.findMany({
      where: {
        ...(audienceRoles ? { role: { in: audienceRoles } } : {}),
        ...(event.branchId
          ? { OR: [{ branchId: event.branchId }, { branchId: null }] }
          : {}),
      },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    });

    for (const recipient of recipients) {
      await sendNotification(recipient.id, `EVENT_REMINDER_${reminder.offset}`, {
        subject: `Reminder: ${event.title}`,
        message: `${event.title} is scheduled for ${event.datetime.toISOString()}.`,
        eventId: event.id,
        eventTitle: event.title,
        eventType: event.type,
        eventDatetime: event.datetime.toISOString(),
        eventLocation: event.location,
        reminderOffset: reminder.offset,
        recipientRole: recipient.role,
      });
    }

    await prisma.eventReminder.update({
      where: { id: reminder.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });
  }
}

/**
 * Start the notification poller.
 * Safe to call multiple times — only starts one interval.
 */
function startNotificationPoller() {
  if (pollerHandle) return;

  // Immediate sweep on startup
  processDueEventReminders().catch((err) => {
    console.error("[Notification Poller] Initial reminder sweep failed:", err);
  });

  pollerHandle = setInterval(() => {
    processDueEventReminders().catch((err) => {
      console.error("[Notification Poller] Reminder sweep failed:", err);
    });
  }, POLL_INTERVAL_MS);

  // Allow the process to exit normally even if this interval is pending
  if (pollerHandle.unref) pollerHandle.unref();

  console.log("[Notification Poller] Started — polling every 60s for due event reminders.");
}

module.exports = { startNotificationPoller };
