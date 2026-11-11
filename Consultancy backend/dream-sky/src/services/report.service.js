const prisma = require("../prisma");
const AppError = require("../utils/apiError");

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getLast6Months() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      month: MONTH_NAMES[d.getMonth()],
      start,
      end,
    });
  }
  return months;
}

/**
 * Generates consolidated reports summary
 */
async function getReportsSummary(query = {}, currentUser) {
  if (!currentUser) throw AppError.unauthorized("Authentication required.");

  const { country, counselorId, universityId, dateFrom, dateTo, branchId } = query;

  const studentWhere = { isActive: true };

  // Role scoping
  if (currentUser.role === "COUNSELOR") {
    studentWhere.assignedCounselorId = currentUser.id;
  } else if (currentUser.role === "BRANCH_ADMIN") {
    if (!currentUser.branchId || typeof currentUser.branchId !== "string" || !currentUser.branchId.trim()) {
      throw AppError.forbidden("Branch Admin lacks assigned branch context.", "NO_BRANCH_CONTEXT");
    }
    const authorizedBranchId = currentUser.branchId.trim();
    studentWhere.OR = [
      {
        assignedCounselor: {
          branchId: authorizedBranchId,
        },
      },
      {
        assignedCounselorId: null,
        academicBackground: {
          path: ["branchId"],
          equals: authorizedBranchId,
        },
      },
    ];
  } else if (currentUser.role === "FRONT_DESK") {
    if (currentUser.branchId) {
      studentWhere.assignedCounselor = { branchId: currentUser.branchId };
    }
  } else if (currentUser.role !== "SUPER_ADMIN") {
    throw AppError.forbidden("You do not have permission to view reports.", "FORBIDDEN");
  }

  // Admin filter overrides
  if (branchId && branchId !== "all" && currentUser.role === "SUPER_ADMIN") {
    studentWhere.assignedCounselor = {
      ...(studentWhere.assignedCounselor || {}),
      branchId,
    };
  }
  if (counselorId && counselorId !== "all" && currentUser.role !== "COUNSELOR") {
    studentWhere.assignedCounselorId = counselorId;
  }

  // Date filters
  const dateFilter = {};
  if (dateFrom) dateFilter.gte = new Date(dateFrom);
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    dateFilter.lte = end;
  }
  if (Object.keys(dateFilter).length > 0) {
    studentWhere.createdAt = dateFilter;
  }

  const last6Months = getLast6Months();

  // Parallel database queries
  const [
    totalStudents,
    totalLeads,
    totalApplications,
    visaProcessing,
    allApplications,
    allLeads,
    allCountries,
    agentReferredCount,
    partnerCount,
    directCount,
  ] = await Promise.all([
    // Active students
    prisma.student.count({
      where: {
        ...studentWhere,
        currentStage: {
          in: ["ENROLLED", "APPLIED", "OFFER_RECEIVED", "VISA_APPLIED", "VISA_APPROVED", "DEPARTED"],
        },
      },
    }),

    // Total leads
    prisma.student.count({
      where: {
        ...studentWhere,
        currentStage: { in: ["LEAD", "PROSPECT"] },
      },
    }),

    // Active applications
    prisma.application.count({
      where: {
        status: { notIn: ["WITHDRAWN", "REJECTED"] },
        student: studentWhere,
        ...(universityId && universityId !== "all" ? { universityId } : {}),
      },
    }),

    // Visa processing
    prisma.visaCase.count({
      where: {
        status: { notIn: ["APPROVED", "REFUSED"] },
        application: { student: studentWhere },
      },
    }),

    // Applications over time for last 6 months
    prisma.application.findMany({
      where: {
        createdAt: { gte: last6Months[0].start },
        student: studentWhere,
        ...(universityId && universityId !== "all" ? { universityId } : {}),
      },
      select: { createdAt: true, status: true },
    }),

    // Leads over time for last 6 months
    prisma.student.findMany({
      where: {
        createdAt: { gte: last6Months[0].start },
        ...studentWhere,
      },
      select: { createdAt: true, currentStage: true },
    }),

    // Top destination countries
    prisma.country.findMany({
      select: {
        id: true,
        name: true,
      },
      take: 6,
    }),

    // Referral sources count
    prisma.student.count({
      where: {
        ...studentWhere,
        referredByAgentId: { not: null },
      },
    }),

    // Partner consultancy source count
    prisma.student.count({
      where: {
        ...studentWhere,
        partnerConsultancyId: { not: null },
      },
    }),

    // Direct inquiry source count
    prisma.student.count({
      where: {
        ...studentWhere,
        referredByAgentId: null,
        partnerConsultancyId: null,
      },
    }),
  ]);

  // Aggregate monthly applications
  const applicationsByMonth = last6Months.map((m) => {
    const count = allApplications.filter(
      (a) => a.createdAt >= m.start && a.createdAt <= m.end
    ).length;
    return { month: m.month, applications: count };
  });

  // Aggregate monthly leads and conversion trend
  let runningTotal = Math.max(0, totalStudents - allLeads.length);
  const leadsByMonth = [];
  const conversionTrend = [];
  const cumulativeStudents = [];

  for (const m of last6Months) {
    const leadsInMonth = allLeads.filter(
      (l) => l.createdAt >= m.start && l.createdAt <= m.end
    );
    const convertedInMonth = leadsInMonth.filter((l) =>
      ["ENROLLED", "APPLIED", "OFFER_RECEIVED", "VISA_APPLIED", "VISA_APPROVED", "DEPARTED"].includes(
        l.currentStage
      )
    ).length;

    const rate = leadsInMonth.length > 0
      ? Math.round((convertedInMonth / leadsInMonth.length) * 100)
      : 0;

    runningTotal += convertedInMonth;

    leadsByMonth.push({ month: m.month, leads: leadsInMonth.length });
    conversionTrend.push({ month: m.month, rate });
    cumulativeStudents.push({ month: m.month, total: runningTotal });
  }

  // Country distribution (scoped to authorized student scope)
  const countryDistribution = await Promise.all(
    allCountries.map(async (c) => {
      const studentCount = await prisma.student.count({
        where: {
          ...studentWhere,
          applications: {
            some: {
              university: { countryId: c.id },
            },
          },
        },
      });

      const applicationCount = await prisma.application.count({
        where: {
          student: studentWhere,
          university: { countryId: c.id },
          status: { notIn: ["WITHDRAWN", "REJECTED"] },
          ...(universityId && universityId !== "all" ? { universityId } : {}),
        },
      });

      return {
        name: c.name,
        students: studentCount,
        applications: applicationCount,
      };
    })
  );

  // Source distribution
  const sourceDistribution = [
    { source: "Direct Inquiry", count: directCount },
    { source: "Referral Agent", count: agentReferredCount },
    { source: "Partner Consultancy", count: partnerCount },
  ];

  return {
    summary: [
      { label: "Students", value: totalStudents },
      { label: "Leads", value: totalLeads },
      { label: "Applications", value: totalApplications },
      { label: "Visa Processing", value: visaProcessing },
    ],
    applicationsByMonth,
    leadsByMonth,
    conversionTrend,
    countryDistribution,
    sourceDistribution,
    cumulativeStudents,
  };
}

