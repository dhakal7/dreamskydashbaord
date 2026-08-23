const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticate } = require('../middlewares/auth.middleware');

router.get('/', authenticate, (req, res) => paymentController.listPayments(req, res));
router.post('/', authenticate, (req, res) => paymentController.createPayment(req, res));
router.post('/:id/transactions', authenticate, (req, res) => paymentController.addTransaction(req, res));
router.post('/:id/remind', authenticate, (req, res) => paymentController.sendPaymentReminder(req, res));

module.exports = router;
