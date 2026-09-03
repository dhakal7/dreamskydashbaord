const paymentService = require('../services/payment.service');
const emailService = require('../services/email.service');

class PaymentController {
  async listPayments(req, res) {
    try {
      const { status, search, limit, offset } = req.query;
      const result = await paymentService.listPayments({ status, search, limit, offset });
      res.json({ success: true, data: result.items, total: result.total });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async createPayment(req, res) {
    try {
      const { studentId, feeCategory, totalAmount, paidAmount, paymentMethod, notes } = req.body;
      if (!studentId || !totalAmount) {
        return res.status(400).json({ success: false, message: 'Student ID and Total Amount are required' });
      }

      const payment = await paymentService.createPayment({
        studentId,
        feeCategory,
        totalAmount,
        paidAmount,
        paymentMethod,
        notes,
      });

      res.status(201).json({ success: true, data: payment });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
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
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async sendPaymentReminder(req, res) {
    try {
      const { id } = req.params;
      const payment = await paymentService.getPaymentById(id);
      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment record not found' });
      }

      if (payment.studentEmail && payment.studentEmail.includes('@')) {
        await emailService.sendFeeDueEmail({
          to: payment.studentEmail,
          studentName: payment.studentName,
          feeCategory: payment.feeCategory,
          dueAmount: payment.dueAmount,
          currency: payment.currency,
          dueDate: new Date().toISOString().split('T')[0],
        });
      }

      res.json({ success: true, message: `Reminder dispatched for ${payment.studentName}` });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
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
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  async deletePayment(req, res) {
    try {
      const { id } = req.params;
      await paymentService.deletePayment(id);
      res.json({ success: true, message: 'Payment record deleted successfully.' });
    } catch (err) {
      if (err.message === 'Payment record not found') {
        return res.status(404).json({ success: false, message: err.message });
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new PaymentController();
