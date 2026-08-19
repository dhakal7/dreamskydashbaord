const sharp = require("sharp");
const prisma = require("../prisma");
const AppError = require("../utils/apiError");
const { encrypt, decrypt } = require("../utils/encryption.util");
const { saveFile, readFile, deleteFile } = require("../utils/storage.util");
const { sendNotificationEmail } = require("./email.service");

// ─── Image compression ───────────────────────────────────────────────────────
const compressImage = async (buffer, mimetype) => {
    let pipeline = sharp(buffer).rotate();

    if (mimetype === "image/png") {
        pipeline = pipeline.png({ quality: 85 });
    } else {
        pipeline = pipeline.jpeg({ quality: 82 });
    }

    const metadata = await sharp(buffer).metadata();
    const longest = Math.max(metadata.width || 0, metadata.height || 0);
    if (longest > 2500) {
        pipeline = pipeline.resize({ width: 2500, height: 2500, fit: "inside", withoutEnlargement: true });
    }

    return pipeline.toBuffer();
};

// Map sub-types to primary categories if category isn't explicitly provided
const deriveCategory = (type) => {
    const uppercaseType = (type || "").toUpperCase();
    if (["PASSPORT", "CITIZENSHIP", "BIRTH_CERTIFICATE", "NATIONAL_ID"].includes(uppercaseType)) return "IDENTITY";
    if (["SEE_CERTIFICATE", "PLUS_TWO_CERTIFICATE", "BACHELORS_CERTIFICATE", "TRANSCRIPT", "CHARACTER_CERTIFICATE"].includes(uppercaseType)) return "ACADEMIC";
    if (["IELTS", "PTE", "TOEFL", "DUOLINGO"].includes(uppercaseType)) return "ENGLISH_TEST";
    if (["BANK_STATEMENT", "BANK_CERTIFICATE", "INCOME_CERTIFICATE", "TAX_CLEARANCE", "SPONSORSHIP_LETTER", "AFFIDAVIT", "LOAN_LETTER", "PROPERTY_VALUATION", "FINANCIAL"].includes(uppercaseType)) return "FINANCE";
    if (["VISA_APPLICATION", "VISA_DOCUMENTS", "OFFER_LETTER", "COE", "VISA_LETTER"].includes(uppercaseType)) return "VISA";
    return "OTHER";
};

