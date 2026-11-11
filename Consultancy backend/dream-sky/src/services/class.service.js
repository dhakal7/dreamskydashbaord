const prisma = require("../prisma");

// Explicit Student projection (avoids selecting columns absent from the current DB schema)
const ENROLLED_STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  currentStage: true,
  isActive: true,
};

function normalizeToUtcMidnight(dateStr) {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isValidBranchId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function projectEnrolledStudent(student) {
  if (!student || typeof student !== "object") return null;
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email ?? null,
    phone: student.phone ?? null,
    currentStage: student.currentStage,
    ...(student.isActive !== undefined ? { isActive: student.isActive } : {}),
  };
}

function isStudentCrossBranch(student, authorizedBranchId) {
  if (!student || typeof student !== "object") return false;

  const hasAssignedCounselor =
    (student.assignedCounselorId !== undefined &&
      student.assignedCounselorId !== null &&
      String(student.assignedCounselorId).trim().length > 0) ||
    (student.assignedCounselor !== undefined &&
      student.assignedCounselor !== null &&
      typeof student.assignedCounselor === "object");

  // Rule 1: If assigned counselor exists, assignedCounselor.branchId takes priority (never overridden by academicBackground.branchId)
  if (hasAssignedCounselor) {
    const counselorBranchId = student.assignedCounselor?.branchId;
    return !isValidBranchId(counselorBranchId) || counselorBranchId.trim() !== authorizedBranchId;
  }

  // Rule 2: Fallback to academicBackground.branchId only when unassigned
  if (student.academicBackground && typeof student.academicBackground === "object") {
    const academicBranchId = student.academicBackground.branchId;
    if (academicBranchId !== undefined) {
      return !isValidBranchId(academicBranchId) || academicBranchId.trim() !== authorizedBranchId;
    }
    if (student.assignedCounselorId === null) {
      return true;
    }
  }

  // Fallback for synthetic records with direct branchId property
  if (student.branchId !== undefined && student.branchId !== null) {
    return !isValidBranchId(student.branchId) || student.branchId.trim() !== authorizedBranchId;
  }

  return false;
}

function sanitizeBranchScopedClassRelations(clazz, authorizedBranchId) {
  if (!clazz || typeof clazz !== "object") return clazz;
  const sanitized = { ...clazz };

  if (Array.isArray(sanitized.enrollments)) {
    sanitized.enrollments = sanitized.enrollments
      .filter((en) => {
        if (!en || typeof en !== "object") return false;
        if (en.branchId !== undefined && en.branchId !== null) {
          if (!isValidBranchId(en.branchId) || en.branchId.trim() !== authorizedBranchId) {
            return false;
          }
        }
        if (en.student && isStudentCrossBranch(en.student, authorizedBranchId)) {
          return false;
        }
        return true;
      })
      .map((en) => ({
        ...en,
        student: en.student ? projectEnrolledStudent(en.student) : null,
      }));
  }

  if (sanitized.teacher && typeof sanitized.teacher === "object") {
    const teacherBranchId = sanitized.teacher.branchId;
    if (teacherBranchId !== undefined && teacherBranchId !== null) {
      if (!isValidBranchId(teacherBranchId) || teacherBranchId.trim() !== authorizedBranchId) {
        sanitized.teacher = {
          id: sanitized.teacher.id,
          firstName: sanitized.teacher.firstName,
          lastName: sanitized.teacher.lastName,
          email: null,
        };
      } else {
        const { branchId: _tb, ...safeTeacher } = sanitized.teacher;
        sanitized.teacher = safeTeacher;
      }
    }
  }

  return sanitized;
}

function normalizeProjectedClassRelations(clazz) {
  if (!clazz || typeof clazz !== "object") return clazz;
  const normalized = { ...clazz };
  if (Array.isArray(normalized.enrollments)) {
    normalized.enrollments = normalized.enrollments.map((en) => ({
      ...en,
      student: en.student ? projectEnrolledStudent(en.student) : null,
    }));
  }
  if (normalized.teacher && typeof normalized.teacher === "object" && "branchId" in normalized.teacher) {
    const { branchId: _tb, ...safeTeacher } = normalized.teacher;
    normalized.teacher = safeTeacher;
  }
  return normalized;
}

