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
    const { status } = req.query;
    if (status && !VALID_STATUSES.includes(status)) {
      throw new AppError(`Invalid status '${status}'. Must be one of: ${VALID_STATUSES.join(", ")}.`, 400);
    }
    const commissions = await commissionService.listCommissions(req.query);
    sendSuccess(res, { data: commissions });
  } catch (err) {
    next(err);
  }
};

const getCommission = async (req, res, next) => {
  try {
    const commission = await commissionService.getCommissionById(req.params.id);
    if (!commission) {
      throw new AppError(`Commission with id '${req.params.id}' not found.`, 404);
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
    const { reason } = req.body;
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      throw new AppError("`reason` is required and must be a non-empty string.", 400);
    }

    const actorId = req.user ? req.user.id : null;
    const result = await commissionService.disputeCommission(req.params.id, reason, actorId);

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
};
