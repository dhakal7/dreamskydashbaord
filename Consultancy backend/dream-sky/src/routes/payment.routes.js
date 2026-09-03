const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.get('/', requireAuth, (req, res) => paymentController.listPayments(req, res));
router.post('/', requireAuth, (req, res) => paymentController.createPayment(req, res));
router.patch('/:id', requireAuth, (req, res) => paymentController.updatePayment(req, res));
router.delete('/:id', requireAuth, (req, res) => paymentController.deletePayment(req, res));
router.post('/:id/transactions', requireAuth, (req, res) => paymentController.addTransaction(req, res));
router.post('/:id/remind', requireAuth, (req, res) => paymentController.sendPaymentReminder(req, res));

module.exports = router;