/**
 * Check if the user has access to the given class
 */
async function checkClassAccess(classId, user) {
  if (!user || typeof user !== "object") {
    return { error: "FORBIDDEN", code: "UNAUTHORIZED", message: "Authentication required." };
  }

  const clazz = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      branch: true,
      teacher: { select: { id: true, firstName: true, lastName: true, email: true, branchId: true } },
      enrollments: {
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              currentStage: true,
              assignedCounselor: { select: { id: true, branchId: true } },
              academicBackground: true,
            },
          },
        },
        orderBy: { enrolledAt: 'desc' },
      },
    },
  });

  if (!clazz) {
    return { error: "NOT_FOUND", message: `Class with id '${classId}' not found.` };
  }

  if (user.role === "SUPER_ADMIN") {
    return { clazz: normalizeProjectedClassRelations(clazz) };
  }

  if (user.role === "BRANCH_ADMIN") {
    if (!isValidBranchId(user.branchId)) {
      return {
        error: "FORBIDDEN",
        code: "NO_BRANCH_CONTEXT",
        message: "Branch Admin lacks assigned branch context.",
      };
    }
    if (!isValidBranchId(clazz.branchId)) {
      return {
        error: "FORBIDDEN",
        code: "INVALID_CLASS_BRANCH",
        message: "Access denied. Class has no valid branch assignment.",
      };
    }
    const authorizedBranchId = user.branchId.trim();
    const classBranchId = clazz.branchId.trim();
    if (classBranchId !== authorizedBranchId) {
      return {
        error: "FORBIDDEN",
        code: "BRANCH_MISMATCH",
        message: "Access denied. Class is outside your branch.",
      };
    }
    return { clazz: sanitizeBranchScopedClassRelations(clazz, authorizedBranchId) };
  }

  if (user.role === "TEACHER") {
    if (clazz.teacherId !== user.id) {
      return { error: "FORBIDDEN", message: "Access denied. You do not teach this class." };
    }
    return { clazz: normalizeProjectedClassRelations(clazz) };
  }

  if (user.role === "FRONT_DESK" || user.role === "COUNSELOR") {
    if (user.branchId && clazz.branchId && clazz.branchId !== user.branchId) {
      return { error: "FORBIDDEN", message: "Access denied. Class is outside your branch." };
    }
    return { clazz: normalizeProjectedClassRelations(clazz) };
  }

  if (user.role === "STUDENT") {
    const actorStudentId = user.studentId || user.id;
    const isEnrolled = clazz.enrollments.some((en) => en.student?.id === actorStudentId);
    if (!isEnrolled) {
      return { error: "FORBIDDEN", message: "Access denied. You are not enrolled in this class." };
    }
    // Roster privacy: redact email and phone of other students
    const sanitizedEnrollments = clazz.enrollments.map((en) => {
      const projectedStudent = en.student ? projectEnrolledStudent(en.student) : null;
      if (projectedStudent?.id === actorStudentId) {
        return { ...en, student: projectedStudent };
      }
      return {
        ...en,
        student: projectedStudent
          ? {
              ...projectedStudent,
              email: null,
              phone: null,
            }
          : null,
      };
    });
    return { clazz: { ...normalizeProjectedClassRelations(clazz), enrollments: sanitizedEnrollments } };
  }

  return { error: "FORBIDDEN", message: "Access denied." };
}

/**
 * Create a new class
 */
