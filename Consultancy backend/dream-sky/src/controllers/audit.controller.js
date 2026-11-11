const auditService = require("../services/audit.service");
const { sendSuccess } = require("../utils/response.util");

const list = async (req, res, next) => {
    try {
        const result = await auditService.listAuditLogs(req.query, req.user);
        sendSuccess(res, { data: result });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    list,
};

