/**
 * Custom application error class.
 * Use this to throw structured errors from any layer.
 * The global error handler in app.js catches these and formats the response.
 */
class AppError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code || "APP_ERROR";
        this.isOperational = true; // distinguishes our errors from unexpected crashes
        Error.captureStackTrace(this, this.constructor);
    }
}

// Common factory helpers so we don't repeat status codes throughout the codebase
AppError.badRequest = (message, code = "BAD_REQUEST") =>
    new AppError(message, 400, code);

AppError.unauthorized = (message = "Unauthorized", code = "UNAUTHORIZED") =>
    new AppError(message, 401, code);

AppError.forbidden = (message = "Forbidden", code = "FORBIDDEN") =>
    new AppError(message, 403, code);

AppError.notFound = (message, code = "NOT_FOUND") =>
    new AppError(message, 404, code);

AppError.conflict = (message, code = "CONFLICT") =>
    new AppError(message, 409, code);

AppError.internal = (message = "Internal Server Error", code = "INTERNAL_ERROR") =>
    new AppError(message, 500, code);

module.exports = AppError;