async function createClass(data, currentUser) {
  const { name, subject, schedule, branchId, teacherId } = data;
  let targetTeacherId = teacherId || currentUser.id;

  if (currentUser.role === "TEACHER") {
    targetTeacherId = currentUser.id;
  }

  if (branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return { error: "BRANCH_NOT_FOUND" };
  }

  const teacherUser = await prisma.user.findUnique({ where: { id: targetTeacherId } });
  if (!teacherUser) return { error: "TEACHER_NOT_FOUND" };

  if (teacherUser.role !== "TEACHER" && teacherUser.role !== "SUPER_ADMIN") {
    return { error: "INVALID_TEACHER_ROLE" };
  }

  let schedulePayload = schedule || null;
  if (data.capacity !== undefined) {
    const numCap = parseInt(data.capacity, 10);
    if (!isNaN(numCap) && numCap > 0) {
      if (schedulePayload && typeof schedulePayload === "object") {
        schedulePayload = { ...schedulePayload, capacity: numCap };
      } else {
        schedulePayload = { text: schedulePayload ? String(schedulePayload) : null, capacity: numCap };
      }
    }
  }

  const clazz = await prisma.class.create({
    data: {
      name: name.trim(),
      subject: subject ? subject.trim() : null,
      schedule: schedulePayload,
      branchId: branchId || null,
      teacherId: targetTeacherId,
    },
    include: { branch: true, teacher: { select: { id: true, firstName: true, lastName: true, email: true } }, enrollments: { include: { student: { select: ENROLLED_STUDENT_SELECT } } } },
  });

  return { clazz: attachClassCapacity(clazz) };
}

/**
 * List classes based on user role
 */
