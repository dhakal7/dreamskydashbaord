const commissionService = require("../services/commission.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const AppError = require("../utils/apiError");

const VALID_ROLES = ["COUNSELOR", "REFERRAL_AGENT"];
const VALID_TYPES = ["FIXED", "PERCENTAGE", "TIERED"];
const VALID_STATUSES = ["PENDING", "PAID", "DISPUTED", "CANCELLED"];

// ─── Commission Rules Controller ──────────────────────────────────────────────

const listRules = async (req, res, next) => {
  try {
    const { role } = req.query;
    if (role && !VALID_ROLES.includes(role)) {
      throw new AppError(`Invalid role '${role}'. Must be one of: ${VALID_ROLES.join(", ")}.`, 400);
    }
    const rules = await commissionService.listCommissionRules(req.query);
    sendSuccess(res, { data: rules });
  } catch (err) {
    next(err);
  }
};

const getRule = async (req, res, next) => {
  try {
    const rule = await commissionService.getCommissionRuleById(req.params.id);
    if (!rule) {
      throw new AppError(`Commission rule with id '${req.params.id}' not found.`, 404);
    }
    sendSuccess(res, { data: rule });
  } catch (err) {
    next(err);
  }
};

const createRule = async (req, res, next) => {
  try {
    const { role, type, triggerStage, effectiveFrom, fixedAmount, percentage, tierConfig } = req.body;

    if (!role || !type || !triggerStage || !effectiveFrom) {
      throw new AppError("Missing required fields: role, type, triggerStage, effectiveFrom.", 400);
    }

    if (!VALID_ROLES.includes(role)) {
      throw new AppError(`Invalid role '${role}'. Must be one of: ${VALID_ROLES.join(", ")}.`, 400);
    }

    if (!VALID_TYPES.includes(type)) {
      throw new AppError(`Invalid type '${type}'. Must be one of: ${VALID_TYPES.join(", ")}.`, 400);
    }

    if (type === "FIXED" && (fixedAmount === undefined || fixedAmount === null || typeof fixedAmount !== "number" || fixedAmount < 0)) {
      throw new AppError("`fixedAmount` is required and must be a non-negative number for FIXED rules.", 400);
    }

    if (type === "PERCENTAGE" && (percentage === undefined || percentage === null || typeof percentage !== "number" || percentage < 0 || percentage > 100)) {
      throw new AppError("`percentage` is required and must be a number between 0 and 100 for PERCENTAGE rules.", 400);
    }

    if (type === "TIERED" && !tierConfig) {
      throw new AppError("`tierConfig` is required for TIERED rules.", 400);
    }

    const rule = await commissionService.createCommissionRule(req.body);
    sendCreated(res, { message: "Commission rule created successfully.", data: rule });
  } catch (err) {
    next(err);
  }
};

const updateRule = async (req, res, next) => {
  try {
    const existing = await commissionService.getCommissionRuleById(req.params.id);
    if (!existing) {
      throw new AppError(`Commission rule with id '${req.params.id}' not found.`, 404);
    }
    const updated = await commissionService.updateCommissionRule(req.params.id, req.body);
    sendSuccess(res, { message: "Commission rule updated.", data: updated });
  } catch (err) {
    next(err);
  }
};

const deleteRule = async (req, res, next) => {
  try {
    const existing = await commissionService.getCommissionRuleById(req.params.id);
    if (!existing) {
      throw new AppError(`Commission rule with id '${req.params.id}' not found.`, 404);
    }
    await commissionService.deleteCommissionRule(req.params.id);
    sendSuccess(res, { message: "Commission rule deleted." });
  } catch (err) {
    next(err);
  }
};

// ─── Commissions Controller ───────────────────────────────────────────────────

const listCommissions = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) throw AppError.unauthorized("Authentication required.");

    const { status } = req.query;
    if (status && !VALID_STATUSES.includes(status)) {
      throw new AppError(`Invalid status '${status}'. Must be one of: ${VALID_STATUSES.join(", ")}.`, 400);
    }

    const query = { ...req.query };

    // Role-based recipient scoping:
    // COUNSELOR and REFERRAL_AGENT must only view commission records where they are the recipient.
    // Client-supplied recipientId is strictly overridden to prevent scoping bypass.
    if (user.role === "COUNSELOR" || user.role === "REFERRAL_AGENT") {
      query.recipientId = user.id;
      delete query.recipientUserId;
    } else if (user.role === "BRANCH_ADMIN") {
      if (!user.branchId) {
        throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
      }
      query.branchId = user.branchId;
    } else if (user.role !== "SUPER_ADMIN") {
      throw AppError.forbidden("You do not have permission to view commission records.", "FORBIDDEN");
    }

    const commissions = await commissionService.listCommissions(query);
    sendSuccess(res, { data: commissions });
  } catch (err) {
    next(err);
  }
};

