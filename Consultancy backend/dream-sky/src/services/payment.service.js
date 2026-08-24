const prisma = require('../prisma');

class PaymentService {
  /**
   * List all payments with student details and transaction history
   */
  async listPayments({ status, search, limit = 100, offset = 0 } = {}) {
    const where = {};

    if (search) {
      where.OR = [
        { student: { firstName: { contains: search, mode: 'insensitive' } } },
        { student: { lastName: { contains: search, mode: 'insensitive' } } },
        { student: { email: { contains: search, mode: 'insensitive' } } },
        { feeType: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        take: Number(limit),
        skip: Number(offset),
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          transactions: {
            orderBy: { paidAt: 'desc' },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    // Compute fee stats & mapped status
    const formatted = items.map((p) => {
      const totalPaid = p.transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
      const dueAmount = Math.max(0, p.totalAmount - totalPaid);

      let computedStatus = 'UNPAID';
      if (totalPaid >= p.totalAmount) {
        computedStatus = 'FULL_PAID';
      } else if (totalPaid > 0) {
        computedStatus = 'DUE';
      }

      return {
        id: p.id,
        studentId: p.studentId,
        studentName: p.student ? `${p.student.firstName} ${p.student.lastName}` : 'Unknown Student',
        studentEmail: p.student?.email || 'N/A',
        studentPhone: p.student?.phone || 'N/A',
        feeCategory: p.feeType,
        totalAmount: p.totalAmount,
        paidAmount: totalPaid,
        dueAmount: dueAmount,
        currency: p.currency || 'NPR',
        status: computedStatus,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        notes: p.transactions[0]?.notes || '',
        lastPaymentDate: p.transactions[0]?.paidAt || p.createdAt,
        transactions: p.transactions,
      };
    });

    return { items: formatted, total };
  }

  /**
   * Create a new Payment record with initial transaction
   */
  async createPayment({ studentId, feeCategory, totalAmount, paidAmount = 0, paymentMethod = 'CASH', notes }) {
    let paymentStatus = 'PENDING';
    if (paidAmount >= totalAmount) {
      paymentStatus = 'COMPLETED';
    } else if (paidAmount > 0) {
      paymentStatus = 'PARTIAL';
    }

    const payment = await prisma.payment.create({
      data: {
        studentId,
        feeType: feeCategory || 'Class Fee',
        totalAmount: Number(totalAmount),
        currency: 'NPR',
        status: paymentStatus,
      },
    });

    if (paidAmount > 0) {
      let mappedMethod = 'CASH';
      const m = String(paymentMethod).toUpperCase();
      if (m.includes('BANK') || m.includes('ONLINE') || m.includes('FONEPAY')) mappedMethod = 'BANK_TRANSFER';

      await prisma.transaction.create({
        data: {
          paymentId: payment.id,
          amount: Number(paidAmount),
          method: mappedMethod,
          notes: notes || 'Initial fee payment',
        },
      });
    }

    return this.getPaymentById(payment.id);
  }

  /**
   * Get single Payment by ID
   */
  async getPaymentById(id) {
    const p = await prisma.payment.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        transactions: {
          orderBy: { paidAt: 'desc' },
        },
      },
    });

    if (!p) return null;

    const totalPaid = p.transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const dueAmount = Math.max(0, p.totalAmount - totalPaid);

    let computedStatus = 'UNPAID';
    if (totalPaid >= p.totalAmount) computedStatus = 'FULL_PAID';
    else if (totalPaid > 0) computedStatus = 'DUE';

    return {
      id: p.id,
      studentId: p.studentId,
      studentName: p.student ? `${p.student.firstName} ${p.student.lastName}` : 'Unknown Student',
      studentEmail: p.student?.email || 'N/A',
      studentPhone: p.student?.phone || 'N/A',
      feeCategory: p.feeType,
      totalAmount: p.totalAmount,
      paidAmount: totalPaid,
      dueAmount: dueAmount,
      currency: p.currency || 'NPR',
      status: computedStatus,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      notes: p.transactions[0]?.notes || '',
      lastPaymentDate: p.transactions[0]?.paidAt || p.createdAt,
      transactions: p.transactions,
    };
  }

  /**
   * Update or record additional payment transaction
   */
  async addTransaction({ paymentId, amount, paymentMethod = 'CASH', notes }) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error('Payment record not found');

    let mappedMethod = 'CASH';
    const m = String(paymentMethod).toUpperCase();
    if (m.includes('BANK') || m.includes('ONLINE') || m.includes('FONEPAY')) mappedMethod = 'BANK_TRANSFER';

    if (amount > 0) {
      await prisma.transaction.create({
        data: {
          paymentId,
          amount: Number(amount),
          method: mappedMethod,
          notes: notes || 'Additional fee payment',
        },
      });
    }

    const allTx = await prisma.transaction.findMany({ where: { paymentId } });
    const newTotalPaid = allTx.reduce((sum, t) => sum + (t.amount || 0), 0);

    let newStatus = 'PENDING';
    if (newTotalPaid >= payment.totalAmount) newStatus = 'COMPLETED';
    else if (newTotalPaid > 0) newStatus = 'PARTIAL';

    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: newStatus },
    });

    return this.getPaymentById(paymentId);
  }

  async updatePayment({ id, totalAmount, paidAmount, status, notes }) {
    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new Error('Payment record not found');

    const updateData = {};
    if (totalAmount !== undefined) updateData.totalAmount = Number(totalAmount);
    if (status !== undefined) {
      if (status === 'FULL_PAID') updateData.status = 'COMPLETED';
      else if (status === 'DUE') updateData.status = 'PARTIAL';
      else if (status === 'UNPAID') updateData.status = 'PENDING';
      else updateData.status = status;
    }
    if (notes !== undefined) updateData.notes = notes;

    await prisma.payment.update({
      where: { id },
      data: updateData,
    });

    if (paidAmount !== undefined && Number(paidAmount) !== (payment.paidAmount || 0)) {
      const diff = Number(paidAmount) - (payment.paidAmount || 0);
      if (diff > 0) {
        await prisma.transaction.create({
          data: {
            paymentId: id,
            amount: diff,
            method: 'CASH',
            notes: notes || 'Updated via reception desk',
          },
        }).catch(() => {});
      }
    }

    return this.getPaymentById(id);
  }
}

module.exports = new PaymentService();