async function listClasses(user) {
  let whereClause = {};

  if (user.role === "TEACHER") {
    whereClause = { teacherId: user.id };
  } else if (user.role === "STUDENT") {
    const actorStudentId = user.studentId || user.id;
    whereClause = { enrollments: { some: { studentId: actorStudentId } } };
  } else if (user.role === "BRANCH_ADMIN") {
    if (!isValidBranchId(user.branchId)) {
      return [];
    }
    whereClause = { branchId: user.branchId.trim() };
  } else if (user.role === "FRONT_DESK" || user.role === "COUNSELOR") {
    if (user.branchId) {
      whereClause = { branchId: user.branchId };
    }
  }

  const classes = await prisma.class.findMany({
    where: whereClause,
    include: {
      branch: true,
      teacher: { select: { id: true, firstName: true, lastName: true, email: true } },
      enrollments: {
        include: {
          student: { select: ENROLLED_STUDENT_SELECT },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  const filteredClasses =
    user.role === "BRANCH_ADMIN"
      ? (classes || [])
          .filter((c) => c && isValidBranchId(c.branchId) && c.branchId.trim() === user.branchId.trim())
          .map((c) => sanitizeBranchScopedClassRelations(c, user.branchId.trim()))
      : classes || [];
  return filteredClasses.map(attachClassCapacity);
}

/**
 * Get class by ID
 */
async function getClassById(id, user) {
  const result = await checkClassAccess(id, user);
  if (result.clazz) {
    return { ...result, clazz: attachClassCapacity(result.clazz) };
  }
  return result;
}

/**
 * Update class
 */
async function updateClass(id, data, user) {
  const access = await checkClassAccess(id, user);
  if (access.error) return access;

  const { name, subject, schedule, branchId, teacherId } = data;
  const updateData = {};

  if (name) updateData.name = name.trim();
  if (subject !== undefined) updateData.subject = subject ? subject.trim() : null;
  if (schedule !== undefined) updateData.schedule = schedule;

  if (data.capacity !== undefined) {
    const numCap = parseInt(data.capacity, 10);
    if (!isNaN(numCap) && numCap > 0) {
      const baseSched = schedule !== undefined ? schedule : access.clazz?.schedule;
      if (baseSched && typeof baseSched === "object") {
        updateData.schedule = { ...baseSched, capacity: numCap };
      } else {
        updateData.schedule = { text: baseSched ? String(baseSched) : null, capacity: numCap };
      }
    }
  }

  if (user.role === "SUPER_ADMIN" || user.role === "BRANCH_ADMIN" || user.role === "FRONT_DESK" || user.role === "RECEPTION") {
    if (branchId) {
      if (user.role === "BRANCH_ADMIN" && (!isValidBranchId(user.branchId) || branchId !== user.branchId.trim())) {
        return { error: "FORBIDDEN", message: "Branch Admin cannot reassign a class to another branch." };
      }
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      if (!branch) return { error: "BRANCH_NOT_FOUND" };
      updateData.branchId = branchId;
    }
    if (teacherId) {
      const teacherUser = await prisma.user.findUnique({ where: { id: teacherId } });
      if (!teacherUser) return { error: "TEACHER_NOT_FOUND" };
      updateData.teacherId = teacherId;
    }
  } else {
    if (branchId || teacherId) {
      return { error: "TEACHER_RESTRICTED" };
    }
  }

  const updated = await prisma.class.update({
    where: { id },
    data: updateData,
    include: { branch: true, teacher: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });

  return { clazz: attachClassCapacity(updated) };
}

/**
 * Delete class
 */
async function deleteClass(id, user) {
  const access = await checkClassAccess(id, user);
  if (access.error) return access;

  await prisma.class.delete({ where: { id } });
  return { deleted: true, id };
}

/**
 * Verify that the authenticated actor has permission to enroll, unenroll, or view
 * enrollments for a student and (when provided) a target class. Fails closed when
 * required branch or counselor ownership context is missing.
 */
function authorizeStudentEnrollmentScope(student, clazz, currentUser, action = "enroll") {
  if (!currentUser) {
    return { error: "UNAUTHORIZED", message: "Authentication required." };
  }

  const actorRole = currentUser.role;
  const actorId = currentUser.userId || currentUser.id;

  // Policy B: Only SUPER_ADMIN, BRANCH_ADMIN, and FRONT_DESK may enroll/unenroll students
  if (action === "enroll" || action === "unenroll") {
    if (actorRole !== "SUPER_ADMIN" && actorRole !== "BRANCH_ADMIN" && actorRole !== "FRONT_DESK") {
      return { error: "FORBIDDEN", message: `Only administrators and front desk staff are authorized to ${action} students.` };
    }
  }

  if (actorRole === "SUPER_ADMIN") {
    if (!student || !student.id) {
      return { error: "STUDENT_NOT_FOUND", message: "Student not found." };
    }
    return { ok: true };
  }

  if (actorRole === "COUNSELOR") {
    if (!student || !student.id || !student.assignedCounselorId || student.assignedCounselorId !== actorId) {
      return { error: "FORBIDDEN", message: `You are not authorized to ${action} this student.` };
    }
    if (currentUser.branchId && clazz && clazz.branchId && clazz.branchId !== currentUser.branchId) {
      return { error: "FORBIDDEN", message: `You are not authorized to ${action} students in a class outside your branch.` };
    }
    return { ok: true };
  }

  if (actorRole === "BRANCH_ADMIN" || actorRole === "FRONT_DESK") {
    if (!isValidBranchId(currentUser.branchId)) {
      return { error: "FORBIDDEN", message: `${actorRole} lacks assigned branch context.` };
    }
    const authorizedBranchId = currentUser.branchId.trim();
    const studentBranchId = student?.assignedCounselor?.branchId;
    if (studentBranchId && studentBranchId !== authorizedBranchId) {
      return { error: "FORBIDDEN", message: `You are not authorized to ${action} a student outside your branch.` };
    }
    if (clazz) {
      if (actorRole === "BRANCH_ADMIN" && !isValidBranchId(clazz.branchId)) {
        return { error: "FORBIDDEN", message: "Access denied. Class has no valid branch assignment." };
      }
      if (clazz.branchId && clazz.branchId !== authorizedBranchId) {
        return { error: "FORBIDDEN", message: `You are not authorized to ${action} students in a class outside your branch.` };
      }
    }
    return { ok: true };
  }

  return { error: "FORBIDDEN", message: `You are not authorized to ${action} this student.` };
}

function extractClassCapacity(clazz) {
  if (!clazz) return 20;
  if (typeof clazz.capacity === "number" && clazz.capacity > 0) {
    return clazz.capacity;
  }
  if (clazz.schedule) {
    if (typeof clazz.schedule === "object" && typeof clazz.schedule.capacity === "number" && clazz.schedule.capacity > 0) {
      return clazz.schedule.capacity;
    }
    if (typeof clazz.schedule === "string") {
      try {
        const parsed = JSON.parse(clazz.schedule);
        if (parsed && typeof parsed.capacity === "number" && parsed.capacity > 0) {
          return parsed.capacity;
        }
      } catch (_) {}
    }
  }
  return 20;
}

function attachClassCapacity(clazz) {
  if (!clazz) return clazz;
  return {
    ...clazz,
    capacity: extractClassCapacity(clazz),
  };
}

function formatClassContent(content) {
  if (!content) return content;
  return {
    ...content,
    body: content.body ?? null,
    description: content.body ?? content.description ?? null,
    fileUrl: content.fileUrl ?? null,
    url: content.fileUrl ?? content.url ?? null,
    dueDate: content.dueDate ?? null,
  };
}

/**
 * Enroll student in class
 */
async function enrollStudent(classId, studentId, currentUser = null) {
  if (!currentUser) {
    return { error: "UNAUTHORIZED", message: "Authentication required." };
  }

  const clazz = await prisma.class.findUnique({ where: { id: classId } });
  if (!clazz) return { error: "CLASS_NOT_FOUND" };

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      currentStage: true,
      isActive: true,
      assignedCounselorId: true,
      assignedCounselor: { select: { id: true, branchId: true } },
    },
  });
  if (!student) return { error: "STUDENT_NOT_FOUND" };

  const scopeCheck = authorizeStudentEnrollmentScope(student, clazz, currentUser, "enroll");
  if (scopeCheck.error) return scopeCheck;

  if (student.isActive === false) {
    return {
      error: "STUDENT_IN_TRASH",
      message: "Cannot enroll a student in Trash. Please restore the student first.",
    };
  }

  // Check if student is already enrolled in this class
  const existing = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId, studentId } },
  });
  if (existing) return { error: "ALREADY_ENROLLED" };

  const changedById = currentUser?.id || currentUser?.userId || null;

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Database-level locking: Acquire an exclusive row-level lock on the parent Class record
      // in PostgreSQL to serialize concurrent enrollment attempts for this specific class.
      if (typeof tx.$queryRaw === "function") {
        const lockedRows = await tx.$queryRaw`
          SELECT id, schedule FROM "Class" WHERE id = ${classId} FOR UPDATE
        `;
        if (!lockedRows || lockedRows.length === 0) {
          return { error: "CLASS_NOT_FOUND" };
        }
      }

      // 2. Fetch latest class details on this transaction connection
      const freshClass = await tx.class.findUnique({
        where: { id: classId },
        select: { id: true, schedule: true },
      });
      if (!freshClass) return { error: "CLASS_NOT_FOUND" };

      const maxCapacity = extractClassCapacity(freshClass);

      // 3. Recount qualifying enrollments AFTER the exclusive lock is acquired
      const currentEnrollmentCount = await tx.enrollment.count({
        where: { classId },
      });

      if (currentEnrollmentCount >= maxCapacity) {
        return {
          error: "CLASS_FULL",
          message: `Class has reached its maximum capacity of ${maxCapacity} seats.`,
          currentCount: currentEnrollmentCount,
          maxCapacity,
        };
      }

      // 4. Duplicate check inside transaction
      const existingInTx = await tx.enrollment.findUnique({
        where: { classId_studentId: { classId, studentId } },
      });
      if (existingInTx) return { error: "ALREADY_ENROLLED" };

      // 5. Create the enrollment
      const enrollment = await tx.enrollment.create({
        data: { classId, studentId },
      });

      // Policy A: Enrolling in a class does NOT automatically convert a person into a consultancy
      // student or mutate their macro stage (currentStage remains LEAD, PROSPECT, etc.).

      return { enrollment };
    });
  } catch (error) {
    if (error.code === "P2002") {
      return { error: "ALREADY_ENROLLED" };
    }
    throw error;
  }
}

