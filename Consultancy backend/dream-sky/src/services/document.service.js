const sharp = require("sharp");
const prisma = require("../prisma");
const AppError = require("../utils/apiError");
const { encrypt, decrypt } = require("../utils/encryption.util");
const { saveFile, readFile, deleteFile } = require("../utils/storage.util");
const { sendNotificationEmail } = require("./email.service");

// ─── Image compression ───────────────────────────────────────────────────────
const compressImage = async (buffer, mimetype) => {
    let pipeline = sharp(buffer).rotate(); // auto-rotate based on EXIF

    if (mimetype === "image/png") {
        pipeline = pipeline.png({ quality: 85 });
    } else {
        pipeline = pipeline.jpeg({ quality: 82 });
    }

    // Resize if longest side > 2500px
    const metadata = await sharp(buffer).metadata();
    const longest = Math.max(metadata.width || 0, metadata.height || 0);
    if (longest > 2500) {
        pipeline = pipeline.resize({ width: 2500, height: 2500, fit: "inside", withoutEnlargement: true });
    }

    return pipeline.toBuffer();
};

// ─── UPLOAD ───────────────────────────────────────────────────────────────────
const uploadDocument = async (file, data, uploadedById) => {
    // Verify student exists
    const student = await prisma.student.findUnique({ where: { id: data.studentId }, select: { id: true } });
    if (!student) throw AppError.notFound("Student not found.", "STUDENT_NOT_FOUND");

    // Compress images, leave PDFs as-is
    const isImage = file.mimetype.startsWith("image/");
    let processedBuffer = file.buffer;
    if (isImage) {
        processedBuffer = await compressImage(file.buffer, file.mimetype);
    }

    // Encrypt
    const encryptedBuffer = encrypt(processedBuffer);

    // Store file
    const relativePath = `students/${data.studentId}/${Date.now()}.enc`;
    await saveFile(relativePath, encryptedBuffer);

    // Save metadata
    return prisma.document.create({
        data: {
            studentId: data.studentId,
            type: data.type,
            fileUrl: relativePath,
            originalName: file.originalname,
            mimeType: file.mimetype,
            fileSize: processedBuffer.length,
            uploadedById,
            expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
            notes: data.notes?.trim() || null,
        },
    });
};

// ─── GET ONE ──────────────────────────────────────────────────────────────────
const getDocumentById = async (id) => {
    const doc = await prisma.document.findUnique({
        where: { id },
        include: {
            student: { select: { id: true, firstName: true, lastName: true } },
            uploadedBy: { select: { id: true, firstName: true, lastName: true } },
            verifiedBy: { select: { id: true, firstName: true, lastName: true } },
        },
    });
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");
    return doc;
};

// ─── LIST / FILTER ────────────────────────────────────────────────────────────
const listDocuments = async (query) => {
    const { studentId, type, status, page, limit } = query;
    const where = {};

    if (studentId) where.studentId = studentId;
    if (type) where.type = type;
    if (status) where.status = status;

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const skip = (pageNum - 1) * pageSize;

    const [documents, total] = await Promise.all([
        prisma.document.findMany({
            where,
            include: {
                student: { select: { id: true, firstName: true, lastName: true } },
                uploadedBy: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { createdAt: "desc" },
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

// ─── DOWNLOAD (decrypt + return buffer) ───────────────────────────────────────
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
const verifyDocument = async (id, { status }, verifiedById) => {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");

    const updated = await prisma.document.update({
        where: { id },
        data: { status, verifiedById },
    });

    // Email the student when a document is verified or rejected
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
                body: `${recipientName ? `Hi ${recipientName},\n\n` : ""}Your document "${doc.originalName ?? doc.type}" has been ${verdict}.\n\nDreamSky Education Consultancy`,
            }).catch(() => {});
        }
    }

    return updated;
};

// ─── UPDATE METADATA ──────────────────────────────────────────────────────────
const updateDocument = async (id, data) => {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");

    const update = {};
    if (data.notes !== undefined) update.notes = data.notes?.trim() || null;
    if (data.expiryDate !== undefined) update.expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
    if (data.type !== undefined) update.type = data.type;

    return prisma.document.update({ where: { id }, data: update });
};

// ─── DELETE (file + metadata) ─────────────────────────────────────────────────
const deleteDocument = async (id) => {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw AppError.notFound("Document not found.", "DOCUMENT_NOT_FOUND");

    await deleteFile(doc.fileUrl);
    await prisma.document.delete({ where: { id } });
};

module.exports = {
    uploadDocument,
    getDocumentById,
    listDocuments,
    downloadDocument,
    verifyDocument,
    updateDocument,
    deleteDocument,
};
