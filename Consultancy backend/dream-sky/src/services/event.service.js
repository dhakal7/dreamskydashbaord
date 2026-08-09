const prisma = require("../prisma");

const EVERYONE_TOKEN = "EVERYONE";

const VALID_EVENT_TYPES = ["SEMINAR", "UNI_VISIT", "FAIR", "WEBINAR", "MEETING", "WORKSHOP", "ORIENTATION", "OTHER"];
const VALID_REMINDER_OFFSETS = ["ONE_MONTH", "ONE_WEEK", "ONE_DAY", "SAME_DAY"];

/**
 * Compute scheduledFor date from ReminderOffset
 */
function computeReminderDate(eventDatetime, offset) {
  const d = new Date(eventDatetime.getTime());
  switch (offset) {
    case "ONE_MONTH":
      d.setMonth(d.getMonth() - 1);
      break;
    case "ONE_WEEK":
      d.setDate(d.getDate() - 7);
      break;
    case "ONE_DAY":
      d.setDate(d.getDate() - 1);
      break;
    case "SAME_DAY":
      d.setHours(8, 0, 0, 0);
      break;
  }
  return d;
}

/**
 * Auto-generate 4 EventReminder rows for an event.
 * Skips any whose scheduledFor is already in the past.
 */
async function generateEventReminders(tx, eventId, eventDatetime) {
  const now = new Date();
  const offsets = ["ONE_MONTH", "ONE_WEEK", "ONE_DAY", "SAME_DAY"];

  for (const offset of offsets) {
    const scheduledFor = computeReminderDate(eventDatetime, offset);
    if (scheduledFor <= now) continue;

    await tx.eventReminder.upsert({
      where: { eventId_offset: { eventId, offset } },
      create: {
        eventId,
        offset,
        scheduledFor,
        status: "PENDING",
      },
      update: {
        scheduledFor,
        status: "PENDING",
        sentAt: null,
      },
    });
  }
}

/**
 * Create an event
 */
async function createEvent(data, currentUser) {
  const { title, description, type, datetime, location, branchId, audienceRoles } = data;

  const eventDatetime = new Date(datetime);
  if (isNaN(eventDatetime.getTime())) {
    return { error: "INVALID_DATETIME" };
  }

  if (branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return { error: "BRANCH_NOT_FOUND" };
  }

  const isSuperAdmin = currentUser.role === "SUPER_ADMIN";
  const approvalStatus = isSuperAdmin ? "APPROVED" : "REQUESTED";

  let createdEvent;

  await prisma.$transaction(async (tx) => {
    createdEvent = await tx.event.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        type,
        datetime: eventDatetime,
        location: location ? location.trim() : null,
        createdById: currentUser.id,
        branchId: branchId || null,
        audienceRoles,
        approvalStatus,
        approvedById: isSuperAdmin ? currentUser.id : null,
        approvedAt: isSuperAdmin ? new Date() : null,
      },
      include: { reminders: true },
    });

    if (isSuperAdmin) {
      await generateEventReminders(tx, createdEvent.id, eventDatetime);
    }
  });

  const result = await prisma.event.findUnique({
    where: { id: createdEvent.id },
    include: { branch: true, reminders: true },
  });

  return { event: result };
}

/**
 * List events based on user role and filters
 */
async function listEvents(query, currentUser) {
  const { startDate, endDate, type, approvalStatus } = query;

  const effectiveRoles =
    currentUser.role === "SUPER_ADMIN" ? undefined : [EVERYONE_TOKEN, currentUser.role];

  const dateFilter = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) dateFilter.lte = new Date(endDate);

  const approvalFilter =
    currentUser.role === "SUPER_ADMIN" ? approvalStatus : "APPROVED";

  const where = {
    ...(approvalFilter ? { approvalStatus: approvalFilter } : {}),
    ...(Object.keys(dateFilter).length > 0 ? { datetime: dateFilter } : {}),
    ...(type ? { type } : {}),
  };

  if (effectiveRoles) {
    where.audienceRoles = { hasSome: effectiveRoles };
  }

  if (currentUser.role !== "SUPER_ADMIN") {
    where.OR = [
      { branchId: null },
      ...(currentUser.branchId ? [{ branchId: currentUser.branchId }] : []),
    ];
  }

  return await prisma.event.findMany({
    where,
    include: {
      branch: true,
      reminders: currentUser.role === "SUPER_ADMIN",
    },
    orderBy: { datetime: "asc" },
  });
}

/**
 * Get single event by ID
 */
async function getEventById(id, currentUser) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      branch: true,
      reminders: currentUser.role === "SUPER_ADMIN",
    },
  });

  if (!event) return { error: "NOT_FOUND" };

  if (currentUser.role !== "SUPER_ADMIN") {
    if (event.approvalStatus !== "APPROVED") {
      if (event.createdById !== currentUser.id) {
        return { error: "FORBIDDEN" };
      }
    }
  }

  return { event };
}

