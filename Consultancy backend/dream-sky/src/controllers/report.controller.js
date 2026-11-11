const reportService = require("../services/report.service");
const { sendSuccess } = require("../utils/response.util");

const getSummary = async (req, res, next) => {
  try {
    const data = await reportService.getReportsSummary(req.query, req.user);
    sendSuccess(res, { data });
  } catch (err) {
    next(err);
  }
};

const getTeacherReports = async (req, res, next) => {
  try {
    const data = await reportService.getTeacherReports(req.user);
    sendSuccess(res, { data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSummary,
  getTeacherReports,
};