const getCommission = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) throw AppError.unauthorized("Authentication required.");

    const commission = await commissionService.getCommissionById(req.params.id);
    if (!commission) {
      throw new AppError(`Commission with id '${req.params.id}' not found.`, 404);
    }

    // Role-based ownership check:
    // Counselors and referral agents can only view their own commission records.
    if (user.role === "COUNSELOR" || user.role === "REFERRAL_AGENT") {
      if (commission.recipientId !== user.id) {
        throw new AppError(`Commission with id '${req.params.id}' not found.`, 404);
      }
    } else if (user.role === "BRANCH_ADMIN") {
      if (!user.branchId) {
        throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
      }
      // Policy Option B: Strict Earner-Jurisdiction Model
      const recipientBranchId = commission.recipient ? commission.recipient.branchId : null;
      const belongsToBranch = recipientBranchId
        ? recipientBranchId === user.branchId
        : commission.rule?.scopeBranchId === user.branchId;

      if (!belongsToBranch) {
        throw new AppError(`Commission with id '${req.params.id}' not found.`, 404);
      }
    } else if (user.role !== "SUPER_ADMIN") {
      throw AppError.forbidden("You do not have permission to view this commission.", "FORBIDDEN");
    }

    sendSuccess(res, { data: commission });
  } catch (err) {
    next(err);
  }
};

const markPaid = async (req, res, next) => {
  try {
    const actorId = req.user ? req.user.id : null;
    const result = await commissionService.markCommissionPaid(req.params.id, actorId);

    if (!result) {
      throw new AppError(`Commission with id '${req.params.id}' not found.`, 404);
    }
    if (result.error === "ALREADY_PAID") {
      throw new AppError(`Commission with id '${req.params.id}' is already marked as PAID.`, 409);
    }

    sendSuccess(res, { message: "Commission marked as paid.", data: result });
  } catch (err) {
    next(err);
  }
};

const dispute = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) throw AppError.unauthorized("Authentication required.");

    const reason = (req.body.reason || req.body.notes || "").trim();
    if (!reason) {
      throw new AppError("`reason` is required and must be a non-empty string.", 400);
    }

    const existing = await commissionService.getCommissionById(req.params.id);
    if (!existing) {
      throw new AppError(`Commission with id '${req.params.id}' not found.`, 404);
    }

    // Role-based authorization for dispute:
    if (user.role === "COUNSELOR" || user.role === "REFERRAL_AGENT") {
      if (existing.recipientId !== user.id) {
        throw new AppError(`Commission with id '${req.params.id}' not found.`, 404);
      }
    } else if (user.role === "BRANCH_ADMIN") {
      if (!user.branchId) {
        throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
      }
      // Policy Option B: Strict Earner-Jurisdiction Model
      const recipientBranchId = existing.recipient ? existing.recipient.branchId : null;
      const belongsToBranch = recipientBranchId
        ? recipientBranchId === user.branchId
        : existing.rule?.scopeBranchId === user.branchId;

      if (!belongsToBranch) {
        throw new AppError(`Commission with id '${req.params.id}' not found.`, 404);
      }
    } else if (user.role !== "SUPER_ADMIN") {
      throw AppError.forbidden("You do not have permission to dispute this commission.", "FORBIDDEN");
    }

    const result = await commissionService.disputeCommission(req.params.id, reason, user.id);

    if (!result) {
      throw new AppError(`Commission with id '${req.params.id}' not found.`, 404);
    }
    if (result.error === "CANNOT_DISPUTE_PAID") {
      throw new AppError("Cannot dispute a commission that is already marked as PAID.", 409);
    }

    sendSuccess(res, { message: "Commission disputed.", data: result });
  } catch (err) {
    next(err);
  }
};

