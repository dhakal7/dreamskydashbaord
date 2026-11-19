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

  // Phase 8C Part D: Prevent duplicate commission generation for the same student, rule, and recipient.
  // Note: Without a DB-level unique constraint on (studentId, ruleId, recipientId), concurrent requests
  // could theoretically race past this findFirst check; this application-level check prevents duplicates
  // in normal sequential execution (retries, duplicate stage events, or idempotent webhook re-deliveries).
  const existingCommission = await prisma.commission.findFirst({
    where: {
      studentId,
      ruleId: matchedRule.id,
      recipientId: recipientUserId,
      status: { not: "CANCELLED" },
    },
  });

  if (existingCommission) {
    console.log(
      `[Commission Service] Commission already exists for student ${studentId}, rule ${matchedRule.id}, recipient ${recipientUserId} (ID: ${existingCommission.id}). Reusing existing commission.`
    );
    return existingCommission;
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

    const unassignedUsers = await prisma.user.findMany({
      where: { branchId: null },
      select: { id: true },
    });
    const unassignedUserIds = unassignedUsers.map((u) => u.id);

    where.OR = [
      { recipientId: { in: branchUserIds } },
      {
        recipientId: { in: unassignedUserIds },
        rule: { scopeBranchId: branchId },
      },
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
        select: { id: true, firstName: true, lastName: true, email: true, role: true, branchId: true },
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
        select: { id: true, firstName: true, lastName: true, email: true, role: true, branchId: true },
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

/**
 * Automatically evaluates and triggers commission generation for Counselor and Referral Agent
 * when a student achieves visa approval.
 *
 * @param {string} studentId
 * @param {string} [visaCaseId]
 * @returns {Promise<{ counselorCommission: Object|null, agentCommission: Object|null }>}
 */
async function evaluateVisaApprovalCommissions(studentId, visaCaseId = null) {
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        assignedCounselor: {
          select: { id: true, role: true, branchId: true },
        },
        referredByAgent: {
          include: {
            user: { select: { id: true, role: true, branchId: true } },
          },
        },
        applications: {
          where: { status: { notIn: ["WITHDRAWN", "REJECTED"] } },
          include: { university: { select: { id: true } } },
          take: 1,
        },
      },
    });

    if (!student) {
      console.warn(`[Commission Service] evaluateVisaApprovalCommissions: student ${studentId} not found`);
      return { counselorCommission: null, agentCommission: null };
    }

    const universityId = student.applications[0]?.universityId || null;
    const branchId = student.assignedCounselor?.branchId || null;

    let counselorCommission = null;
    let agentCommission = null;

    // 1. Generate Counselor Commission
    if (student.assignedCounselorId && student.assignedCounselor?.role === "COUNSELOR") {
      counselorCommission = await generateCommission(
        student.id,
        student.assignedCounselorId,
        "VISA_APPROVED",
        branchId,
        universityId
      );
    }

    // 2. Generate Referral Agent Commission
    if (student.referredByAgent?.user?.id) {
      agentCommission = await generateCommission(
        student.id,
        student.referredByAgent.user.id,
        "VISA_APPROVED",
        branchId,
        universityId
      );
    }

    return { counselorCommission, agentCommission };
  } catch (err) {
    console.error(`[Commission Service] evaluateVisaApprovalCommissions error for student ${studentId}:`, err);
    return { counselorCommission: null, agentCommission: null, error: err.message };
  }
}

/**
 * Get individual Commission Profile for a Counselor
 */