/**
 * Unenroll student from class
 */
async function unenrollStudent(classId, studentId, currentUser = null) {
  if (!currentUser) {
    return { error: "UNAUTHORIZED", message: "Authentication required." };
  }

  const clazz = await prisma.class.findUnique({ where: { id: classId } });
  if (!clazz) return { error: "CLASS_NOT_FOUND" };

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      isActive: true,
      assignedCounselorId: true,
      assignedCounselor: { select: { id: true, branchId: true } },
    },
  });
  if (!student) return { error: "STUDENT_NOT_FOUND" };

  const scopeCheck = authorizeStudentEnrollmentScope(student, clazz, currentUser, "unenroll");
  if (scopeCheck.error) return scopeCheck;

  if (student.isActive === false) {
    return {
      error: "STUDENT_IN_TRASH",
      message: "Cannot unenroll a student in Trash. Please restore the student first.",
    };
  }

  const existing = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId, studentId } },
  });

  if (!existing) return { error: "ENROLLMENT_NOT_FOUND" };

  await prisma.enrollment.delete({
    where: { classId_studentId: { classId, studentId } },
  });

  return { unenrolled: true, classId, studentId };
}

/**
 * Mark daily attendance
 */
async function markAttendance(classId, dateStr, records, currentUser) {
  const access = await checkClassAccess(classId, currentUser);
  if (access.error) return access;

  // Policy C: Attendance submissions must validate student enrollment in the target class
  if (Array.isArray(records) && records.length > 0) {
    const studentIds = [...new Set(records.map((r) => r.studentId).filter(Boolean))];
    const enrolledCount = await prisma.enrollment.count({
      where: {
        classId,
        studentId: { in: studentIds },
        student: { isActive: true },
      },
    });

    if (enrolledCount !== studentIds.length) {
      return {
        error: "INVALID_ENROLLMENT",
        message: "One or more students are not actively enrolled in this class.",
      };
    }
  }

  const normalizedDate = normalizeToUtcMidnight(dateStr);

  const results = await prisma.$transaction(
    records.map((record) =>
      prisma.attendanceRecord.upsert({
        where: {
          classId_studentId_date: {
            classId,
            studentId: record.studentId,
            date: normalizedDate,
          },
        },
        update: {
          status: record.status,
          markedById: currentUser.id,
        },
        create: {
          classId,
          studentId: record.studentId,
          date: normalizedDate,
          status: record.status,
          markedById: currentUser.id,
        },
      })
    )
  );

  return { results };
}