const getCounselorProfile = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) throw AppError.unauthorized("Authentication required.");

    const targetCounselorId = req.params.id;

    // Role-based scoping: counselors can only view their own profile
    if (user.role === "COUNSELOR" && user.id !== targetCounselorId) {
      throw AppError.forbidden("Counselors can only view their own commission profile.", "FORBIDDEN");
    } else if (user.role === "BRANCH_ADMIN") {
      // Must belong to their branch
      const target = await prisma.user.findUnique({
        where: { id: targetCounselorId },
        select: { id: true, branchId: true },
      });
      if (!target || target.branchId !== user.branchId) {
        throw AppError.forbidden("You can only view counselors in your own branch.", "CROSS_BRANCH_ACCESS_DENIED");
      }
    } else if (user.role !== "SUPER_ADMIN" && user.role !== "COUNSELOR") {
      throw AppError.forbidden("You do not have permission to view counselor commission profiles.", "FORBIDDEN");
    }

    const profile = await commissionService.getCounselorCommissionProfile(targetCounselorId);
    if (!profile) {
      throw new AppError(`Counselor with id '${targetCounselorId}' not found.`, 404);
    }

    sendSuccess(res, { data: profile });
  } catch (err) {
    next(err);
  }
};

const getAgentProfile = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) throw AppError.unauthorized("Authentication required.");

    const targetAgentId = req.params.id;

    // Role-based scoping: referral agents can only view their own profile
    if (user.role === "REFERRAL_AGENT") {
      const myProfile = await prisma.referralAgentProfile.findUnique({ where: { userId: user.id } });
      if (user.id !== targetAgentId && myProfile?.id !== targetAgentId) {
        throw AppError.forbidden("Referral agents can only view their own commission profile.", "FORBIDDEN");
      }
    } else if (user.role !== "SUPER_ADMIN" && user.role !== "BRANCH_ADMIN") {
      throw AppError.forbidden("You do not have permission to view referral agent commission profiles.", "FORBIDDEN");
    }

    const profile = await commissionService.getReferralAgentCommissionProfile(targetAgentId);
    if (!profile) {
      throw new AppError(`Referral agent with id '${targetAgentId}' not found.`, 404);
    }

    sendSuccess(res, { data: profile });
  } catch (err) {
    next(err);
  }
};

const getAnnualSettlement = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) throw AppError.unauthorized("Authentication required.");
    if (user.role !== "SUPER_ADMIN" && user.role !== "BRANCH_ADMIN") {
      throw AppError.forbidden("Only administrators can view annual commission settlements.", "FORBIDDEN");
    }

    const settlement = await commissionService.getAnnualCommissionSettlement(req.query.year);
    sendSuccess(res, { data: settlement });
  } catch (err) {
    next(err);
  }
};

const settleAnnual = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) throw AppError.unauthorized("Authentication required.");
    if (user.role !== "SUPER_ADMIN") {
      throw AppError.forbidden("Only Super Admins can execute annual commission settlements.", "FORBIDDEN");
    }

    const result = await commissionService.settleAnnualCommissions(req.body, user.id);
    sendSuccess(res, { message: "Annual settlement executed successfully.", data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  listCommissions,
  getCommission,
  markPaid,
  dispute,
  getCounselorProfile,
  getAgentProfile,
  getAnnualSettlement,
  settleAnnual,
};
