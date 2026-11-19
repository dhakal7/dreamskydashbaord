const { Prisma } = require('@prisma/client');
const prisma = require('../prisma');
const AppError = require('../utils/apiError');

const PAYMENT_STUDENT_AUTHZ_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  isActive: true,
  assignedCounselorId: true,
  assignedCounselor: {
    select: {
      id: true,
      branchId: true,
    },
  },
  academicBackground: true,
};

const isValidBranchId = (value) => typeof value === 'string' && value.trim().length > 0;

const mapPaymentMethod = (paymentMethod = 'CASH') => {
  const m = String(paymentMethod || 'CASH').toUpperCase();
  if (m.includes('BANK') || m.includes('ONLINE') || m.includes('FONEPAY')) return 'BANK_TRANSFER';
  if (m.includes('CARD')) return 'CARD';
  if (m.includes('CHEQUE')) return 'CHEQUE';
  return 'CASH';
};

const resolveStudentBranchId = (student) => {
  if (!student || typeof student !== 'object') return null;

  const hasAssignedCounselor =
    (student.assignedCounselorId !== undefined &&
      student.assignedCounselorId !== null &&
      String(student.assignedCounselorId).trim().length > 0) ||
    (student.assignedCounselor !== undefined &&
      student.assignedCounselor !== null &&
      typeof student.assignedCounselor === 'object');

  if (hasAssignedCounselor) {
    const counselorBranchId = student.assignedCounselor?.branchId;
    return isValidBranchId(counselorBranchId) ? counselorBranchId.trim() : null;
  }

  const bg = student.academicBackground;
  if (bg && typeof bg === 'object' && isValidBranchId(bg.branchId)) {
    return bg.branchId.trim();
  }

  return null;
};

class PaymentService {
  /**
   * Enforces role and branch-level authorization for payment records.
   * SUPER_ADMIN has full global access.
   * COUNSELOR is restricted to payments of their own assigned students.
   * BRANCH_ADMIN and FRONT_DESK are restricted to payments of students in their branch.
   */
  assertPaymentStudentAuthorization(student, currentUser, action = 'access') {
    if (!currentUser) {
      throw AppError.unauthorized('Authentication required.', 'UNAUTHORIZED');
    }

    const actorRole = currentUser.role;
    const actorId = currentUser.userId || currentUser.id;

    if (actorRole === 'SUPER_ADMIN') {
      return;
    }

    if (actorRole === 'COUNSELOR') {
      if (!student?.assignedCounselorId || student.assignedCounselorId !== actorId) {
        throw AppError.forbidden(`You are not authorized to ${action} this payment record.`, 'FORBIDDEN');
      }
      return;
    }

    if (actorRole === 'BRANCH_ADMIN' || actorRole === 'FRONT_DESK') {
      if (!isValidBranchId(currentUser.branchId)) {
        throw AppError.forbidden(`${actorRole} lacks assigned branch context.`, 'NO_BRANCH_CONTEXT');
      }
      const authorizedBranchId = currentUser.branchId.trim();
      const studentBranchId = resolveStudentBranchId(student);
      if (studentBranchId && studentBranchId !== authorizedBranchId) {
        throw AppError.forbidden(`You are not authorized to ${action} payment records outside your branch.`, 'FORBIDDEN');
      }
      return;
    }

    throw AppError.forbidden(`You are not authorized to ${action} payment records.`, 'FORBIDDEN');
  }

