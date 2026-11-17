// ─── Optional sharp import (native module — may not be available on all hosts) ─
let sharp = null;
try {
    sharp = require("sharp");
} catch (e) {
    console.warn("[document.service] sharp not available — image compression disabled. Files will be stored as-is.");
}

const prisma = require("../prisma");
const AppError = require("../utils/apiError");
const { encrypt, decrypt } = require("../utils/encryption.util");
const { saveFile, readFile, deleteFile } = require("../utils/storage.util");
const { sendNotificationEmail } = require("./email.service");

// ─── Image compression ───────────────────────────────────────────────────────
const compressImage = async (buffer, mimetype) => {
    // If sharp is not available (e.g. cPanel shared hosting), skip compression
    if (!sharp) return buffer;

    try {
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
    } catch (err) {
        console.warn("[document.service] Image compression failed, using original:", err.message);
        return buffer;
    }
};


// Map sub-types to primary categories if category isn't explicitly provided
const deriveCategory = (type) => {
    const uppercaseType = (type || "").toUpperCase();
    if (["PASSPORT", "CITIZENSHIP", "BIRTH_CERTIFICATE", "NATIONAL_ID"].includes(uppercaseType)) return "IDENTITY";
    if (["SEE_CERTIFICATE", "PLUS_TWO_CERTIFICATE", "BACHELORS_CERTIFICATE", "TRANSCRIPT", "CHARACTER_CERTIFICATE"].includes(uppercaseType)) return "ACADEMIC";
    if (["IELTS", "PTE", "TOEFL", "DUOLINGO", "ENGLISH_TEST"].includes(uppercaseType)) return "ENGLISH_TEST";
    if (["BANK_STATEMENT", "BANK_CERTIFICATE", "INCOME_CERTIFICATE", "TAX_CLEARANCE", "SPONSORSHIP_LETTER", "AFFIDAVIT", "LOAN_LETTER", "PROPERTY_VALUATION", "FINANCIAL"].includes(uppercaseType)) return "FINANCE";
    if (["VISA_APPLICATION", "VISA_DOCUMENTS", "OFFER_LETTER", "COE", "VISA_LETTER", "VISA"].includes(uppercaseType)) return "VISA";
    return "OTHER";
};

const DOC_STUDENT_AUTHZ_SELECT = {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    assignedCounselorId: true,
    academicBackground: true,
    isActive: true,
    assignedCounselor: {
        select: {
            id: true,
            firstName: true,
            lastName: true,
            branchId: true,
        },
    },
};