/**
 * Create class content
 */
async function createClassContent(classId, data, currentUser) {
  const access = await checkClassAccess(classId, currentUser);
  if (access.error) return access;

  const { type, title, dueDate } = data;
  const rawBody = data.body !== undefined ? data.body : data.description;
  const rawFileUrl = data.fileUrl !== undefined ? data.fileUrl : data.url;

  const content = await prisma.classContent.create({
    data: {
      classId,
      type,
      title: title.trim(),
      body: rawBody ? String(rawBody).trim() : null,
      fileUrl: rawFileUrl ? String(rawFileUrl).trim() : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdById: currentUser.id || currentUser.userId,
    },
  });

  return { content: formatClassContent(content) };
}

/**
 * List content of a class
 */
async function listClassContent(classId, currentUser) {
  const access = await checkClassAccess(classId, currentUser);
  if (access.error) return access;

  const contents = await prisma.classContent.findMany({
    where: { classId },
    orderBy: { createdAt: "desc" },
  });

  const scopedContents = (contents || []).filter((c) => {
    if (!c) return false;
    if (c.classId !== undefined && c.classId !== classId) return false;
    if (currentUser?.role === "BRANCH_ADMIN" && c.branchId !== undefined) {
      return isValidBranchId(c.branchId) && c.branchId.trim() === currentUser.branchId.trim();
    }
    return true;
  });

  return { contents: scopedContents.map(formatClassContent) };
}

/**
 * Update class content
 */
