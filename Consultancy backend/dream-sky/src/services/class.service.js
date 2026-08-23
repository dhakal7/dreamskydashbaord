const prisma = require("../prisma");

function normalizeToUtcMidnight(dateStr) {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Check if the user has access to the given class
 */
async function checkClassAccess(classId, user) {
  const clazz = await prisma.class.findUnique({
    where: { id: classId },
  });

  if (!clazz) {
    return { error: "NOT_FOUND", message: `Class with id '${classId}' not found.` };
  }

  if (user.role === "SUPER_ADMIN" || user.role === "BRANCH_ADMIN") {
    return { clazz };
  }

  if (user.role === "TEACHER") {
    if (clazz.teacherId !== user.id) {
      return { error: "FORBIDDEN", message: "Access denied. You do not teach this class." };
    }
    return { clazz };
  }

  return { clazz };
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

  const clazz = await prisma.class.create({
    data: {
      name: name.trim(),
      subject: subject ? subject.trim() : null,
      schedule: schedule || null,
      branchId: branchId || null,
      teacherId: targetTeacherId,
    },
    include: { branch: true, teacher: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });

  return { clazz };
}

/**
 * List classes based on user role
 */
async function listClasses(user) {
  const whereClause = user.role === "TEACHER" ? { teacherId: user.id } : {};

  return await prisma.class.findMany({
    where: whereClause,
    include: { branch: true, teacher: { select: { id: true, firstName: true, lastName: true, email: true } } },
    orderBy: { name: "asc" },
  });
}

/**
 * Get class by ID
 */
async function getClassById(id, user) {
  return await checkClassAccess(id, user);
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

  if (user.role === "SUPER_ADMIN" || user.role === "BRANCH_ADMIN") {
    if (branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      if (!branch) return { error: "BRANCH_NOT_FOUND" };
      updateData.branchId = branchId;
    }
    if (teacherId) {
      const teacherUser = await prisma.user.findUnique({ where: { id: teacherId } });
      if (!teacherUser) return { error: "TEACHER_NOT_FOUND" };
      if (teacherUser.role !== "TEACHER" && teacherUser.role !== "SUPER_ADMIN") {
        return { error: "INVALID_TEACHER_ROLE" };
      }
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

  return { clazz: updated };
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
 * Enroll student in class
 */
async function enrollStudent(classId, studentId) {
  const clazz = await prisma.class.findUnique({ where: { id: classId } });
  if (!clazz) return { error: "CLASS_NOT_FOUND" };

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return { error: "STUDENT_NOT_FOUND" };

  try {
    const enrollment = await prisma.enrollment.create({
      data: { classId, studentId },
    });

    // Automatically update student stage to ENROLLED if they are a LEAD/PROSPECT
    if (student.currentStage === "LEAD" || student.currentStage === "PROSPECT") {
      await prisma.student.update({
        where: { id: studentId },
        data: { currentStage: "ENROLLED" },
      });
      await prisma.pipelineStageHistory.create({
        data: {
          studentId,
          fromStage: student.currentStage,
          toStage: "ENROLLED",
          notes: `Enrolled into class ${clazz.name}`,
        },
      });
    }

    return { enrollment };
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
async function unenrollStudent(classId, studentId) {
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

  const { type, title, body, fileUrl, dueDate } = data;

  const content = await prisma.classContent.create({
    data: {
      classId,
      type,
      title: title.trim(),
      body: body ? body.trim() : null,
      fileUrl: fileUrl ? fileUrl.trim() : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdById: currentUser.id,
    },
  });

  return { content };
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

  return { contents };
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

  const { title, body, fileUrl, dueDate, type } = data;

  const updated = await prisma.classContent.update({
    where: { id: contentId },
    data: {
      ...(title ? { title: title.trim() } : {}),
      ...(body !== undefined ? { body: body ? body.trim() : null } : {}),
      ...(fileUrl !== undefined ? { fileUrl: fileUrl ? fileUrl.trim() : null } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(type ? { type } : {}),
    },
  });

  return { content: updated };
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
async function getStudentEnrollments(studentId) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
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

  return enrollments.map((en) => {
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
