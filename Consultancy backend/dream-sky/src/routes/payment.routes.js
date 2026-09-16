const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/rbac.middleware');

router.get('/', requireAuth, requireRole('SUPER_ADMIN', 'BRANCH_ADMIN', 'FRONT_DESK', 'COUNSELOR'), (req, res) => paymentController.listPayments(req, res));
router.post('/', requireAuth, requireRole('SUPER_ADMIN', 'BRANCH_ADMIN', 'FRONT_DESK'), (req, res) => paymentController.createPayment(req, res));
router.patch('/:id', requireAuth, requireRole('SUPER_ADMIN', 'BRANCH_ADMIN', 'FRONT_DESK'), (req, res) => paymentController.updatePayment(req, res));
router.delete('/:id', requireAuth, requireRole('SUPER_ADMIN', 'BRANCH_ADMIN', 'FRONT_DESK'), (req, res) => paymentController.deletePayment(req, res));
router.post('/:id/transactions', requireAuth, requireRole('SUPER_ADMIN', 'BRANCH_ADMIN', 'FRONT_DESK'), (req, res) => paymentController.addTransaction(req, res));
router.post('/:id/remind', requireAuth, requireRole('SUPER_ADMIN', 'BRANCH_ADMIN', 'FRONT_DESK', 'COUNSELOR'), (req, res) => paymentController.sendPaymentReminder(req, res));

module.exports = router;