async function getCounselorCommissionProfile(counselorId) {
  const counselor = await prisma.user.findUnique({
    where: { id: counselorId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      branchId: true,
      branch: { select: { id: true, name: true } },
    },
  });

  if (!counselor) return null;

  // Aggregate funnel metrics
  const [
    totalAssigned,
    totalCounseled,
    totalApplications,
    totalVisaApplications,
    totalVisaApproved,
    totalDeparted,
    commissions,
    students,
  ] = await Promise.all([
    // 1. Total students assigned
    prisma.student.count({
      where: { assignedCounselorId: counselorId, isActive: true },
    }),

    // 2. Total students counseled (moved past lead)
    prisma.student.count({
      where: { assignedCounselorId: counselorId, isActive: true, currentStage: { notIn: ["LEAD"] } },
    }),

    // 3. Applications submitted
    prisma.application.count({
      where: {
        student: { assignedCounselorId: counselorId, isActive: true },
        status: { notIn: ["DRAFT"] },
      },
    }),

    // 4. Visa applications lodged
    prisma.visaCase.count({
      where: {
        application: {
          student: { assignedCounselorId: counselorId, isActive: true },
        },
      },
    }),

    // 5. Total Visa Approved students
    prisma.student.count({
      where: {
        assignedCounselorId: counselorId,
        isActive: true,
        OR: [
          { currentStage: { in: ["VISA_APPROVED", "DEPARTED"] } },
          { applications: { some: { visaCase: { status: "APPROVED" } } } },
        ],
      },
    }),

    // 6. Total departed students
    prisma.student.count({
      where: {
        assignedCounselorId: counselorId,
        isActive: true,
        currentStage: "DEPARTED",
      },
    }),

    // 7. Commissions list
    prisma.commission.findMany({
      where: { recipientId: counselorId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        rule: { select: { id: true, triggerStage: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // 8. Student-wise details
    prisma.student.findMany({
      where: { assignedCounselorId: counselorId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        currentStage: true,
        academicBackground: true,
        createdAt: true,
        applications: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            intake: true,
            university: { select: { id: true, name: true, country: { select: { id: true, name: true } } } },
            course: { select: { id: true, name: true } },
            visaCase: { select: { id: true, status: true, decisionAt: true, submittedAt: true } },
          },
        },
        commissions: {
          where: { recipientId: counselorId },
          take: 1,
          select: { id: true, amount: true, currency: true, status: true, paidAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const totalEarned = commissions
    .filter((c) => c.status !== "CANCELLED")
    .reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalPaid = commissions
    .filter((c) => c.status === "PAID")
    .reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalOutstanding = commissions
    .filter((c) => c.status === "PENDING" || c.status === "PAYABLE")
    .reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalDisputed = commissions
    .filter((c) => c.status === "DISPUTED")
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  const formattedStudents = students.map((s) => {
    const app = s.applications[0];
    const vc = app?.visaCase;
    const comm = s.commissions[0];
    const bg = s.academicBackground && typeof s.academicBackground === "object" ? s.academicBackground : {};
    const departure = bg.departureDetails || {};

    const isVisaApproved = s.currentStage === "VISA_APPROVED" || s.currentStage === "DEPARTED" || vc?.status === "APPROVED";

    return {
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`.trim(),
      email: s.email,
      phone: s.phone,
      destinationCountry: app?.university?.country?.name || "General",
      universityName: app?.university?.name || "Unassigned",
      courseName: app?.course?.name || "Course",
      intake: app?.intake || "Upcoming",
      visaStatus: vc?.status || (isVisaApproved ? "APPROVED" : "NOT_APPLIED"),
      visaGrantDate: vc?.decisionAt || null,
      departureStatus: departure.status || (s.currentStage === "DEPARTED" ? "DEPARTED" : isVisaApproved ? "VISA_GRANTED" : "NOT_APPLICABLE"),
      isCommissionEligible: isVisaApproved,
      commissionAmount: comm?.amount ?? (isVisaApproved ? 15000 : 0),
      commissionStatus: comm?.status ?? (isVisaApproved ? "PENDING" : "NOT_ELIGIBLE"),
      commissionId: comm?.id || null,
    };
  });

  return {
    counselor: {
      id: counselor.id,
      name: `${counselor.firstName} ${counselor.lastName}`.trim(),
      email: counselor.email,
      branchName: counselor.branch?.name || "Head Office",
    },
    performance: {
      totalAssigned,
      totalCounseled,
      totalApplications,
      totalVisaApplications,
      totalVisaApproved,
      totalDeparted,
      conversionRate: totalAssigned > 0 ? Math.round((totalVisaApproved / totalAssigned) * 100) : 0,
    },
    financials: {
      totalEligible: totalEarned || 0,
      totalEarned: totalEarned || 0,
      totalPaid: totalPaid || 0,
      totalOutstanding: totalOutstanding || 0,
      totalPending: commissions.filter((c) => c.status === "PENDING").reduce((sum, c) => sum + (c.amount || 0), 0),
      totalDisputed: totalDisputed || 0,
      currency: "NPR",
    },
    students: formattedStudents,
    commissionHistory: commissions.map((c) => {
      let snapshot = c.ruleSnapshot;
      if (typeof snapshot === "string") {
        try { snapshot = JSON.parse(snapshot); } catch { snapshot = {}; }
      }
      return {
        id: c.id,
        studentId: c.studentId,
        studentName: c.student ? `${c.student.firstName} ${c.student.lastName}`.trim() : "Student",
        amount: c.amount || 0,
        currency: c.currency || "NPR",
        status: c.status,
        triggerStage: snapshot?.triggerStage || c.rule?.triggerStage || "VISA_APPROVED",
        generatedAt: c.createdAt,
        paidAt: c.paidAt,
      };
    }),
  };
}

/**
 * Get individual Commission Profile for a Referral Agent
 */
async function getReferralAgentCommissionProfile(agentId) {
  // Can be User.id or ReferralAgentProfile.id
  let agentProfile = await prisma.referralAgentProfile.findFirst({
    where: { OR: [{ id: agentId }, { userId: agentId }] },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, branchId: true },
      },
    },
  });

  if (!agentProfile) return null;

  const agentUserId = agentProfile.user.id;
  const profileId = agentProfile.id;

  const [
    totalReferred,
    totalProcessed,
    totalVisaApplications,
    totalVisaApproved,
    totalDeparted,
    commissions,
    students,
  ] = await Promise.all([
    // 1. Total referred
    prisma.student.count({
      where: { referredByAgentId: profileId, isActive: true },
    }),

    // 2. Processed past lead stage
    prisma.student.count({
      where: { referredByAgentId: profileId, isActive: true, currentStage: { notIn: ["LEAD"] } },
    }),

    // 3. Visa applications
    prisma.visaCase.count({
      where: {
        application: {
          student: { referredByAgentId: profileId, isActive: true },
        },
      },
    }),

    // 4. Visa approved
    prisma.student.count({
      where: {
        referredByAgentId: profileId,
        isActive: true,
        OR: [
          { currentStage: { in: ["VISA_APPROVED", "DEPARTED"] } },
          { applications: { some: { visaCase: { status: "APPROVED" } } } },
        ],
      },
    }),

    // 5. Departed
    prisma.student.count({
      where: {
        referredByAgentId: profileId,
        isActive: true,
        currentStage: "DEPARTED",
      },
    }),

    // 6. Commissions
    prisma.commission.findMany({
      where: { recipientId: agentUserId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // 7. Students referred
    prisma.student.findMany({
      where: { referredByAgentId: profileId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        currentStage: true,
        createdAt: true,
        assignedCounselor: { select: { id: true, firstName: true, lastName: true } },
        applications: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            intake: true,
            university: { select: { id: true, name: true, country: { select: { id: true, name: true } } } },
            course: { select: { id: true, name: true } },
            visaCase: { select: { id: true, status: true, decisionAt: true } },
          },
        },
        commissions: {
          where: { recipientId: agentUserId },
          take: 1,
          select: { id: true, amount: true, currency: true, status: true, paidAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const totalEarned = commissions
    .filter((c) => c.status !== "CANCELLED")
    .reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalPaid = commissions
    .filter((c) => c.status === "PAID")
    .reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalOutstanding = commissions
    .filter((c) => c.status === "PENDING" || c.status === "PAYABLE")
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  const formattedReferrals = students.map((s) => {
    const app = s.applications[0];
    const vc = app?.visaCase;
    const comm = s.commissions[0];
    const isVisaApproved = s.currentStage === "VISA_APPROVED" || s.currentStage === "DEPARTED" || vc?.status === "APPROVED";

    return {
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`.trim(),
      email: s.email,
      phone: s.phone,
      referralDate: s.createdAt,
      counselorName: s.assignedCounselor ? `${s.assignedCounselor.firstName} ${s.assignedCounselor.lastName}`.trim() : "Unassigned",
      destinationCountry: app?.university?.country?.name || "General",
      universityName: app?.university?.name || "Unassigned",
      courseName: app?.course?.name || "Course",
      visaStatus: vc?.status || (isVisaApproved ? "APPROVED" : "NOT_APPLIED"),
      visaGrantDate: vc?.decisionAt || null,
      departureStatus: s.currentStage === "DEPARTED" ? "DEPARTED" : isVisaApproved ? "VISA_GRANTED" : "NOT_APPLICABLE",
      commissionAmount: comm?.amount ?? (isVisaApproved ? 10000 : 0),
      commissionStatus: comm?.status ?? (isVisaApproved ? "PENDING" : "NOT_ELIGIBLE"),
      commissionId: comm?.id || null,
    };
  });

  return {
    agent: {
      profileId: agentProfile.id,
      userId: agentProfile.user.id,
      name: `${agentProfile.user.firstName} ${agentProfile.user.lastName}`.trim(),
      email: agentProfile.user.email,
      referralCode: agentProfile.referralCode,
      bankDetails: agentProfile.bankDetails,
    },
    performance: {
      totalReferred,
      totalProcessed,
      totalVisaApplications,
      totalVisaApproved,
      totalDeparted,
      conversionRate: totalReferred > 0 ? Math.round((totalVisaApproved / totalReferred) * 100) : 0,
    },
    financials: {
      totalEarned,
      totalPaid,
      totalOutstanding,
      currency: "NPR",
    },
    referrals: formattedReferrals,
    commissionHistory: commissions.map((c) => ({
      id: c.id,
      studentId: c.studentId,
      studentName: c.student ? `${c.student.firstName} ${c.student.lastName}`.trim() : "Student",
      amount: c.amount,
      currency: c.currency,
      status: c.status,
      generatedAt: c.createdAt,
      paidAt: c.paidAt,
    })),
  };
}

/**
 * Get Annual Commission Settlement Summary across Counselors and Referral Agents
 */
async function getAnnualCommissionSettlement(yearQuery) {
  const year = parseInt(yearQuery, 10) || new Date().getFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const endOfYear = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const commissions = await prisma.commission.findMany({
    where: {
      createdAt: { gte: startOfYear, lte: endOfYear },
    },
    include: {
      recipient: {
        select: { id: true, firstName: true, lastName: true, email: true, role: true, branchId: true },
      },
      student: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const counselorMap = new Map();
  const agentMap = new Map();

  for (const c of commissions) {
    if (c.status === "CANCELLED") continue;
    const r = c.recipient;
    if (!r) continue;

    const targetMap = r.role === "REFERRAL_AGENT" ? agentMap : counselorMap;
    const existing = targetMap.get(r.id) || {
      id: r.id,
      name: `${r.firstName} ${r.lastName}`.trim(),
      email: r.email,
      role: r.role,
      totalCommissionsCount: 0,
      totalEarned: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      commissionIds: [],
    };

    existing.totalCommissionsCount += 1;
    existing.totalEarned += c.amount || 0;
    if (c.status === "PAID") {
      existing.totalPaid += c.amount || 0;
    } else {
      existing.totalOutstanding += c.amount || 0;
    }
    existing.commissionIds.push(c.id);

    targetMap.set(r.id, existing);
  }

  const counselors = Array.from(counselorMap.values());
  const referralAgents = Array.from(agentMap.values());

  const totalGenerated = commissions.reduce((sum, c) => sum + (c.status !== "CANCELLED" ? c.amount : 0), 0);
  const totalPaid = commissions.reduce((sum, c) => sum + (c.status === "PAID" ? c.amount : 0), 0);
  const totalOutstanding = commissions.reduce(
    (sum, c) => sum + (c.status === "PENDING" || c.status === "PAYABLE" ? c.amount : 0),
    0
  );

  return {
    year,
    summary: {
      totalGenerated,
      totalPaid,
      totalOutstanding,
      currency: "NPR",
      commissionsCount: commissions.length,
    },
    counselors,
    referralAgents,
    commissions: commissions.map((c) => ({
      id: c.id,
      recipientId: c.recipientId,
      recipientName: c.recipient ? `${c.recipient.firstName} ${c.recipient.lastName}`.trim() : "Unknown",
      recipientRole: c.recipient?.role || "COUNSELOR",
      studentId: c.studentId,
      studentName: c.student ? `${c.student.firstName} ${c.student.lastName}`.trim() : "Student",
      amount: c.amount,
      currency: c.currency,
      status: c.status,
      generatedAt: c.createdAt,
      paidAt: c.paidAt,
      paymentReference: c.disputeReason || null,
    })),
  };
}

/**
 * Execute Batch Annual Commission Settlement
 */
async function settleAnnualCommissions({ commissionIds, paymentReference, paidAt, notes }, actorId) {
  if (!Array.isArray(commissionIds) || commissionIds.length === 0) {
    throw new Error("commissionIds array is required and cannot be empty.");
  }

  const effectivePaidAt = paidAt ? new Date(paidAt) : new Date();
  const refText = (paymentReference || notes || "ANNUAL_SETTLEMENT").trim();

  const result = await prisma.$transaction(async (tx) => {
    const updatedRecords = [];

    for (const commId of commissionIds) {
      const comm = await tx.commission.findUnique({ where: { id: commId } });
      if (!comm || comm.status === "PAID" || comm.status === "CANCELLED") continue;

      const updated = await tx.commission.update({
        where: { id: commId },
        data: {
          status: "PAID",
          paidAt: effectivePaidAt,
          paidBy: actorId,
          disputeReason: `Ref: ${refText}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          entity: "Commission",
          entityId: commId,
          field: "status",
          oldValue: comm.status,
          newValue: "PAID",
        },
      });

      updatedRecords.push(updated);
    }

    return updatedRecords;
  });

  return {
    settledCount: result.length,
    paidAt: effectivePaidAt,
    paymentReference: refText,
    commissions: result,
  };
}

module.exports = {
  generateCommission,
  evaluateVisaApprovalCommissions,
  getCounselorCommissionProfile,
  getReferralAgentCommissionProfile,
  getAnnualCommissionSettlement,
  settleAnnualCommissions,
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