  /**
   * List all payments with student details and transaction history
   */
  async listPayments({ status, search, limit = 100, offset = 0 } = {}, currentUser = null) {
    const where = {};
    const studentWhere = { isActive: true };

    if (currentUser) {
      const actorRole = currentUser.role;
      const actorId = currentUser.userId || currentUser.id;

      if (actorRole === 'SUPER_ADMIN') {
        // Full global access across branches
      } else if (actorRole === 'COUNSELOR') {
        studentWhere.assignedCounselorId = actorId;
      } else if (actorRole === 'BRANCH_ADMIN' || actorRole === 'FRONT_DESK') {
        if (!isValidBranchId(currentUser.branchId)) {
          throw AppError.forbidden(`${actorRole} lacks assigned branch context.`, 'NO_BRANCH_CONTEXT');
        }
        const authorizedBranchId = currentUser.branchId.trim();
        studentWhere.OR = [
          { assignedCounselor: { branchId: authorizedBranchId } },
          {
            assignedCounselorId: null,
            OR: [
              { academicBackground: { equals: Prisma.AnyNull } },
              { academicBackground: { path: ['branchId'], equals: authorizedBranchId } },
              { academicBackground: { path: ['branchId'], equals: Prisma.AnyNull } },
            ],
          },
        ];
      } else {
        throw AppError.forbidden('You are not authorized to list payment records.', 'FORBIDDEN');
      }
    }

    where.student = studentWhere;

    if (search) {
      where.OR = [
        { student: { ...studentWhere, firstName: { contains: search, mode: 'insensitive' } } },
        { student: { ...studentWhere, lastName: { contains: search, mode: 'insensitive' } } },
        { student: { ...studentWhere, email: { contains: search, mode: 'insensitive' } } },
        { feeType: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status && status !== 'ALL') {
      const allScopedItems = await prisma.payment.findMany({
        where,
        take: 1000,
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
      });

      const allFormatted = allScopedItems.map((p) => {
        const totalPaid = p.transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        const dueAmount = Math.max(0, p.totalAmount - totalPaid);

        let computedStatus = 'UNPAID';
        if (p.status === 'CANCELLED') {
          computedStatus = 'CANCELLED';
        } else if (totalPaid >= p.totalAmount && p.totalAmount > 0) {
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
          currency: p.currency ? p.currency.trim().toUpperCase() : null,
          status: computedStatus,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          notes: p.transactions[0]?.notes || '',
          lastPaymentDate: p.transactions[0]?.paidAt || p.createdAt,
          transactions: p.transactions,
        };
      });

      const filtered = allFormatted.filter((item) => {
        if (status === 'OUTSTANDING' || status === 'UNSETTLED') {
          return item.status === 'DUE' || item.status === 'UNPAID';
        }
        if (status.includes(',')) {
          const statuses = status.split(',').map((s) => s.trim().toUpperCase());
          return statuses.includes(item.status);
        }
        return item.status === status;
      });
      const start = Math.max(0, Number(offset) || 0);
      const pageLimit = Math.max(1, Number(limit) || 100);
      return {
        items: filtered.slice(start, start + pageLimit),
        total: filtered.length,
      };
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

    // Compute fee stats & mapped status from authoritative Transaction rows
    const formatted = items.map((p) => {
      const totalPaid = p.transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const dueAmount = Math.max(0, p.totalAmount - totalPaid);

      let computedStatus = 'UNPAID';
      if (p.status === 'CANCELLED') {
        computedStatus = 'CANCELLED';
      } else if (totalPaid >= p.totalAmount && p.totalAmount > 0) {
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
        currency: p.currency ? p.currency.trim().toUpperCase() : null,
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
  async createPayment({ studentId, feeCategory, totalAmount, paidAmount = 0, paymentMethod = 'CASH', notes }, currentUser = null) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: PAYMENT_STUDENT_AUTHZ_SELECT,
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");
    if (currentUser) {
      this.assertPaymentStudentAuthorization(student, currentUser, 'create a payment for');
    }
    if (student.isActive === false) {
      throw AppError.badRequest("Cannot record payments for a student in Trash. Please restore the student first.", "STUDENT_IN_TRASH");
    }

    const numericTotal = Number(totalAmount);
    const numericPaid = Number(paidAmount) || 0;
    if (isNaN(numericTotal) || numericTotal <= 0) {
      throw AppError.badRequest("Total amount must be a positive number.", "INVALID_TOTAL_AMOUNT");
    }
    if (isNaN(numericPaid) || numericPaid < 0) {
      throw AppError.badRequest("Paid amount cannot be negative.", "INVALID_PAID_AMOUNT");
    }
    if (numericPaid > numericTotal) {
      throw AppError.badRequest(
        `Paid amount (${numericPaid}) cannot exceed total amount (${numericTotal}).`,
        "PAID_EXCEEDS_TOTAL_AMOUNT"
      );
    }

    let paymentStatus = 'PENDING';
    if (numericPaid >= numericTotal) {
      paymentStatus = 'COMPLETED';
    } else if (numericPaid > 0) {
      paymentStatus = 'PARTIAL';
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          studentId,
          feeType: feeCategory || 'Class Fee',
          totalAmount: numericTotal,
          currency: 'NPR',
          status: paymentStatus,
        },
      });

      if (numericPaid > 0) {
        const mappedMethod = mapPaymentMethod(paymentMethod);

        await tx.transaction.create({
          data: {
            paymentId: payment.id,
            amount: numericPaid,
            method: mappedMethod,
            notes: notes || 'Initial fee payment',
          },
        });
      }

      return payment;
    });

    return this.getPaymentById(result.id, currentUser);
  }

  /**
   * Get single Payment by ID
   */
  async getPaymentById(id, currentUser = null) {
    const p = await prisma.payment.findUnique({
      where: { id },
      include: {
        student: {
          select: PAYMENT_STUDENT_AUTHZ_SELECT,
        },
        transactions: {
          orderBy: { paidAt: 'desc' },
        },
      },
    });

    if (!p) return null;

    if (currentUser) {
      this.assertPaymentStudentAuthorization(p.student, currentUser, 'view');
    }

    const totalPaid = p.transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const dueAmount = Math.max(0, p.totalAmount - totalPaid);

    let computedStatus = 'UNPAID';
    if (p.status === 'CANCELLED') computedStatus = 'CANCELLED';
    else if (totalPaid >= p.totalAmount && p.totalAmount > 0) computedStatus = 'FULL_PAID';
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
      currency: p.currency ? p.currency.trim().toUpperCase() : null,
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
  async addTransaction({ paymentId, amount, paymentMethod = 'CASH', notes }, currentUser = null) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { student: { select: PAYMENT_STUDENT_AUTHZ_SELECT } },
    });
    if (!payment) throw AppError.notFound('Payment record not found', 'PAYMENT_NOT_FOUND');
    if (currentUser) {
      this.assertPaymentStudentAuthorization(payment.student, currentUser, 'record a transaction for');
    }
    if (payment.student && payment.student.isActive === false) {
      throw AppError.badRequest("Cannot record transactions for a student in Trash. Please restore the student first.", "STUDENT_IN_TRASH");
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw AppError.badRequest("Transaction amount must be greater than zero.", "INVALID_TRANSACTION_AMOUNT");
    }

    const mappedMethod = mapPaymentMethod(paymentMethod);

    await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT 1 FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
      }