// ─── UPLOAD DOCUMENT (Auto-creates Document Profile for Student) ─────────────
const uploadDocument = async (file, data, uploadedById) => {
    const student = await prisma.student.findUnique({
        where: { id: data.studentId },
        select: { id: true, firstName: true, lastName: true, assignedCounselorId: true },
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    const isImage = file.mimetype.startsWith("image/");
    let processedBuffer = file.buffer;
    if (isImage) {
        processedBuffer = await compressImage(file.buffer, file.mimetype);
    }

    const encryptedBuffer = encrypt(processedBuffer);
    const relativePath = `students/${data.studentId}/${Date.now()}_v1.enc`;
    await saveFile(relativePath, encryptedBuffer);

    const category = data.category ? data.category.toUpperCase() : deriveCategory(data.type);
    const documentType = data.type ? data.type.toUpperCase() : "OTHER";
    const customName = data.customName?.trim() || null;
    const initialStatus = data.status ? data.status.toUpperCase() : "UPLOADED";

    return prisma.document.create({
        data: {
            studentId: data.studentId,
            category,
            type: documentType,
            customName,
            status: initialStatus,
            fileUrl: relativePath,
            originalName: file.originalname,
            mimeType: file.mimetype,
            fileSize: processedBuffer.length,
            currentVersion: 1,
            uploadedById,
            expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
            notes: data.notes?.trim() || null,
            versions: {
                create: {
                    versionNumber: 1,
                    fileUrl: relativePath,
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    fileSize: processedBuffer.length,
                    uploadedById,
                    status: initialStatus,
                    notes: data.notes?.trim() || null,
                },
            },
        },
        include: {
            student: { select: { id: true, firstName: true, lastName: true, passportNumber: true, studentCode: true } },
            uploadedBy: { select: { id: true, firstName: true, lastName: true } },
            versions: { orderBy: { versionNumber: "desc" } },
        },
    });
};

// ─── REPLACE DOCUMENT (Creates new version, preserves old versions) ──────────
const replaceDocument = async (id, file, data, uploadedById) => {
    const doc = await prisma.document.findUnique({
        where: { id },
        include: { student: { select: { id: true, firstName: true, lastName: true, assignedCounselorId: true } } },
    });
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");

    const isImage = file.mimetype.startsWith("image/");
    let processedBuffer = file.buffer;
    if (isImage) {
        processedBuffer = await compressImage(file.buffer, file.mimetype);
    }

    const nextVersion = doc.currentVersion + 1;
    const encryptedBuffer = encrypt(processedBuffer);
    const relativePath = `students/${doc.studentId}/${Date.now()}_v${nextVersion}.enc`;
    await saveFile(relativePath, encryptedBuffer);

    const newStatus = "RE_UPLOADED";

    // Create new version entry
    await prisma.documentVersion.create({
        data: {
            documentId: id,
            versionNumber: nextVersion,
            fileUrl: relativePath,
            originalName: file.originalname,
            mimeType: file.mimetype,
            fileSize: processedBuffer.length,
            uploadedById,
            status: newStatus,
            notes: data.notes?.trim() || doc.notes,
        },
    });

    // Update main document pointer
    const updated = await prisma.document.update({
        where: { id },
        data: {
            fileUrl: relativePath,
            originalName: file.originalname,
            mimeType: file.mimetype,
            fileSize: processedBuffer.length,
            currentVersion: nextVersion,
            status: newStatus,
            uploadedById,
            notes: data.notes?.trim() || doc.notes,
            customName: data.customName?.trim() || doc.customName,
        },
        include: {
            student: { select: { id: true, firstName: true, lastName: true, passportNumber: true, studentCode: true } },
            uploadedBy: { select: { id: true, firstName: true, lastName: true } },
            versions: { orderBy: { versionNumber: "desc" } },
        },
    });

    return updated;
};

// ─── STUDENT REVIEW SYSTEM (Approve / Request Changes + Notification) ───────
const reviewDocument = async (id, { action, comment }, reviewedById) => {
    const doc = await prisma.document.findUnique({
        where: { id },
        include: {
            student: {
                select: { id: true, firstName: true, lastName: true, email: true, assignedCounselorId: true },
            },
        },
    });
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");

    const uppercaseAction = action.toUpperCase();
    const isApprove = uppercaseAction === "APPROVE";
    const newStatus = isApprove ? "VERIFIED" : "CHANGES_REQUESTED";

    const updated = await prisma.document.update({
        where: { id },
        data: {
            status: newStatus,
            reviewedById,
            reviewedAt: new Date(),
            reviewComment: isApprove ? null : comment?.trim() || null,
        },
        include: {
            student: { select: { id: true, firstName: true, lastName: true } },
            reviewedBy: { select: { id: true, firstName: true, lastName: true } },
            versions: { orderBy: { versionNumber: "desc" } },
        },
    });

    // If student requested changes, send notification to assigned counselor
    if (!isApprove && doc.student.assignedCounselorId) {
        const studentName = `${doc.student.firstName} ${doc.student.lastName}`;
        const docTitle = doc.customName || doc.type;
        await prisma.notification.create({
            data: {
                channel: "IN_APP",
                recipientUserId: doc.student.assignedCounselorId,
                subject: `Document Changes Requested: ${docTitle}`,
                body: `${studentName} requested changes for "${docTitle}": ${comment?.trim() || "No reason provided."}`,
                status: "QUEUED",
                payload: {
                    type: "DOCUMENT_FEEDBACK",
                    studentId: doc.studentId,
                    documentId: doc.id,
                    studentName,
                    documentTitle: docTitle,
                    comment: comment?.trim(),
                },
            },
        });
    }

    return updated;
};

// ─── GET DOCUMENT VERSION HISTORY ────────────────────────────────────────────
const getDocumentHistory = async (id) => {
    const doc = await prisma.document.findUnique({
        where: { id },
        include: {
            student: { select: { id: true, firstName: true, lastName: true } },
            uploadedBy: { select: { id: true, firstName: true, lastName: true } },
            versions: {
                include: {
                    uploadedBy: { select: { id: true, firstName: true, lastName: true } },
                },
                orderBy: { versionNumber: "desc" },
            },
        },
    });
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");
    return doc;
};

// ─── GET ONE DOCUMENT ────────────────────────────────────────────────────────
const getDocumentById = async (id) => {
    const doc = await prisma.document.findUnique({
        where: { id },
        include: {
            student: { select: { id: true, firstName: true, lastName: true, passportNumber: true, studentCode: true } },
            uploadedBy: { select: { id: true, firstName: true, lastName: true } },
            verifiedBy: { select: { id: true, firstName: true, lastName: true } },
            reviewedBy: { select: { id: true, firstName: true, lastName: true } },
            versions: { orderBy: { versionNumber: "desc" } },
        },
    });
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");
    return doc;
};

// ─── LIST STUDENT DOCUMENT PROFILES (Student-Centric View) ───────────────────
const listStudentProfiles = async (query) => {
    const { search } = query;

    const studentWhere = {};
    if (search?.trim()) {
        const q = search.trim();
        studentWhere.OR = [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { passportNumber: { contains: q, mode: "insensitive" } },
            { studentCode: { contains: q, mode: "insensitive" } },
            { id: { contains: q, mode: "insensitive" } },
        ];
    }

    const students = await prisma.student.findMany({
        where: studentWhere,
        include: {
            assignedCounselor: { select: { id: true, firstName: true, lastName: true } },
            documents: {
                include: {
                    uploadedBy: { select: { id: true, firstName: true, lastName: true } },
                    versions: { orderBy: { versionNumber: "desc" } },
                },
                orderBy: { updatedAt: "desc" },
            },
        },
        orderBy: { createdAt: "desc" },
    });

    const REQUIRED_STANDARD_DOCS = 15; // Total target documents expected for 100% completion

    const profiles = students.map((student) => {
        const docs = student.documents || [];
        const totalDocuments = docs.length;
        const verifiedDocuments = docs.filter((d) => d.status === "VERIFIED").length;
        const pendingDocuments = docs.filter((d) => ["UPLOADED", "PENDING_STUDENT_REVIEW", "RE_UPLOADED", "PENDING"].includes(d.status)).length;
        const changesRequestedDocuments = docs.filter((d) => d.status === "CHANGES_REQUESTED").length;

        const latestDocDate = docs.length > 0 ? docs[0].updatedAt : student.updatedAt;
        const completionPercentage = Math.min(Math.round((verifiedDocuments / REQUIRED_STANDARD_DOCS) * 100), 100);

        return {
            studentId: student.id,
            studentName: `${student.firstName} ${student.lastName}`.trim(),
            applicationId: student.studentCode || `EP-2026-${student.id.slice(-4).toUpperCase()}`,
            passportNumber: student.passportNumber || "PA-NOT-PROVIDED",
            assignedCounselor: student.assignedCounselor
                ? `${student.assignedCounselor.firstName} ${student.assignedCounselor.lastName}`
                : "Unassigned",
            totalDocuments,
            verifiedDocuments,
            pendingDocuments,
            changesRequestedDocuments,
            completionPercentage,
            lastUpdated: latestDocDate,
            documents: docs,
        };
    });

    return profiles;
};

// ─── LIST FLAT DOCUMENTS ─────────────────────────────────────────────────────
const listDocuments = async (query) => {
    const { studentId, type, category, status, page, limit } = query;
    const where = {};

    if (studentId) where.studentId = studentId;
    if (type) where.type = type.toUpperCase();
    if (category) where.category = category.toUpperCase();
    if (status) where.status = status.toUpperCase();

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
    const skip = (pageNum - 1) * pageSize;

    const [documents, total] = await Promise.all([
        prisma.document.findMany({
            where,
            include: {
                student: { select: { id: true, firstName: true, lastName: true, passportNumber: true, studentCode: true } },
                uploadedBy: { select: { id: true, firstName: true, lastName: true } },
                versions: { orderBy: { versionNumber: "desc" } },
            },
            orderBy: { updatedAt: "desc" },
            skip,
            take: pageSize,
        }),
        prisma.document.count({ where }),
    ]);

    return {
        documents,
        pagination: { page: pageNum, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
};

// ─── DOWNLOAD ────────────────────────────────────────────────────────────────
const downloadDocument = async (id) => {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");

    const encryptedBuffer = await readFile(doc.fileUrl);
    const decryptedBuffer = decrypt(encryptedBuffer);

    return {
        buffer: decryptedBuffer,
        originalName: doc.originalName || "document",
        mimeType: doc.mimeType || "application/octet-stream",
    };
};

// ─── VERIFY / REJECT ──────────────────────────────────────────────────────────
const verifyDocument = async (id, { status, notes }, verifiedById) => {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");

    const updated = await prisma.document.update({
        where: { id },
        data: {
            status: status.toUpperCase(),
            verifiedById,
            notes: notes?.trim() || doc.notes,
        },
    });

    if (status === "VERIFIED" || status === "REJECTED") {
        const student = await prisma.student.findUnique({
            where: { id: doc.studentId },
            select: { id: true, email: true, firstName: true, lastName: true },
        });
        if (student?.email) {
            const recipientName = [student.firstName, student.lastName].filter(Boolean).join(" ");
            const verdict = status === "VERIFIED" ? "verified" : "rejected";
            sendNotificationEmail({
                to: student.email,
                subject: `Document ${verdict} — DreamSky Education Consultancy`,
                body: `${recipientName ? `Hi ${recipientName},\n\n` : ""}Your document "${doc.customName || doc.originalName || doc.type}" has been ${verdict}.\n\nDreamSky Education Consultancy`,
            }).catch(() => {});
        }
    }

    return updated;
};

// ─── RENAME DOCUMENT ─────────────────────────────────────────────────────────
const renameDocument = async (id, { customName }) => {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");

    return prisma.document.update({
        where: { id },
        data: { customName: customName?.trim() || null },
    });
};

// ─── UPDATE METADATA ──────────────────────────────────────────────────────────
const updateDocument = async (id, data) => {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");

    const update = {};
    if (data.notes !== undefined) update.notes = data.notes?.trim() || null;
    if (data.expiryDate !== undefined) update.expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
    if (data.type !== undefined) update.type = data.type.toUpperCase();
    if (data.category !== undefined) update.category = data.category.toUpperCase();
    if (data.customName !== undefined) update.customName = data.customName?.trim() || null;

    return prisma.document.update({ where: { id }, data: update });
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
const deleteDocument = async (id) => {
    const doc = await prisma.document.findUnique({
        where: { id },
        include: { versions: true },
    });
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");

    // Clean up file versions from storage
    for (const v of doc.versions) {
        await deleteFile(v.fileUrl).catch(() => {});
    }
    await deleteFile(doc.fileUrl).catch(() => {});

    await prisma.document.delete({ where: { id } });
};

module.exports = {
    uploadDocument,
    replaceDocument,
    reviewDocument,
    getDocumentHistory,
    getDocumentById,
    listStudentProfiles,
    listDocuments,
    downloadDocument,
    verifyDocument,
    renameDocument,
    updateDocument,
    deleteDocument,
};
