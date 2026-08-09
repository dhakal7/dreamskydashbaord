/**
 * Standardised HTTP response helpers.
 * Every controller uses these so the response shape is always consistent —
 * this is Contract #4 from the backend team split doc.
 *
 * Success:  { success: true,  message, data }
 * Error:    { success: false, code, message }   (handled by global error handler in app.js)
 */

const sendSuccess = (res, { statusCode = 200, message = "Success", data = null } = {}) => {
    const body = { success: true, message };
    if (data !== null) body.data = data;
    return res.status(statusCode).json(body);
};

const sendCreated = (res, { message = "Created", data = null } = {}) =>
    sendSuccess(res, { statusCode: 201, message, data });

module.exports = { sendSuccess, sendCreated };