      const lockedPayment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { transactions: true },
      });
      if (!lockedPayment) throw AppError.notFound('Payment record not found', 'PAYMENT_NOT_FOUND');

      const currentPaid = (lockedPayment.transactions || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const projectedTotalPaid = currentPaid + numericAmount;
      if (projectedTotalPaid > lockedPayment.totalAmount) {
        throw AppError.badRequest(
          `Transaction amount (${numericAmount}) would cause cumulative paid amount (${projectedTotalPaid}) to exceed total amount (${lockedPayment.totalAmount}). Remaining due is ${Math.max(0, lockedPayment.totalAmount - currentPaid)}.`,
          'OVERPAYMENT_NOT_ALLOWED'
        );
      }

      await tx.transaction.create({
        data: {
          paymentId,
          amount: numericAmount,
          method: mappedMethod,
          notes: notes || 'Additional fee payment',
        },
      });

      const allTx = await tx.transaction.findMany({ where: { paymentId } });
      const newTotalPaid = allTx.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      let newStatus = 'PENDING';
      if (newTotalPaid >= lockedPayment.totalAmount && lockedPayment.totalAmount > 0) newStatus = 'COMPLETED';
      else if (newTotalPaid > 0) newStatus = 'PARTIAL';

      await tx.payment.update({
        where: { id: paymentId },
        data: { status: newStatus },
      });
    });

    return this.getPaymentById(paymentId, currentUser);
  }

  /**
   * Update payment metadata and/or record an incremental payment difference.
   * Note: Payment model does not have a `notes` or `paidAmount` column; paid amounts
   * and notes are persisted exclusively on child Transaction records.
   */
  async updatePayment({ id, totalAmount, paidAmount, status, notes }, currentUser = null) {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        student: { select: PAYMENT_STUDENT_AUTHZ_SELECT },
        transactions: { orderBy: { paidAt: 'desc' } },
      },
    });
    if (!payment) throw AppError.notFound('Payment record not found', 'PAYMENT_NOT_FOUND');
    if (currentUser) {
      this.assertPaymentStudentAuthorization(payment.student, currentUser, 'update');
    }
    if (payment.student && payment.student.isActive === false) {
      throw AppError.badRequest("Cannot update payment records for a student in Trash. Please restore the student first.", "STUDENT_IN_TRASH");
    }

    await prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT 1 FROM "Payment" WHERE "id" = ${id} FOR UPDATE`;
      }

      const lockedPayment = await tx.payment.findUnique({
        where: { id },
        include: {
          transactions: { orderBy: { paidAt: 'desc' } },
        },
      });
      if (!lockedPayment) throw AppError.notFound('Payment record not found', 'PAYMENT_NOT_FOUND');

      const currentTransactions = lockedPayment.transactions || [];
      const currentPaid = currentTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const effectiveTotal = totalAmount !== undefined ? Number(totalAmount) : lockedPayment.totalAmount;

      if (isNaN(effectiveTotal) || effectiveTotal < 0) {
        throw AppError.badRequest('Invalid total amount.', 'INVALID_TOTAL_AMOUNT');
      }
      if (effectiveTotal < currentPaid) {
        throw AppError.badRequest(
          `Total amount (${effectiveTotal}) cannot be set lower than already collected transactions (${currentPaid}).`,
          'TOTAL_BELOW_COLLECTED_AMOUNT'
        );
      }

      let createdNewTransaction = false;
      if (paidAmount !== undefined) {
        const targetPaid = Number(paidAmount);
        if (isNaN(targetPaid) || targetPaid < 0) {
          throw AppError.badRequest('Invalid paid amount.', 'INVALID_PAID_AMOUNT');
        }
        if (targetPaid < currentPaid) {
          throw AppError.badRequest(
            `Cannot reduce paid amount (${targetPaid}) below recorded transaction history (${currentPaid}). Financial transaction history cannot be overwritten or deleted.`,
            'CANNOT_REDUCE_COLLECTED_AMOUNT'
          );
        }
        if (targetPaid > effectiveTotal) {
          throw AppError.badRequest(
            `Paid amount (${targetPaid}) cannot exceed total amount (${effectiveTotal}).`,
            'PAID_EXCEEDS_TOTAL_AMOUNT'
          );
        }

        const diff = targetPaid - currentPaid;
        if (diff > 0) {
          await tx.transaction.create({
            data: {
              paymentId: id,
              amount: diff,
              method: 'CASH',
              notes: (typeof notes === 'string' && notes.trim()) ? notes.trim() : 'Updated via reception desk',
            },
          });
          createdNewTransaction = true;
        }
      }

      // If notes were provided without creating a new transaction, persist notes on the latest
      // existing child Transaction row if one exists (Payment itself has no `notes` column).
      if (!createdNewTransaction && typeof notes === 'string' && notes.trim() && currentTransactions.length > 0) {
        await tx.transaction.update({
          where: { id: currentTransactions[0].id },
          data: { notes: notes.trim() },
        });
      }

      const allTx = await tx.transaction.findMany({ where: { paymentId: id } });
      const finalPaid = allTx.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      const updateData = {};
      if (totalAmount !== undefined) updateData.totalAmount = effectiveTotal;

      if (status === 'CANCELLED') {
        updateData.status = 'CANCELLED';
      } else {
        if ((status === 'FULL_PAID' || status === 'COMPLETED') && !(finalPaid >= effectiveTotal && effectiveTotal > 0)) {
          throw AppError.badRequest(
            'Cannot mark payment as COMPLETED unless the full fee amount has been collected.',
            'INVALID_PAYMENT_STATUS'
          );
        }
        if ((status === 'DUE' || status === 'PARTIAL') && finalPaid <= 0) {
          throw AppError.badRequest(
            'Cannot mark payment as PARTIAL with zero collected amount.',
            'INVALID_PAYMENT_STATUS'
          );
        }

        if (finalPaid >= effectiveTotal && effectiveTotal > 0) {
          updateData.status = 'COMPLETED';
        } else if (finalPaid > 0) {
          updateData.status = 'PARTIAL';
        } else if (status === 'OVERDUE') {
          updateData.status = 'OVERDUE';
        } else {
          updateData.status = 'PENDING';
        }
      }

      if (Object.keys(updateData).length > 0) {
        await tx.payment.update({
          where: { id },
          data: updateData,
        });
      }
    });

    return this.getPaymentById(id, currentUser);
  }

  /**
   * Delete a Payment record ONLY if it has zero associated transactions and zero collected payments.
   * Never deletes child transactions. Fails closed if currentUser is missing or not SUPER_ADMIN.
   */
  async deletePayment(id, currentUser = null) {
    if (!currentUser) {
      throw AppError.unauthorized('Authentication required.', 'UNAUTHORIZED');
    }
    if (currentUser.role !== 'SUPER_ADMIN') {
      throw AppError.forbidden('Only Super Administrators can delete payment records.', 'FORBIDDEN');
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        transactions: { select: { id: true, amount: true } },
      },
    });
    if (!payment) throw AppError.notFound('Payment record not found', 'PAYMENT_NOT_FOUND');

    const txCount = payment.transactions ? payment.transactions.length : 0;
    const collectedAmount = (payment.transactions || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    if (txCount > 0 || collectedAmount > 0 || payment.status === 'COMPLETED' || payment.status === 'PARTIAL') {
      throw AppError.badRequest(
        `Cannot delete payment record '${id}' with associated transaction history (${txCount} transaction(s), collected amount: ${collectedAmount}). Financial audit history cannot be deleted.`,
        'PAYMENT_HAS_TRANSACTIONS'
      );
    }

    // Only delete uncollected payment records with zero transactions
    await prisma.payment.delete({ where: { id } });

    return { deleted: true, id };
  }

  /**
   * Get aggregate outstanding fee summary without pagination limits.
   * Calculates total outstanding records, total outstanding balance, and distinct students.
   * Preserves exact outstanding filtering compatibility with listPayments.
   * Groups by currency to ensure mixed currencies are never summed together.
   * Respects role-based access control and branch boundaries.
   */
  async getOutstandingSummary(currentUser) {
    if (!currentUser) {
      throw AppError.unauthorized('Authentication required.', 'UNAUTHORIZED');
    }

    const actorRole = currentUser.role;
    const actorId = currentUser.userId || currentUser.id;
    const branchId = currentUser.branchId;

    if (['BRANCH_ADMIN', 'FRONT_DESK'].includes(actorRole) && !branchId) {
      throw AppError.forbidden(`${actorRole} lacks assigned branch context.`, 'NO_BRANCH_CONTEXT');
    }

    if (!['SUPER_ADMIN', 'BRANCH_ADMIN', 'FRONT_DESK', 'COUNSELOR'].includes(actorRole)) {
      throw AppError.forbidden('You are not authorized to access payment summaries.', 'FORBIDDEN');
    }

    // 1. Group balances by currency to prevent mixing disparate currencies into a single total
    const currencyRows = await prisma.$queryRaw`
      SELECT
        NULLIF(TRIM(UPPER(p."currency")), '') AS "currency",
        COUNT(p."id")::int AS "records",
        COALESCE(ROUND(SUM(GREATEST(0, p."totalAmount" - COALESCE(t_sum.paid, 0)))::numeric, 2), 0)::float AS "amount",
        COUNT(DISTINCT p."studentId")::int AS "students"
      FROM "Payment" p
      INNER JOIN "Student" s ON p."studentId" = s."id"
      LEFT JOIN "User" u ON s."assignedCounselorId" = u."id"
      LEFT JOIN (
        SELECT "paymentId", SUM("amount") AS paid
        FROM "Transaction"
        GROUP BY "paymentId"
      ) t_sum ON p."id" = t_sum."paymentId"
      WHERE s."isActive" = true
        AND p."status" != 'CANCELLED'::"PaymentStatus"
        AND (p."totalAmount" - COALESCE(t_sum.paid, 0)) > 0
        AND (
          (${actorRole} = 'SUPER_ADMIN')
          OR (${actorRole} = 'COUNSELOR' AND s."assignedCounselorId" = ${actorId})
          OR (${actorRole} IN ('BRANCH_ADMIN', 'FRONT_DESK') AND (
            u."branchId" = ${branchId}
            OR (
              s."assignedCounselorId" IS NULL
              AND (
                s."academicBackground" IS NULL
                OR jsonb_extract_path_text(s."academicBackground", 'branchId') = ${branchId}
                OR jsonb_extract_path_text(s."academicBackground", 'branchId') IS NULL
              )
            )
          ))
        )
      GROUP BY NULLIF(TRIM(UPPER(p."currency")), '')
      ORDER BY "currency" ASC NULLS LAST
    `;

    // 2. Compute overall distinct students and total records across all currencies
    const [overall] = await prisma.$queryRaw`
      SELECT
        COUNT(p."id")::int AS "totalOutstandingRecords",
        COUNT(DISTINCT p."studentId")::int AS "uniqueStudentsWithDues"
      FROM "Payment" p
      INNER JOIN "Student" s ON p."studentId" = s."id"
      LEFT JOIN "User" u ON s."assignedCounselorId" = u."id"
      LEFT JOIN (
        SELECT "paymentId", SUM("amount") AS paid
        FROM "Transaction"
        GROUP BY "paymentId"
      ) t_sum ON p."id" = t_sum."paymentId"
      WHERE s."isActive" = true
        AND p."status" != 'CANCELLED'::"PaymentStatus"
        AND (p."totalAmount" - COALESCE(t_sum.paid, 0)) > 0
        AND (
          (${actorRole} = 'SUPER_ADMIN')
          OR (${actorRole} = 'COUNSELOR' AND s."assignedCounselorId" = ${actorId})
          OR (${actorRole} IN ('BRANCH_ADMIN', 'FRONT_DESK') AND (
            u."branchId" = ${branchId}
            OR (
              s."assignedCounselorId" IS NULL
              AND (
                s."academicBackground" IS NULL
                OR jsonb_extract_path_text(s."academicBackground", 'branchId') = ${branchId}
                OR jsonb_extract_path_text(s."academicBackground", 'branchId') IS NULL
              )
            )
          ))
        )
    `;

    const byCurrency = currencyRows.map((r) => ({
      currency: r.currency !== null && r.currency !== undefined ? r.currency : null,
      records: Number(r.records) || 0,
      amount: Number(r.amount) || 0,
      students: Number(r.students) || 0,
    }));

    const totalOutstandingRecords = overall?.totalOutstandingRecords || 0;
    const uniqueStudentsWithDues = overall?.uniqueStudentsWithDues || 0;

    // Strict Scope & Multi-Currency Rules:
    // 1. Zero records: totalOutstandingAmount is 0, currency is null, isMultiCurrency is false.
    // 2. Exactly 1 currency: totalOutstandingAmount is that currency's amount, currency is that code, isMultiCurrency is false.
    // 3. Multiple currencies (> 1): totalOutstandingAmount is strictly null (never sum different currencies,
    //    and never present an all-currency count alongside an NPR-only amount). byCurrency is authoritative.
    const isMultiCurrency = byCurrency.length > 1;
    let totalOutstandingAmount = null;
    let currency = null;

    if (byCurrency.length === 0) {
      totalOutstandingAmount = 0;
      currency = null;
    } else if (byCurrency.length === 1) {
      totalOutstandingAmount = byCurrency[0].amount;
      currency = byCurrency[0].currency;
    } else {
      totalOutstandingAmount = null;
      currency = null;
    }

    return {
      totalOutstandingRecords,
      totalOutstandingAmount,
      uniqueStudentsWithDues,
      currency,
      isMultiCurrency,
      byCurrency,
    };
  }
}

module.exports = new PaymentService();