async function updateClassContent(classId, contentId, data, currentUser) {
  const access = await checkClassAccess(classId, currentUser);
  if (access.error) return access;

  const existing = await prisma.classContent.findUnique({ where: { id: contentId } });
  if (!existing || existing.classId !== classId) {
    return { error: "CONTENT_NOT_FOUND" };
  }

  const { title, dueDate, type } = data;
  const rawBody = data.body !== undefined ? data.body : data.description;
  const rawFileUrl = data.fileUrl !== undefined ? data.fileUrl : data.url;

  const updated = await prisma.classContent.update({
    where: { id: contentId },
    data: {
      ...(title ? { title: title.trim() } : {}),
      ...(rawBody !== undefined ? { body: rawBody ? String(rawBody).trim() : null } : {}),
      ...(rawFileUrl !== undefined ? { fileUrl: rawFileUrl ? String(rawFileUrl).trim() : null } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(type ? { type } : {}),
    },
  });

  return { content: formatClassContent(updated) };
}

/**
 * Delete class content
 */
async function deleteClassContent(classId, contentId, currentUser) {
  const access = await checkClassAccess(classId, currentUser);
  if (access.error) return access;

  const existing = await prisma.classContent.findUnique({ where: { id: contentId } });
  if (!existing || existing.classId !== classId) {
    return { error: "CONTENT_NOT_FOUND" };
  }

  await prisma.classContent.delete({ where: { id: contentId } });
  return { deleted: true, id: contentId };
}

/**
 * Get enrollments for a student
 */
async function getStudentEnrollments(studentId, currentUser = null) {
  if (!currentUser) {
    return { error: "UNAUTHORIZED", message: "Authentication required." };
  }

  const actorRole = currentUser.role;
  const actorId = currentUser.userId || currentUser.id;

  if (actorRole === "STUDENT") {
    if (!currentUser.studentId || currentUser.studentId !== studentId) {
      return { error: "FORBIDDEN", message: "You are only authorized to view your own class enrollments." };
    }
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      isActive: true,
      assignedCounselorId: true,
      assignedCounselor: { select: { id: true, branchId: true } },
    },
  });

  if (!student || (student.isActive === false && actorRole !== "SUPER_ADMIN" && actorRole !== "BRANCH_ADMIN")) {
    return { error: "STUDENT_NOT_FOUND", message: "Student not found." };
  }

  if (actorRole === "COUNSELOR" || actorRole === "BRANCH_ADMIN" || actorRole === "FRONT_DESK") {
    const scopeCheck = authorizeStudentEnrollmentScope(student, null, currentUser, "view enrollments for");
    if (scopeCheck.error) return scopeCheck;
  } else if (actorRole !== "SUPER_ADMIN" && actorRole !== "STUDENT" && actorRole !== "TEACHER") {
    return { error: "FORBIDDEN", message: "You are not authorized to view student enrollments." };
  }

  const enrollmentWhere =
    actorRole === "TEACHER"
      ? { studentId, class: { teacherId: actorId } }
      : actorRole === "BRANCH_ADMIN"
        ? { studentId, class: { branchId: currentUser.branchId.trim() } }
        : { studentId };

  const enrollments = await prisma.enrollment.findMany({
    where: enrollmentWhere,
    include: {
      class: {
        include: {
          branch: true,
          attendanceRecords: {
            where: { studentId },
          },
        },
      },
    },
  });

  const visibleEnrollments =
    actorRole === "BRANCH_ADMIN"
      ? (enrollments || []).filter(
          (en) => en?.class && isValidBranchId(en.class.branchId) && en.class.branchId.trim() === currentUser.branchId.trim()
        )
      : enrollments || [];

  return visibleEnrollments.map((en) => {
    const records = en.class.attendanceRecords;
    const total = records.length;
    const presents = records.filter((r) => r.status === "PRESENT").length;
    const lates = records.filter((r) => r.status === "LATE").length;
    const absents = records.filter((r) => r.status === "ABSENT").length;

    return {
      enrollmentId: en.id,
      enrolledAt: en.enrolledAt || en.createdAt,
      class: {
        id: en.class.id,
        name: en.class.name,
        subject: en.class.subject,
        schedule: en.class.schedule,
        branch: en.class.branch,
        teacherId: en.class.teacherId,
      },
      attendanceSummary: {
        totalClassesMarked: total,
        present: presents,
        late: lates,
        absent: absents,
        attendanceRate:
          total > 0 ? parseFloat((((presents + lates * 0.5) / total) * 100).toFixed(1)) : 100.0,
      },
    };
  });
}

module.exports = {
  createClass,
  listClasses,
  getClassById,
  updateClass,
  deleteClass,
  enrollStudent,
  unenrollStudent,
  markAttendance,
  createClassContent,
  listClassContent,
  updateClassContent,
  deleteClassContent,
  getStudentEnrollments,
};
