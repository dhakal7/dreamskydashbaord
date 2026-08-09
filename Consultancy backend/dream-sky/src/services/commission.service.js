const prisma = require("../prisma");
const { sendNotificationEmail } = require("./email.service");

/**
 * Generate a Commission record when a student hits a trigger stage.
 *
 * @param {string} studentId - Student identifier
 * @param {string} recipientUserId - The counselor or referral agent User.id
 * @param {string} triggerStage - The pipeline stage name that was reached
 * @param {string|null} branchId - The branch context ID (nullable)
 * @param {string|null} universityId - The university context ID (nullable)
 * @param {number} [baseAmount] - Base amount (e.g. tuition fee) used for PERCENTAGE rules
 * @param {string} [currency="NPR"] - Currency
 * @returns {Promise<Object|null>} The created Commission record, or null
 */
async function generateCommission(
  studentId,
  recipientUserId,
  triggerStage,
  branchId = null,
  universityId = null,
  baseAmount,
  currency = "NPR"
) {
  console.log(
    `[Commission Service] Generating commission for student ${studentId}, recipient ${recipientUserId}, stage ${triggerStage}`
  );

  const user = await prisma.user.findUnique({
    where: { id: recipientUserId },
  });

  if (!user) {
    console.warn(`[Commission Service] Recipient user with ID ${recipientUserId} not found.`);
    return null;
  }

  let ruleRole;
  if (user.role === "COUNSELOR") {
    ruleRole = "COUNSELOR";
  } else if (user.role === "REFERRAL_AGENT") {
    ruleRole = "REFERRAL_AGENT";
  } else {
    console.warn(`[Commission Service] User role '${user.role}' is not eligible for commission.`);
    return null;
  }

  const now = new Date();
  const candidateRules = await prisma.commissionRule.findMany({
    where: {
      role: ruleRole,
      triggerStage,
      isActive: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
  });

  if (candidateRules.length === 0) {
    console.log(
      `[Commission Service] No active commission rules found for role ${ruleRole} and stage ${triggerStage}.`
    );
    return null;
  }

  let matchedRule = null;
  let highestSpecificity = -1;

  for (const rule of candidateRules) {
    let specificity = 0;
    let isMatch = true;

    if (rule.scopeBranchId) {
      if (rule.scopeBranchId === branchId) {
        specificity += 2;
      } else {
        isMatch = false;
      }
    }

    if (rule.scopeUniversityId) {
      if (rule.scopeUniversityId === universityId) {
        specificity += 4;
      } else {
        isMatch = false;
      }
    }

    if (isMatch && specificity > highestSpecificity) {
      highestSpecificity = specificity;
      matchedRule = rule;
    }
  }

  if (!matchedRule) {
    console.log(`[Commission Service] No matching rule found after applying scope filters.`);
    return null;
  }

  let computedAmount = 0;

  if (matchedRule.type === "FIXED") {
    const amount = matchedRule.fixedAmount !== null ? matchedRule.fixedAmount : matchedRule.value;
    if (amount === null || amount === undefined) {
      console.warn(`[Commission Service] Rule ${matchedRule.id} is FIXED but amount is null.`);
      return null;
    }
    computedAmount = amount;
  } else if (matchedRule.type === "PERCENTAGE") {
    const pct = matchedRule.percentage !== null ? matchedRule.percentage : matchedRule.value;
    if (pct === null || pct === undefined) {
      console.warn(`[Commission Service] Rule ${matchedRule.id} is PERCENTAGE but percentage is null.`);
      return null;
    }
    if (baseAmount === undefined || baseAmount <= 0) {
      console.warn(
        `[Commission Service] Rule ${matchedRule.id} is PERCENTAGE but baseAmount is missing or invalid (${baseAmount}).`
      );
      return null;
    }
    computedAmount = (baseAmount * pct) / 100;
  } else if (matchedRule.type === "TIERED") {
    if (!matchedRule.tierConfig) {
      console.warn(`[Commission Service] Rule ${matchedRule.id} is TIERED but tierConfig is null.`);
      return null;
    }

    const existingCount = await prisma.commission.count({
      where: {
        recipientId: recipientUserId,
        rule: {
          triggerStage,
        },
      },
    });

    const currentCount = existingCount + 1;

    let tierConfigParsed = [];
    try {
      tierConfigParsed =
        typeof matchedRule.tierConfig === "string"
          ? JSON.parse(matchedRule.tierConfig)
          : matchedRule.tierConfig;
    } catch (e) {
      console.error(
        `[Commission Service] Failed to parse tierConfig for rule ${matchedRule.id}:`,
        e
      );
      return null;
    }

    const matchedTier = tierConfigParsed.find((tier) => {
      const minOk = currentCount >= tier.minCount;
      const maxOk =
        tier.maxCount === null || tier.maxCount === undefined || currentCount <= tier.maxCount;
      return minOk && maxOk;
    });

    if (!matchedTier) {
      console.warn(
        `[Commission Service] Rule ${matchedRule.id} is TIERED but no matching tier found for count ${currentCount}.`
      );
      return null;
    }

    computedAmount = matchedTier.amount;
  }

  computedAmount = Math.round(computedAmount * 100) / 100;

  // Immutably snapshot the full rule
  const ruleSnapshot = JSON.parse(JSON.stringify(matchedRule));

  const commission = await prisma.commission.create({
    data: {
      ruleId: matchedRule.id,
      ruleSnapshot,
      recipientId: recipientUserId,
      studentId,
      amount: computedAmount,
      currency,
      status: "PENDING",
    },
  });

  console.log(
    `[Commission Service] Generated commission ${commission.id} of amount ${computedAmount} ${currency}`
  );

  // Email the recipient counselor/referral agent about the generated commission
  if (user.email) {
    sendNotificationEmail({
      to: user.email,
      subject: "Commission Generated — DreamSky Education Consultancy",
      body: `Hi ${[user.firstName, user.lastName].filter(Boolean).join(" ") || "there"},\n\nA commission of ${computedAmount} ${currency} has been generated for your student referral (${triggerStage.replace(/_/g, " ").toLowerCase()}).\n\nDreamSky Education Consultancy`,
    }).catch(() => {});
  }

  return commission;
}

/**
 * List commission rules with optional filters
 */
async function listCommissionRules(query = {}) {
  const { role, triggerStage, isActive } = query;
  const where = {};

  if (role) where.role = role;
  if (triggerStage) where.triggerStage = triggerStage;
  if (isActive !== undefined) where.isActive = isActive === "true" || isActive === true;

  return await prisma.commissionRule.findMany({
    where,
    include: {
      scopeUniversity: { select: { id: true, name: true } },
      scopeBranch: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get a commission rule by ID
 */
async function getCommissionRuleById(id) {
  return await prisma.commissionRule.findUnique({
    where: { id },
    include: {
      scopeUniversity: { select: { id: true, name: true } },
      scopeBranch: { select: { id: true, name: true } },
    },
  });
}

/**
 * Create a new commission rule
 */
async function createCommissionRule(data) {
  const {
    role,
    type,
    triggerStage,
    tierConfig,
    fixedAmount,
    percentage,
    scopeBranchId,
    scopeUniversityId,
    effectiveFrom,
    effectiveTo,
    isActive,
  } = data;

  return await prisma.commissionRule.create({
    data: {
      role,
      type,
      triggerStage,
      tierConfig: tierConfig ? JSON.parse(JSON.stringify(tierConfig)) : null,
      fixedAmount: type === "FIXED" ? fixedAmount : null,
      percentage: type === "PERCENTAGE" ? percentage : null,
      scopeBranchId: scopeBranchId || null,
      scopeUniversityId: scopeUniversityId || null,
      effectiveFrom: new Date(effectiveFrom),
      effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
      isActive: isActive !== undefined ? isActive : true,
    },
    include: {
      scopeUniversity: { select: { id: true, name: true } },
      scopeBranch: { select: { id: true, name: true } },
    },
  });
}

/**
 * Update a commission rule
 */
async function updateCommissionRule(id, data) {
  const updateData = {};
  if (data.role) updateData.role = data.role;
  if (data.type) updateData.type = data.type;
  if (data.triggerStage) updateData.triggerStage = data.triggerStage;
  if (data.tierConfig !== undefined)
    updateData.tierConfig = data.tierConfig ? JSON.parse(JSON.stringify(data.tierConfig)) : null;
  if (data.fixedAmount !== undefined) updateData.fixedAmount = data.fixedAmount;
  if (data.percentage !== undefined) updateData.percentage = data.percentage;
  if (data.scopeBranchId !== undefined) updateData.scopeBranchId = data.scopeBranchId || null;
  if (data.scopeUniversityId !== undefined)
    updateData.scopeUniversityId = data.scopeUniversityId || null;
  if (data.effectiveFrom) updateData.effectiveFrom = new Date(data.effectiveFrom);
  if (data.effectiveTo !== undefined)
    updateData.effectiveTo = data.effectiveTo ? new Date(data.effectiveTo) : null;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  return await prisma.commissionRule.update({
    where: { id },
    data: updateData,
    include: {
      scopeUniversity: { select: { id: true, name: true } },
      scopeBranch: { select: { id: true, name: true } },
    },
  });
}

/**
 * Delete a commission rule
 */
async function deleteCommissionRule(id) {
  return await prisma.commissionRule.delete({ where: { id } });
}

/**
 * List commissions with filters
 */
async function listCommissions(query = {}) {
  const { recipientId, recipientUserId, status, branchId } = query;
  const targetRecipientId = recipientId || recipientUserId;
  const where = {};

  if (targetRecipientId) where.recipientId = targetRecipientId;
  if (status) where.status = status;

  if (branchId) {
    const usersInBranch = await prisma.user.findMany({
      where: { branchId },
      select: { id: true },
    });
    const branchUserIds = usersInBranch.map((u) => u.id);
    where.OR = [
      { rule: { scopeBranchId: branchId } },
      { recipientId: { in: branchUserIds } },
    ];
  }

  return await prisma.commission.findMany({
    where,
    include: {
      rule: {
        include: {
          scopeUniversity: { select: { id: true, name: true } },
          scopeBranch: { select: { id: true, name: true } },
        },
      },
      recipient: {
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      },
      student: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get a single commission by ID
 */
async function getCommissionById(id) {
  return await prisma.commission.findUnique({
    where: { id },
    include: {
      rule: {
        include: {
          scopeUniversity: { select: { id: true, name: true } },
          scopeBranch: { select: { id: true, name: true } },
        },
      },
      recipient: {
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      },
      student: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
}

/**
 * Mark commission as paid
 */
async function markCommissionPaid(id, actorId) {
  const commission = await prisma.commission.findUnique({ where: { id } });
  if (!commission) return null;
  if (commission.status === "PAID") return { error: "ALREADY_PAID" };

  const oldStatus = commission.status;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.commission.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paidBy: actorId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        entity: "Commission",
        entityId: id,
        field: "status",
        oldValue: oldStatus,
        newValue: "PAID",
      },
    });

    return result;
  });

  // Email the recipient when their commission is marked paid
  const recipient = await prisma.user.findUnique({
    where: { id: commission.recipientId },
    select: { email: true, firstName: true, lastName: true },
  });
  if (recipient?.email) {
    sendNotificationEmail({
      to: recipient.email,
      subject: "Commission Paid — DreamSky Education Consultancy",
      body: `Hi ${[recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || "there"},\n\nYour commission of ${commission.amount} ${commission.currency} has been marked as paid.\n\nDreamSky Education Consultancy`,
    }).catch(() => {});
  }

  return updated;
}

/**
 * Dispute a commission
 */
async function disputeCommission(id, reason, actorId) {
  const commission = await prisma.commission.findUnique({ where: { id } });
  if (!commission) return null;
  if (commission.status === "PAID") return { error: "CANNOT_DISPUTE_PAID" };

  const oldStatus = commission.status;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.commission.update({
      where: { id },
      data: {
        status: "DISPUTED",
        disputeReason: reason.trim(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        entity: "Commission",
        entityId: id,
        field: "status",
        oldValue: oldStatus,
        newValue: "DISPUTED",
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        entity: "Commission",
        entityId: id,
        field: "disputeReason",
        oldValue: commission.disputeReason,
        newValue: reason.trim(),
      },
    });

    return result;
  });

  // Email the recipient when their commission is disputed
  const recipient = await prisma.user.findUnique({
    where: { id: commission.recipientId },
    select: { email: true, firstName: true, lastName: true },
  });
  if (recipient?.email) {
    sendNotificationEmail({
      to: recipient.email,
      subject: "Commission Disputed — DreamSky Education Consultancy",
      body: `Hi ${[recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || "there"},\n\nYour commission of ${commission.amount} ${commission.currency} has been disputed. Reason: ${reason.trim()}\n\nDreamSky Education Consultancy`,
    }).catch(() => {});
  }

  return updated;
}

module.exports = {
  generateCommission,
  listCommissionRules,
  getCommissionRuleById,
  createCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
  listCommissions,
  getCommissionById,
  markCommissionPaid,
  disputeCommission,
};
