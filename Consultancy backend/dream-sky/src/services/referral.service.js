const prisma = require("../prisma");
const AppError = require("../utils/apiError");

const STAGE_TO_LEAD_STAGE = {
  LEAD: "new",
  PROSPECT: "counseling",
  ENROLLED: "completed",
  APPLIED: "application",
  OFFER_RECEIVED: "offer_letter",
  VISA_APPLIED: "visa",
  VISA_APPROVED: "travel",
  DEPARTED: "completed",
  LOST: "lost",
};

/**
 * List referrals based on user role and query filters
 */
async function listReferrals(query = {}, currentUser) {
  if (!currentUser) {
    throw AppError.unauthorized("Authentication required.");
  }

  const { search, stage, agentId } = query;
  const where = {
    referredByAgentId: { not: null },
    isActive: true,
  };

  // Role scoping
  if (currentUser.role === "REFERRAL_AGENT") {
    let profileId = currentUser.referralAgentProfileId;
    if (!profileId) {
      const profile = await prisma.referralAgentProfile.findUnique({
        where: { userId: currentUser.id },
      });
      profileId = profile?.id;
    }
    if (!profileId) {
      return [];
    }
    where.referredByAgentId = profileId;
  } else if (currentUser.role === "BRANCH_ADMIN") {
    if (!currentUser.branchId || typeof currentUser.branchId !== "string" || !currentUser.branchId.trim()) {
      throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
    }
    const authorizedBranchId = currentUser.branchId.trim();
    where.AND = [
      {
        OR: [
          {
            assignedCounselor: {
              branchId: authorizedBranchId,
            },
          },
          {
            assignedCounselorId: null,
            academicBackground: {
              path: ["branchId"],
              equals: authorizedBranchId,
            },
          },
        ],
      },
    ];
  } else if (currentUser.role === "COUNSELOR") {
    where.assignedCounselorId = currentUser.id;
  } else if (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "FRONT_DESK") {
    throw AppError.forbidden("You do not have permission to view referrals.", "FORBIDDEN");
  }

  // Filter by agent if provided (for Admin views)
  if (agentId && agentId !== "all" && currentUser.role !== "REFERRAL_AGENT") {
    where.referredByAgentId = agentId;
  }

  // Filter by stage if provided
  if (stage && stage !== "all") {
    // Check if stage is a Prisma stage enum or a leadStage
    const uppercaseStage = stage.toUpperCase();
    if (STAGE_TO_LEAD_STAGE[uppercaseStage]) {
      where.currentStage = uppercaseStage;
    } else {
      // Find matching prisma stages for the frontend stage key
      const matchingPrismaStages = Object.entries(STAGE_TO_LEAD_STAGE)
        .filter(([, v]) => v === stage)
        .map(([k]) => k);
      if (matchingPrismaStages.length > 0) {
        where.currentStage = { in: matchingPrismaStages };
      }
    }
  }

  // Search filter
  if (search && search.trim()) {
    const q = search.trim();
    const searchOr = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      {
        referredByAgent: {
          user: {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
            ],
          },
        },
      },
    ];
    if (where.AND) {
      where.AND.push({ OR: searchOr });
    } else {
      where.OR = searchOr;
    }
  }

  const students = await prisma.student.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      currentStage: true,
      createdAt: true,
      referredByAgent: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      },
      commissions: {
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return students.map((s) => {
    const agentUser = s.referredByAgent?.user;
    const agentName = agentUser
      ? `${agentUser.firstName || ""} ${agentUser.lastName || ""}`.trim()
      : "Unknown Agent";

    const leadStage = STAGE_TO_LEAD_STAGE[s.currentStage] || "new";
    const totalCommission = s.commissions?.reduce((sum, c) => sum + (c.amount || 0), 0) || 500;

    return {
      id: s.id,
      agentId: s.referredByAgent?.id || s.referredByAgent?.userId || "unknown",
      agentName,
      agentEmail: agentUser?.email || null,
      agentPhone: agentUser?.phone || null,
      referralCode: s.referredByAgent?.referralCode || "N/A",
      studentId: s.id,
      studentName: `${s.firstName || ""} ${s.lastName || ""}`.trim(),
      stage: leadStage,
      rawStage: s.currentStage,
      referredAt: s.createdAt.toISOString(),
      potentialCommissionUsd: totalCommission,
      commissionStatus: s.commissions?.[0]?.status || "PENDING",
    };
  });
}

module.exports = {
  listReferrals,
};