/**
 * Update an event
 */
async function updateEvent(id, data, currentUser) {
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) return { error: "NOT_FOUND" };

  if (currentUser.role !== "SUPER_ADMIN") {
    if (existing.createdById !== currentUser.id || existing.approvalStatus !== "REQUESTED") {
      return { error: "FORBIDDEN", message: "You can only update your own pending (REQUESTED) events." };
    }
  }

  const { title, description, type, datetime, location, branchId, audienceRoles } = data;
  const updateData = {};

  if (title) updateData.title = title.trim();
  if (description) updateData.description = description.trim();
  if (type) updateData.type = type;
  if (location !== undefined) updateData.location = location ? location.trim() : null;
  if (audienceRoles) updateData.audienceRoles = audienceRoles;
  if (branchId !== undefined && currentUser.role === "SUPER_ADMIN") {
    updateData.branchId = branchId || null;
  }

  let newDatetime;
  if (datetime) {
    newDatetime = new Date(datetime);
    if (isNaN(newDatetime.getTime())) return { error: "INVALID_DATETIME" };
    updateData.datetime = newDatetime;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const ev = await tx.event.update({ where: { id }, data: updateData });

    if (newDatetime && ev.approvalStatus === "APPROVED") {
      await tx.eventReminder.deleteMany({ where: { eventId: id, status: "PENDING" } });
      await generateEventReminders(tx, id, newDatetime);
    }

    return ev;
  });

  const result = await prisma.event.findUnique({
    where: { id: updated.id },
    include: { branch: true, reminders: currentUser.role === "SUPER_ADMIN" },
  });

  return { event: result };
}

/**
 * Delete an event
 */
async function deleteEvent(id, currentUser) {
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) return { error: "NOT_FOUND" };

  if (currentUser.role !== "SUPER_ADMIN") {
    if (existing.createdById !== currentUser.id || existing.approvalStatus !== "REQUESTED") {
      return { error: "FORBIDDEN", message: "You can only delete your own pending (REQUESTED) events." };
    }
  }

  await prisma.event.delete({ where: { id } });
  return { deleted: true, id };
}

/**
 * Approve a REQUESTED event (SUPER_ADMIN only)
 */
async function approveEvent(id, currentUser) {
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) return { error: "NOT_FOUND" };

  if (existing.approvalStatus !== "REQUESTED") {
    return { error: "WRONG_STATUS", currentStatus: existing.approvalStatus };
  }

  const result = await prisma.$transaction(async (tx) => {
    const ev = await tx.event.update({
      where: { id },
      data: {
        approvalStatus: "APPROVED",
        approvedById: currentUser.id,
        approvedAt: new Date(),
      },
    });

    await generateEventReminders(tx, id, ev.datetime);
    return ev;
  });

  const event = await prisma.event.findUnique({
    where: { id: result.id },
    include: { branch: true, reminders: true },
  });

  return { event };
}

/**
 * Reject a REQUESTED event (SUPER_ADMIN only)
 */
async function rejectEvent(id, currentUser) {
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) return { error: "NOT_FOUND" };

  if (existing.approvalStatus !== "REQUESTED") {
    return { error: "WRONG_STATUS", currentStatus: existing.approvalStatus };
  }

  const updated = await prisma.event.update({
    where: { id },
    data: {
      approvalStatus: "REJECTED",
      approvedById: currentUser.id,
      approvedAt: new Date(),
    },
    include: { branch: true },
  });

  return { event: updated };
}

/**
 * Get calendar-optimised event feed
 */
async function getCalendarEvents(query, currentUser) {
  const { year, month, startDate, endDate } = query;

  let start, end;

  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
  } else if (year && month) {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10) - 1;
    start = new Date(Date.UTC(y, m, 1));
    end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  } else {
    const now = new Date();
    start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
  }

  const effectiveRoles =
    currentUser.role === "SUPER_ADMIN" ? undefined : [EVERYONE_TOKEN, currentUser.role];

  const where = {
    ...(currentUser.role !== "SUPER_ADMIN" ? { approvalStatus: "APPROVED" } : {}),
    datetime: { gte: start, lte: end },
  };

  if (effectiveRoles) {
    where.audienceRoles = { hasSome: effectiveRoles };
  }

  if (currentUser.role !== "SUPER_ADMIN") {
    where.OR = [
      { branchId: null },
      ...(currentUser.branchId ? [{ branchId: currentUser.branchId }] : []),
    ];
  }

  return await prisma.event.findMany({
    where,
    include: { branch: true },
    orderBy: { datetime: "asc" },
  });
}

module.exports = {
  createEvent,
  listEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  approveEvent,
  rejectEvent,
  getCalendarEvents,
  VALID_EVENT_TYPES,
};
