const paymentService = require('../services/payment.service');
const emailService = require('../services/email.service');

const REMINDER_COOLDOWN_MS = 60 * 1000;
const recentReminderTimestamps = new Map();
const inFlightReminders = new Set();

class PaymentController {
  handleError(res, err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        code: err.code || 'PAYMENT_ERROR',
      });
    }
    if (err.message === 'Payment record not found') {
      return res.status(404).json({
        success: false,
        message: err.message,
        code: 'PAYMENT_NOT_FOUND',
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    });
  }

  async listPayments(req, res) {
    try {
      const { status, search, limit, offset } = req.query;
      const result = await paymentService.listPayments({ status, search, limit, offset }, req.user);
      res.json({ success: true, data: result.items, total: result.total });
    } catch (err) {
      this.handleError(res, err);
    }
  }

  async getOutstandingSummary(req, res) {
    try {
      const summary = await paymentService.getOutstandingSummary(req.user);
      res.json({ success: true, data: summary });
    } catch (err) {
      this.handleError(res, err);
    }
  }

  async createPayment(req, res) {
    try {
      const { studentId, feeCategory, totalAmount, paidAmount, paymentMethod, notes } = req.body;
      if (!studentId || !totalAmount) {
        return res.status(400).json({ success: false, message: 'Student ID and Total Amount are required', code: 'VALIDATION_ERROR' });
      }

      const payment = await paymentService.createPayment({
        studentId,
        feeCategory,
        totalAmount,
        paidAmount,
        paymentMethod,
        notes,
      }, req.user);

      res.status(201).json({ success: true, data: payment });
    } catch (err) {
      this.handleError(res, err);
    }
  }

  async addTransaction(req, res) {
    try {
      const { id } = req.params;
      const { amount, paymentMethod, notes } = req.body;

      const updated = await paymentService.addTransaction({
        paymentId: id,
        amount,
        paymentMethod,
        notes,
      }, req.user);

      res.json({ success: true, data: updated });
    } catch (err) {
      this.handleError(res, err);
    }
  }

  async sendPaymentReminder(req, res) {
    const { id } = req.params;
    try {
      const payment = await paymentService.getPaymentById(id, req.user);
      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment record not found', code: 'PAYMENT_NOT_FOUND' });
      }

      const dueAmount = Number(payment.dueAmount) || 0;
      if (dueAmount <= 0 || payment.status === 'FULL_PAID' || payment.status === 'COMPLETED') {
        return res.status(400).json({
          success: false,
          message: 'Cannot send a fee reminder when there is no outstanding balance.',
          code: 'NO_OUTSTANDING_BALANCE',
        });
      }

      if (!emailService.isValidEmail(payment.studentEmail)) {
        return res.status(400).json({
          success: false,
          message: 'Student does not have a valid email address on record.',
          code: 'INVALID_STUDENT_EMAIL',
        });
      }

      const lastSent = recentReminderTimestamps.get(id) || 0;
      if (inFlightReminders.has(id) || Date.now() - lastSent < REMINDER_COOLDOWN_MS) {
        return res.status(429).json({
          success: false,
          message: 'A fee reminder was recently dispatched for this record. Please wait before sending another.',
          code: 'REMINDER_COOLDOWN',
        });
      }

      inFlightReminders.add(id);
      try {
        await emailService.sendFeeDueEmail({
          to: payment.studentEmail,
          studentName: payment.studentName,
          feeCategory: payment.feeCategory,
          dueAmount,
          currency: payment.currency,
          dueDate: new Date().toISOString().split('T')[0],
        });
        recentReminderTimestamps.set(id, Date.now());
      } finally {
        inFlightReminders.delete(id);
      }

      res.json({ success: true, message: `Reminder dispatched for ${payment.studentName}` });
    } catch (err) {
      this.handleError(res, err);
    }
  }

  async updatePayment(req, res) {
    try {
      const { id } = req.params;
      const { totalAmount, paidAmount, status, notes } = req.body;

      const updated = await paymentService.updatePayment({
        id,
        totalAmount,
        paidAmount,
        status,
        notes,
      }, req.user);

      res.json({ success: true, data: updated });
    } catch (err) {
      this.handleError(res, err);
    }
  }

  async deletePayment(req, res) {
    try {
      const { id } = req.params;
      const result = await paymentService.deletePayment(id, req.user);
      res.json({ success: true, message: 'Payment record deleted successfully.', data: result });
    } catch (err) {
      this.handleError(res, err);
    }
  }
}

module.exports = new PaymentController();