/**
 * Generates reports scoped to a teacher's classes
 */
async function getTeacherReports(currentUser) {
  if (!currentUser) throw AppError.unauthorized("Authentication required.");
  if (currentUser.role !== "TEACHER" && currentUser.role !== "SUPER_ADMIN") {
    throw AppError.forbidden("Teacher access required.", "FORBIDDEN");
  }

  const classes = await prisma.class.findMany({
    where: currentUser.role === "TEACHER" ? { teacherId: currentUser.id } : {},
    include: {
      attendanceRecords: {
        orderBy: { date: "asc" },
      },
      enrollments: {
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              testScores: {
                select: {
                  id: true,
                  score: true,
                  type: true,
                  testDate: true,
                  createdAt: true,
                },
                orderBy: { testDate: "desc" },
              },
            },
          },
        },
      },
    },
  });

  const perClassAttendance = classes.map((cls) => {
    const records = cls.attendanceRecords || [];
    const totalRecords = records.length;
    const presentRecords = records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
    const overallPct = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0;

    // Real weekly aggregation from attendanceRecords (UTC-consistent Sunday-start)
    const weeks = {};
    for (const r of records) {
      if (!r.date) continue;
      const d = new Date(r.date);
      const day = d.getUTCDay(); // 0 is Sunday
      const diff = d.getUTCDate() - day;
      const sunday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0));
      const key = sunday.toISOString().split("T")[0];

      if (!weeks[key]) {
        weeks[key] = {
          week: key,
          label: `${MONTH_NAMES[sunday.getUTCMonth()]} ${sunday.getUTCDate()}`,
          present: 0,
          total: 0,
        };
      }
      weeks[key].total += 1;
      if (r.status === "PRESENT" || r.status === "LATE") {
        weeks[key].present += 1;
      }
    }

    const weekly = Object.values(weeks)
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-8)
      .map((w) => ({
        week: w.week,
        label: w.label,
        pct: w.total > 0 ? Math.round((w.present / w.total) * 100) : 0,
      }));

    // Real monthly aggregation from attendanceRecords (UTC-consistent)
    const months = {};
    for (const r of records) {
      if (!r.date) continue;
      const d = new Date(r.date);
      const year = d.getUTCFullYear();
      const monthNum = d.getUTCMonth(); // 0-11
      const key = `${year}-${String(monthNum + 1).padStart(2, "0")}`;

      if (!months[key]) {
        months[key] = {
          month: key,
          label: `${MONTH_NAMES[monthNum]} ${year}`,
          present: 0,
          total: 0,
        };
      }
      months[key].total += 1;
      if (r.status === "PRESENT" || r.status === "LATE") {
        months[key].present += 1;
      }
    }

    const monthly = Object.values(months)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)
      .map((m) => ({
        month: m.month,
        label: m.label,
        pct: m.total > 0 ? Math.round((m.present / m.total) * 100) : 0,
      }));

    return {
      classId: cls.id,
      className: cls.name,
      overallPct,
      weekly,
      monthly,
    };
  });

  const perStudentTestResults = [];
  const uniqueStudentIds = new Set();
  const uniqueTestIds = new Set();
  let totalAttendanceRecords = 0;
  let totalPresentRecords = 0;

  for (const cls of classes) {
    const recs = cls.attendanceRecords || [];
    totalAttendanceRecords += recs.length;
    totalPresentRecords += recs.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;

    for (const enr of cls.enrollments || []) {
      if (enr.student) {
        uniqueStudentIds.add(enr.student.id);
        const scores = Array.isArray(enr.student.testScores) ? enr.student.testScores : [];

        // Count distinct test record IDs for teacher-level testsRecorded metric
        for (const s of scores) {
          if (s && s.id) {
            uniqueTestIds.add(s.id);
          }
        }

        if (scores.length > 0) {
          const sum = scores.reduce(
            (acc, s) => acc + (typeof s.score === "number" ? s.score : parseFloat(s.score) || 0),
            0
          );
          const avgScore = Math.round((sum / scores.length) * 10) / 10;
          const latest = scores[0];

          perStudentTestResults.push({
            studentId: enr.student.id,
            studentName: `${enr.student.firstName || ""} ${enr.student.lastName || ""}`.trim(),
            classId: cls.id,
            className: cls.name,
            testCount: scores.length,
            avgScore,
            latestResult: latest
              ? {
                  id: latest.id,
                  type: latest.type,
                  score: latest.score,
                  testDate: latest.testDate,
                  createdAt: latest.createdAt ? latest.createdAt.toISOString() : new Date().toISOString(),
                }
              : null,
          });
        }
      }
    }
  }

  const testsRecorded = uniqueTestIds.size;

  const stats = {
    totalClasses: classes.length,
    totalStudents: uniqueStudentIds.size,
    overallAttendance: totalAttendanceRecords > 0 ? Math.round((totalPresentRecords / totalAttendanceRecords) * 100) : 0,
    testsRecorded,
  };

  return {
    stats,
    perClassAttendance,
    perStudentTestResults,
  };
}

module.exports = {
  getReportsSummary,
  getTeacherReports,
};

