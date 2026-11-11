const referralService = require("../services/referral.service");
const { sendSuccess } = require("../utils/response.util");

const listReferrals = async (req, res, next) => {
  try {
    const referrals = await referralService.listReferrals(req.query, req.user);
    sendSuccess(res, { data: referrals });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listReferrals,
};