function isValidBranchId(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function resolveStudentBranchId(student) {
    if (!student || typeof student !== "object") return null;

    const hasAssignedCounselor =
        (student.assignedCounselorId !== undefined &&
            student.assignedCounselorId !== null &&
            String(student.assignedCounselorId).trim().length > 0) ||
        (student.assignedCounselor !== undefined &&
            student.assignedCounselor !== null &&
            typeof student.assignedCounselor === "object");

    if (hasAssignedCounselor) {
        const counselorBranchId = student.assignedCounselor?.branchId;
        return isValidBranchId(counselorBranchId) ? counselorBranchId.trim() : null;
    }

    const bg = student.academicBackground;
    if (bg && typeof bg === "object" && isValidBranchId(bg.branchId)) {
        return bg.branchId.trim();
    }

    return null;
}

const LEGACY_DOCUMENT_SCALARS = {
    id: true,
    studentId: true,
    type: true,
    status: true,
    fileUrl: true,
    originalName: true,
    mimeType: true,
    fileSize: true,
    uploadedById: true,
    verifiedById: true,
    expiryDate: true,
    acknowledged: true,
    acknowledgedAt: true,
    notes: true,
    createdAt: true,
    updatedAt: true,
};

// Pre-20261025 enum values supported by the initial schema (20260801090927_init)
const LEGACY_DOCUMENT_TYPES = new Set([
    "PASSPORT",
    "TRANSCRIPT",
    "ENGLISH_TEST",
    "BANK_STATEMENT",
    "OFFER_LETTER",
    "VISA",
    "OTHER",
]);

const LEGACY_DOCUMENT_STATUSES = new Set([
    "PENDING",
    "VERIFIED",
    "REJECTED",
    "EXPIRED",
]);

/**
 * Detects whether a Prisma/PostgreSQL error was caused by an unapplied Document/DocumentVersion
 * schema migration (missing DocumentVersion table, missing newer Document columns, or missing
 * Document enum values), ensuring operational errors and unrelated database errors are never masked.
 */
const isMissingSchemaFeatureError = (err) => {
    if (!err || err.isOperational) return false;
    const code = String(err.code || "");
    const msg = String(err.message || "");
    const metaTarget = JSON.stringify(err.meta || "");
    const combined = `${msg} ${metaTarget}`;
    if (code === "P2021" || code === "P2022") {
        return /DocumentVersion|Document|currentVersion|reviewedById|reviewComment|reviewedAt|category|customName/i.test(combined);
    }
    return /DocumentVersion|currentVersion|reviewedById|reviewComment|reviewedAt|category|customName|invalid input value for enum "(DocumentType|DocumentStatus|DocumentCategory)"/i.test(msg);
};

const findDocumentWithAuthz = async (id) => {
    try {
        return await prisma.document.findUnique({
            where: { id },
            include: { student: { select: DOC_STUDENT_AUTHZ_SELECT } },
        });
    } catch (err) {
        if (!isMissingSchemaFeatureError(err)) throw err;
        return prisma.document.findUnique({
            where: { id },
            select: {
                ...LEGACY_DOCUMENT_SCALARS,
                student: { select: DOC_STUDENT_AUTHZ_SELECT },
            },
        });
    }
};

const assertStudentDocumentAuthorization = (student, user, action = "access") => {
    if (!user) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    const actorRole = user.role;
    const actorId = user.userId || user.id;

    if (actorRole === "SUPER_ADMIN") {
        if (!student || !student.id) {
            throw AppError.notFound("Student not found for document authorization.", "STUDENT_NOT_FOUND");
        }
        return;
    }

    if (actorRole === "COUNSELOR") {
        if (!student || !student.id || !student.assignedCounselorId || student.assignedCounselorId !== actorId) {
            throw AppError.forbidden(`You are not authorized to ${action} documents for this student.`, "FORBIDDEN");
        }
        return;
    }

    if (actorRole === "BRANCH_ADMIN" || actorRole === "FRONT_DESK") {
        if (!isValidBranchId(user.branchId)) {
            throw AppError.forbidden(`${actorRole} lacks assigned branch context.`, "NO_BRANCH_CONTEXT");
        }
        const authorizedBranchId = user.branchId.trim();
        const studentBranchId = resolveStudentBranchId(student);
        if (!student || !student.id || !studentBranchId || studentBranchId !== authorizedBranchId) {
            throw AppError.forbidden(`You are not authorized to ${action} documents outside your branch.`, "FORBIDDEN");
        }
        return;
    }

    if (actorRole === "STUDENT") {
        const actorStudentId = user.studentId;
        if (student && student.id && actorStudentId && student.id === actorStudentId) {
            return;
        }
        throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");
    }

    throw AppError.forbidden(`You are not authorized to ${action} documents.`, "FORBIDDEN");
};

// ─── UPLOAD DOCUMENT (Auto-creates Document Profile for Student) ─────────────
const uploadDocument = async (file, data, uploadedById, user = null) => {
    const student = await prisma.student.findUnique({
        where: { id: data.studentId },
        select: DOC_STUDENT_AUTHZ_SELECT,
    });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");
    if (user) {
        assertStudentDocumentAuthorization(student, user, "upload");
    }
    if (student.isActive === false) {
        throw AppError.badRequest("Cannot upload documents for a student in Trash. Please restore the student first.", "STUDENT_IN_TRASH");
    }

    let validUploaderId = null;
    if (uploadedById) {
        const uploader = await prisma.user.findUnique({ where: { id: uploadedById }, select: { id: true } }).catch(() => null);
        if (uploader) validUploaderId = uploader.id;
    }

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
    // Default to PENDING — "UPLOADED" may not exist in the live DB enum yet
    const initialStatus = data.status ? data.status.toUpperCase() : "PENDING";

    try {
        return await prisma.document.create({
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
                uploadedById: validUploaderId,
                expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
                notes: data.notes?.trim() || null,
                versions: {
                    create: {
                        versionNumber: 1,
                        fileUrl: relativePath,
                        originalName: file.originalname,
                        mimeType: file.mimetype,
                        fileSize: processedBuffer.length,
                        uploadedById: validUploaderId,
                        status: initialStatus,
                        notes: data.notes?.trim() || null,
                    },
                },
            },
            include: {
                student: { select: { id: true, firstName: true, lastName: true } },
                uploadedBy: { select: { id: true, firstName: true, lastName: true } },
                versions: { orderBy: { versionNumber: "desc" } },
            },
        });
    } catch (err) {
        if (!isMissingSchemaFeatureError(err)) {
            await deleteFile(relativePath).catch(() => {});
            throw err;
        }
        const fallbackStatus = initialStatus === "UPLOADED" ? "PENDING" : initialStatus;
        if (!LEGACY_DOCUMENT_TYPES.has(documentType) || !LEGACY_DOCUMENT_STATUSES.has(fallbackStatus)) {
            await deleteFile(relativePath).catch(() => {});
            throw new AppError(
                `Document type "${documentType}" or status "${initialStatus}" requires the document versioning schema migration (20261025_add_document_versioning_and_review).`,
                503,
                "SCHEMA_MIGRATION_REQUIRED"
            );
        }
        try {
            const fallbackDoc = await prisma.document.create({
                data: {
                    studentId: data.studentId,
                    type: documentType,
                    status: fallbackStatus,
                    fileUrl: relativePath,
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    fileSize: processedBuffer.length,
                    uploadedById: validUploaderId,
                    expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
                    notes: data.notes?.trim() || null,
                },
                select: {
                    ...LEGACY_DOCUMENT_SCALARS,
                    student: { select: { id: true, firstName: true, lastName: true } },
                    uploadedBy: { select: { id: true, firstName: true, lastName: true } },
                },
            });
            fallbackDoc.versions = [];
            return fallbackDoc;
        } catch (fallbackErr) {
            await deleteFile(relativePath).catch(() => {});
            if (isMissingSchemaFeatureError(fallbackErr)) {
                throw new AppError(
                    "Uploading this document requires the document versioning schema migration (20261025_add_document_versioning_and_review).",
                    503,
                    "SCHEMA_MIGRATION_REQUIRED"
                );
            }
            throw fallbackErr;
        }
    }
};

// ─── REPLACE DOCUMENT (Creates new version, preserves old versions) ──────────
const replaceDocument = async (id, file, data, uploadedById, user = null) => {
    const doc = await findDocumentWithAuthz(id);
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");
    if (user) {
        checkDocumentAccess(doc, user);
    }
    if (doc.student && doc.student.isActive === false) {
        throw AppError.badRequest("Cannot update documents for a student in Trash. Please restore the student first.", "STUDENT_IN_TRASH");
    }

    let validUploaderId = null;
    if (uploadedById) {
        const uploader = await prisma.user.findUnique({ where: { id: uploadedById }, select: { id: true } }).catch(() => null);
        if (uploader) validUploaderId = uploader.id;
    }

    const isImage = file.mimetype.startsWith("image/");
    let processedBuffer = file.buffer;
    if (isImage) {
        processedBuffer = await compressImage(file.buffer, file.mimetype);
    }

    const encryptedBuffer = encrypt(processedBuffer);

    // Use PENDING — "RE_UPLOADED" may not exist in the live DB enum yet
    const newStatus = "PENDING";

    // Write the new encrypted file to a unique path BEFORE starting the DB transaction
    // so file I/O does not hold open a DB transaction lock, and clean up only this new
    // file if the subsequent DB transaction fails.
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const relativePath = `students/${doc.studentId}/${uniqueSuffix}.enc`;
    await saveFile(relativePath, encryptedBuffer);

    try {
        const updated = await prisma.$transaction(async (tx) => {
            // Acquire a row-level lock on the parent Document row so concurrent replacement
            // requests serialize and cannot allocate duplicate (documentId, versionNumber) pairs.
            if (typeof tx.$executeRaw === "function") {
                await tx.$executeRaw`SELECT 1 FROM "Document" WHERE "id" = ${id} FOR UPDATE`;
            }

            const latestDoc = await tx.document.findUnique({
                where: { id },
                select: { currentVersion: true, notes: true, customName: true, studentId: true },
            });
            if (!latestDoc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");

            let maxRecordedVersion = 0;
            if (tx.documentVersion && typeof tx.documentVersion.aggregate === "function") {
                const agg = await tx.documentVersion.aggregate({
                    where: { documentId: id },
                    _max: { versionNumber: true },
                }).catch((aggErr) => {
                    if (isMissingSchemaFeatureError(aggErr)) return null;
                    throw aggErr;
                });
                maxRecordedVersion = agg?._max?.versionNumber || 0;
            }

            const nextVersion = Math.max(latestDoc.currentVersion || 1, maxRecordedVersion) + 1;

            await tx.documentVersion.create({
                data: {
                    documentId: id,
                    versionNumber: nextVersion,
                    fileUrl: relativePath,
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    fileSize: processedBuffer.length,
                    uploadedById: validUploaderId,
                    status: newStatus,
                    notes: data.notes?.trim() || latestDoc.notes,
                },
            });

            return tx.document.update({
                where: { id },
                data: {
                    fileUrl: relativePath,
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    fileSize: processedBuffer.length,
                    currentVersion: nextVersion,
                    status: newStatus,
                    uploadedById: validUploaderId,
                    notes: data.notes?.trim() || latestDoc.notes,
                    customName: data.customName?.trim() || latestDoc.customName,
                },
                include: {
                    student: { select: { id: true, firstName: true, lastName: true } },
                    uploadedBy: { select: { id: true, firstName: true, lastName: true } },
                    versions: { orderBy: { versionNumber: "desc" } },
                },
            });
        });

        return updated;
    } catch (err) {
        await deleteFile(relativePath).catch(() => {});
        if (isMissingSchemaFeatureError(err)) {
            throw new AppError(
                "Document version replacement requires the document versioning schema migration (20261025_add_document_versioning_and_review) so prior document versions are preserved.",
                503,
                "SCHEMA_MIGRATION_REQUIRED"
            );
        }
        throw err;
    }
};

// ─── DOCUMENT ACCESS CONTROL ────────────────────────────────────────────────
const checkDocumentAccess = (doc, user) => {
    if (!user) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }

    if (!doc) {
        throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");
    }

    if (user.role === "SUPER_ADMIN") {
        return;
    }

    if (user.role === "STUDENT") {
        if (!user.studentId || doc.studentId !== user.studentId) {
            // Return 404 to avoid leaking whether another student's document ID exists
            throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");
        }
        return;
    }

    const staffRoles = ["BRANCH_ADMIN", "COUNSELOR", "FRONT_DESK"];
    if (staffRoles.includes(user.role)) {
        // Fail closed if student authorization context is missing or incomplete
        assertStudentDocumentAuthorization(doc.student, user, "access");
        return;
    }

    throw AppError.forbidden("Access denied. You do not have permission to access documents.", "FORBIDDEN");
};

// ─── STUDENT REVIEW SYSTEM (Approve / Request Changes + Notification) ───────
const reviewDocument = async (id, { action, comment }, user) => {
    if (!id || typeof id !== "string") {
        throw AppError.badRequest("Invalid document ID.", "INVALID_DOCUMENT_ID");
    }

    const doc = await findDocumentWithAuthz(id);
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");

    checkDocumentAccess(doc, user);

    if (doc.student && doc.student.isActive === false) {
        throw AppError.badRequest(
            "Cannot review documents for a student in Trash. Please restore the student first.",
            "STUDENT_IN_TRASH"
        );
    }

    const reviewedById = user.userId || user.id;
    const uppercaseAction = action.toUpperCase();
    const isApprove = uppercaseAction === "APPROVE";
    const newStatus = isApprove ? "VERIFIED" : "CHANGES_REQUESTED";

    let updated;
    try {
        updated = await prisma.document.update({
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
    } catch (err) {
        if (!isMissingSchemaFeatureError(err)) throw err;
        // Fallback when DocumentVersion or CHANGES_REQUESTED / reviewedById columns are not yet migrated
        const fallbackStatus = isApprove ? "VERIFIED" : "REJECTED";
        const fallbackNotes = !isApprove && comment?.trim()
            ? `[Changes Requested] ${comment.trim()}`
            : doc.notes;
        updated = await prisma.document.update({
            where: { id },
            data: {
                status: fallbackStatus,
                notes: fallbackNotes,
            },
            select: {
                ...LEGACY_DOCUMENT_SCALARS,
                student: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        updated.versions = [];
    }

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
const getDocumentHistory = async (id, user) => {
    if (!id || typeof id !== "string") {
        throw AppError.badRequest("Invalid document ID.", "INVALID_DOCUMENT_ID");
    }

    let doc;
    try {
        doc = await prisma.document.findUnique({
            where: { id },
            include: {
                student: { select: DOC_STUDENT_AUTHZ_SELECT },
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
    } catch (err) {
        if (!isMissingSchemaFeatureError(err)) throw err;
        doc = await prisma.document.findUnique({
            where: { id },
            select: {
                ...LEGACY_DOCUMENT_SCALARS,
                student: { select: DOC_STUDENT_AUTHZ_SELECT },
                uploadedBy: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");
        doc.versions = [];
    }

    checkDocumentAccess(doc, user);
    return doc;
};

// ─── GET ONE DOCUMENT ────────────────────────────────────────────────────────
const getDocumentById = async (id, user) => {
    if (!id || typeof id !== "string") {
        throw AppError.badRequest("Invalid document ID.", "INVALID_DOCUMENT_ID");
    }

    let doc;
    try {
        doc = await prisma.document.findUnique({
            where: { id },
            include: {
                student: { select: DOC_STUDENT_AUTHZ_SELECT },
                uploadedBy: { select: { id: true, firstName: true, lastName: true } },
                verifiedBy: { select: { id: true, firstName: true, lastName: true } },
                reviewedBy: { select: { id: true, firstName: true, lastName: true } },
                versions: { orderBy: { versionNumber: "desc" } },
            },
        });
        if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");
    } catch (err) {
        if (!isMissingSchemaFeatureError(err)) throw err;
        doc = await prisma.document.findUnique({
            where: { id },
            select: {
                ...LEGACY_DOCUMENT_SCALARS,
                student: { select: DOC_STUDENT_AUTHZ_SELECT },
                uploadedBy: { select: { id: true, firstName: true, lastName: true } },
                verifiedBy: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");
        doc.versions = [];
    }

    checkDocumentAccess(doc, user);
    return doc;
};

// ─── LIST STUDENT DOCUMENT PROFILES (Student-Centric View) ───────────────────
const listStudentProfiles = async (query = {}, user = null) => {
    const { search } = query;

    const baseSearchWhere = { isActive: true };
    if (user) {
        const actorRole = user.role;
        const actorId = user.userId || user.id;
        if (actorRole === "SUPER_ADMIN") {
            // Full global access
        } else if (actorRole === "COUNSELOR") {
            baseSearchWhere.assignedCounselorId = actorId;
        } else if (actorRole === "BRANCH_ADMIN") {
            if (!isValidBranchId(user.branchId)) {
                throw AppError.forbidden(`${actorRole} lacks assigned branch context.`, "NO_BRANCH_CONTEXT");
            }
            const authorizedBranchId = user.branchId.trim();
            baseSearchWhere.AND = [
                {
                    OR: [
                        { assignedCounselor: { branchId: authorizedBranchId } },
                        {
                            assignedCounselorId: null,
                            academicBackground: { path: ["branchId"], equals: authorizedBranchId },
                        },
                    ],
                },
            ];
        } else if (actorRole === "FRONT_DESK") {
            if (!user.branchId) {
                throw AppError.forbidden(`${actorRole} lacks assigned branch context.`, "NO_BRANCH_CONTEXT");
            }
            baseSearchWhere.assignedCounselor = { branchId: user.branchId };
        } else {
            throw AppError.forbidden("You are not authorized to list student document profiles.", "FORBIDDEN");
        }
    }

    if (search?.trim()) {
        const q = search.trim();
        baseSearchWhere.OR = [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { id: { contains: q, mode: "insensitive" } },
        ];
    }

    const profileWhere = {
        AND: [
            baseSearchWhere,
            {
                OR: [
                    { documents: { some: {} } },
                    { currentStage: { notIn: ["LEAD", "PROSPECT"] } },
                ],
            },
        ],
    };

    const safeStudentProfileSelect = {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        currentStage: true,
        isActive: true,
        assignedCounselorId: true,
        createdAt: true,
        updatedAt: true,
        assignedCounselor: { select: { id: true, firstName: true, lastName: true, branchId: true } },
    };

    let students = [];
    try {
        students = await prisma.student.findMany({
            where: profileWhere,
            select: {
                ...safeStudentProfileSelect,
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
    } catch (e) {
        if (!isMissingSchemaFeatureError(e)) {
            throw e;
        }
        // Fallback when DocumentVersion relation or newer Document columns are not migrated yet.
        // Preserves the exact same student filter (including enrolled students with 0 uploaded documents).
        console.warn("[document.service] listStudentProfiles: primary query failed due to unmigrated schema feature, trying fallback:", e.message);
        try {
            students = await prisma.student.findMany({
                where: profileWhere,
                select: {
                    ...safeStudentProfileSelect,
                    documents: {
                        select: {
                            id: true,
                            studentId: true,
                            type: true,
                            status: true,
                            fileUrl: true,
                            originalName: true,
                            mimeType: true,
                            fileSize: true,
                            uploadedById: true,
                            verifiedById: true,
                            expiryDate: true,
                            notes: true,
                            createdAt: true,
                            updatedAt: true,
                            uploadedBy: { select: { id: true, firstName: true, lastName: true } },
                        },
                        orderBy: { updatedAt: "desc" },
                    },
                },
                orderBy: { createdAt: "desc" },
            });
        } catch (fallbackErr) {
            console.error("[document.service] listStudentProfiles: fallback query also failed:", fallbackErr.message);
            throw fallbackErr;
        }
    }

    const REQUIRED_STANDARD_DOCS = 15;

    const profiles = students.map((student) => {
        const docs = student.documents || [];
        const totalDocuments = docs.length;
        const verifiedDocuments = docs.filter((d) => d.status === "VERIFIED").length;
        const pendingDocuments = docs.filter((d) => ["UPLOADED", "PENDING_STUDENT_REVIEW", "IN_REVIEW", "RE_UPLOADED", "PENDING"].includes(d.status)).length;
        const changesRequestedDocuments = docs.filter((d) => d.status === "CHANGES_REQUESTED").length;

        const latestDocDate = docs.length > 0 ? docs[0].updatedAt : student.updatedAt;
        const completionPercentage = Math.min(Math.round((verifiedDocuments / REQUIRED_STANDARD_DOCS) * 100), 100);

        const mappedDocs = docs.map((d) => {
            const uploaderName = d.uploadedBy
                ? `${d.uploadedBy.firstName || ""} ${d.uploadedBy.lastName || ""}`.trim() || "Counselor"
                : "Counselor";
            return {
                id: d.id,
                studentId: d.studentId,
                category: (d.category || deriveCategory(d.type) || "OTHER").toLowerCase(),
                type: d.type,
                customName: d.customName,
                fileName: d.originalName || `${d.type}.pdf`,
                originalName: d.originalName,
                mimeType: d.mimeType,
                fileSize: d.fileSize,
                fileSizeKb: d.fileSize ? Math.round(d.fileSize / 1024) : 0,
                version: d.currentVersion || 1,
                currentVersion: d.currentVersion || 1,
                uploadedAt: d.createdAt,
                createdAt: d.createdAt,
                uploadedBy: uploaderName,
                status: (d.status || "PENDING").toLowerCase(),
                reviewComment: d.reviewComment,
                reviewedAt: d.reviewedAt,
                notes: d.notes,
            };
        });

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
            documents: mappedDocs,
        };
    });

    return profiles;
};

// ─── LIST FLAT DOCUMENTS ─────────────────────────────────────────────────────
const listDocuments = async (query = {}, user = null) => {
    const { studentId, type, category, status, page, limit } = query;
    const where = {
        student: { isActive: true },
    };

    if (user) {
        const actorRole = user.role;
        const actorId = user.userId || user.id;
        if (actorRole === "SUPER_ADMIN") {
            // Full global access
        } else if (actorRole === "COUNSELOR") {
            where.student.assignedCounselorId = actorId;
        } else if (actorRole === "BRANCH_ADMIN") {
            if (!isValidBranchId(user.branchId)) {
                throw AppError.forbidden(`${actorRole} lacks assigned branch context.`, "NO_BRANCH_CONTEXT");
            }
            const authorizedBranchId = user.branchId.trim();
            where.student.OR = [
                { assignedCounselor: { branchId: authorizedBranchId } },
                {
                    assignedCounselorId: null,
                    academicBackground: { path: ["branchId"], equals: authorizedBranchId },
                },
            ];
        } else if (actorRole === "FRONT_DESK") {
            if (!user.branchId) {
                throw AppError.forbidden(`${actorRole} lacks assigned branch context.`, "NO_BRANCH_CONTEXT");
            }
            where.student.assignedCounselor = { branchId: user.branchId };
        } else if (actorRole === "STUDENT") {
            if (!user.studentId) {
                return {
                    documents: [],
                    pagination: { page: Math.max(parseInt(page) || 1, 1), limit: Math.min(Math.max(parseInt(limit) || 50, 1), 100), total: 0, totalPages: 0 },
                };
            }
            where.studentId = user.studentId;
        } else {
            throw AppError.forbidden("You are not authorized to list documents.", "FORBIDDEN");
        }
    }

    if (studentId && (!user || user.role !== "STUDENT")) where.studentId = studentId;
    if (type) where.type = type.toUpperCase();
    if (category) where.category = category.toUpperCase();
    if (status) where.status = status.toUpperCase();

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
    const skip = (pageNum - 1) * pageSize;

    let documents;
    let total;
    try {
        [documents, total] = await Promise.all([
            prisma.document.findMany({
                where,
                include: {
                    student: { select: { id: true, firstName: true, lastName: true } },
                    uploadedBy: { select: { id: true, firstName: true, lastName: true } },
                    versions: { orderBy: { versionNumber: "desc" } },
                },
                orderBy: { updatedAt: "desc" },
                skip,
                take: pageSize,
            }),
            prisma.document.count({ where }),
        ]);
    } catch (err) {
        if (!isMissingSchemaFeatureError(err)) throw err;
        const fallbackWhere = { ...where };
        delete fallbackWhere.category;
        if (
            (fallbackWhere.type && !LEGACY_DOCUMENT_TYPES.has(fallbackWhere.type)) ||
            (fallbackWhere.status && !LEGACY_DOCUMENT_STATUSES.has(fallbackWhere.status))
        ) {
            return {
                documents: [],
                pagination: { page: pageNum, limit: pageSize, total: 0, totalPages: 0 },
            };
        }
        const [fallbackDocs, fallbackTotal] = await Promise.all([
            prisma.document.findMany({
                where: fallbackWhere,
                select: {
                    id: true,
                    studentId: true,
                    type: true,
                    status: true,
                    fileUrl: true,
                    originalName: true,
                    mimeType: true,
                    fileSize: true,
                    uploadedById: true,
                    verifiedById: true,
                    expiryDate: true,
                    notes: true,
                    createdAt: true,
                    updatedAt: true,
                    student: { select: { id: true, firstName: true, lastName: true } },
                    uploadedBy: { select: { id: true, firstName: true, lastName: true } },
                },
                orderBy: { updatedAt: "desc" },
                skip,
                take: pageSize,
            }),
            prisma.document.count({ where: fallbackWhere }),
        ]);
        documents = fallbackDocs.map((d) => ({ ...d, versions: [] }));
        total = fallbackTotal;
    }

    return {
        documents,
        pagination: { page: pageNum, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
};

// ─── DOWNLOAD ────────────────────────────────────────────────────────────────
const downloadDocument = async (id, user) => {
    if (!id || typeof id !== "string") {
        throw AppError.badRequest("Invalid document ID.", "INVALID_DOCUMENT_ID");
    }

    const doc = await findDocumentWithAuthz(id);
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");

    checkDocumentAccess(doc, user);

    const encryptedBuffer = await readFile(doc.fileUrl);
    const decryptedBuffer = decrypt(encryptedBuffer);

    return {
        buffer: decryptedBuffer,
        originalName: doc.originalName || "document",
        mimeType: doc.mimeType || "application/octet-stream",
    };
};

// ─── VERIFY / REJECT ──────────────────────────────────────────────────────────
const verifyDocument = async (id, { status, notes }, verifiedById, user = null) => {
    const doc = await findDocumentWithAuthz(id);
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");
    if (user) {
        checkDocumentAccess(doc, user);
    }
    if (doc.student && doc.student.isActive === false) {
        throw AppError.badRequest(
            "Cannot verify documents for a student in Trash. Please restore the student first.",
            "STUDENT_IN_TRASH"
        );
    }

    const normalizedStatus = status.toUpperCase();
    let updated;
    try {
        updated = await prisma.document.update({
            where: { id },
            data: {
                status: normalizedStatus,
                verifiedById,
                notes: notes?.trim() || doc.notes,
            },
        });
    } catch (err) {
        if (!isMissingSchemaFeatureError(err)) throw err;
        if (!LEGACY_DOCUMENT_STATUSES.has(normalizedStatus)) {
            throw new AppError(
                `Document status "${normalizedStatus}" requires the document versioning schema migration (20261025_add_document_versioning_and_review).`,
                503,
                "SCHEMA_MIGRATION_REQUIRED"
            );
        }
        updated = await prisma.document.update({
            where: { id },
            data: {
                status: normalizedStatus,
                verifiedById,
                notes: notes?.trim() || doc.notes,
            },
            select: LEGACY_DOCUMENT_SCALARS,
        });
    }

    if (normalizedStatus === "VERIFIED" || normalizedStatus === "REJECTED") {
        const student = doc.student || await prisma.student.findUnique({
            where: { id: doc.studentId },
            select: { id: true, email: true, firstName: true, lastName: true },
        });
        if (student?.email) {
            const recipientName = [student.firstName, student.lastName].filter(Boolean).join(" ");
            const verdict = normalizedStatus === "VERIFIED" ? "verified" : "rejected";
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
const renameDocument = async (id, { customName }, user = null) => {
    const doc = await findDocumentWithAuthz(id);
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");
    if (user) {
        checkDocumentAccess(doc, user);
    }
    if (doc.student && doc.student.isActive === false) {
        throw AppError.badRequest(
            "Cannot rename documents for a student in Trash. Please restore the student first.",
            "STUDENT_IN_TRASH"
        );
    }

    try {
        return await prisma.document.update({
            where: { id },
            data: { customName: customName?.trim() || null },
        });
    } catch (err) {
        if (isMissingSchemaFeatureError(err)) {
            throw new AppError(
                "Renaming documents (customName) requires the document versioning schema migration (20261025_add_document_versioning_and_review).",
                503,
                "SCHEMA_MIGRATION_REQUIRED"
            );
        }
        throw err;
    }
};

// ─── UPDATE METADATA ──────────────────────────────────────────────────────────
const updateDocument = async (id, data, user = null) => {
    const doc = await findDocumentWithAuthz(id);
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");
    if (user) {
        checkDocumentAccess(doc, user);
    }
    if (doc.student && doc.student.isActive === false) {
        throw AppError.badRequest(
            "Cannot update documents for a student in Trash. Please restore the student first.",
            "STUDENT_IN_TRASH"
        );
    }

    const update = {};
    if (data.notes !== undefined) update.notes = data.notes?.trim() || null;
    if (data.expiryDate !== undefined) update.expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
    if (data.type !== undefined) update.type = data.type.toUpperCase();
    if (data.category !== undefined) update.category = data.category.toUpperCase();
    if (data.customName !== undefined) update.customName = data.customName?.trim() || null;

    try {
        return await prisma.document.update({ where: { id }, data: update });
    } catch (err) {
        if (!isMissingSchemaFeatureError(err)) throw err;
        if (data.customName !== undefined) {
            throw new AppError(
                "Updating custom document name (customName) requires the document versioning schema migration (20261025_add_document_versioning_and_review).",
                503,
                "SCHEMA_MIGRATION_REQUIRED"
            );
        }
        const legacyUpdate = {};
        if (data.notes !== undefined) legacyUpdate.notes = data.notes?.trim() || null;
        if (data.expiryDate !== undefined) legacyUpdate.expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
        if (data.type !== undefined) {
            const requestedType = data.type.toUpperCase();
            if (!LEGACY_DOCUMENT_TYPES.has(requestedType)) {
                throw new AppError(
                    `Document type "${requestedType}" requires the document versioning schema migration (20261025_add_document_versioning_and_review).`,
                    503,
                    "SCHEMA_MIGRATION_REQUIRED"
                );
            }
            legacyUpdate.type = requestedType;
        }
        if (Object.keys(legacyUpdate).length === 0) {
            throw new AppError(
                "Updating document category requires the document versioning schema migration (20261025_add_document_versioning_and_review).",
                503,
                "SCHEMA_MIGRATION_REQUIRED"
            );
        }
        return prisma.document.update({
            where: { id },
            data: legacyUpdate,
            select: LEGACY_DOCUMENT_SCALARS,
        });
    }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
const deleteDocument = async (id, user = null) => {
    if (!user) {
        throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }
    if (user.role !== "SUPER_ADMIN" && user.role !== "BRANCH_ADMIN") {
        throw AppError.forbidden("Only administrators can delete documents.", "FORBIDDEN");
    }

    let doc;
    try {
        doc = await prisma.document.findUnique({
            where: { id },
            include: {
                student: { select: DOC_STUDENT_AUTHZ_SELECT },
                versions: true,
            },
        });
    } catch (err) {
        if (!isMissingSchemaFeatureError(err)) throw err;
        doc = await prisma.document.findUnique({
            where: { id },
            select: {
                ...LEGACY_DOCUMENT_SCALARS,
                student: { select: DOC_STUDENT_AUTHZ_SELECT },
            },
        });
        if (doc) doc.versions = [];
    }
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");

    checkDocumentAccess(doc, user);

    if (doc.student && doc.student.isActive === false) {
        throw AppError.badRequest(
            "Cannot delete documents belonging to a student in Trash.",
            "STUDENT_IN_TRASH"
        );
    }

    // Protect verified documents and documents with version history from permanent destruction
    const versionCount = Array.isArray(doc.versions) ? doc.versions.length : 0;
    if (doc.status === "VERIFIED" || (doc.currentVersion && doc.currentVersion > 1) || versionCount > 1) {
        throw AppError.conflict(
            "Verified documents and documents with multiple versions cannot be permanently deleted. Use Replace Document to upload a new version while preserving audit history.",
            "DOCUMENT_RETENTION_PROTECTED"
        );
    }

    // Preserve encrypted files on disk to prevent irrecoverable client file loss until a soft-delete/retention archival workflow is authorized
    try {
        await prisma.document.delete({ where: { id } });
    } catch (err) {
        if (!isMissingSchemaFeatureError(err)) throw err;
        await prisma.document.delete({ where: { id }, select: { id: true } });
    }
};

module.exports = {
    checkDocumentAccess,
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
