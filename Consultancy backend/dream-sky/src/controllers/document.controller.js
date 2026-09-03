const documentService = require("../services/document.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const { validateUpload, validateVerify, validateReview } = require("../validators/document.validator");

const upload = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, code: "NO_FILE", message: "No file was uploaded." });
        }
        validateUpload(req.body);
        const doc = await documentService.uploadDocument(req.file, req.body, req.user.userId);
        sendCreated(res, { message: "Document uploaded successfully.", data: doc });
    } catch (err) {
        next(err);
    }
};

const replace = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, code: "NO_FILE", message: "No file was uploaded." });
        }
        const doc = await documentService.replaceDocument(req.params.id, req.file, req.body, req.user.userId);
        sendSuccess(res, { message: "Document replaced successfully with new version.", data: doc });
    } catch (err) {
        next(err);
    }
};

const review = async (req, res, next) => {
    try {
        validateReview(req.body);
        const doc = await documentService.reviewDocument(req.params.id, req.body, req.user.userId);
        sendSuccess(res, { message: `Document review saved (${doc.status.toLowerCase()}).`, data: doc });
    } catch (err) {
        next(err);
    }
};

const getHistory = async (req, res, next) => {
    try {
        const doc = await documentService.getDocumentHistory(req.params.id);
        sendSuccess(res, { data: doc });
    } catch (err) {
        next(err);
    }
};

const listProfiles = async (req, res, next) => {
    try {
        const profiles = await documentService.listStudentProfiles(req.query);
        sendSuccess(res, { data: profiles });
    } catch (err) {
        next(err);
    }
};

const getOne = async (req, res, next) => {
    try {
        const doc = await documentService.getDocumentById(req.params.id);
        sendSuccess(res, { data: doc });
    } catch (err) {
        next(err);
    }
};

const list = async (req, res, next) => {
    try {
        const result = await documentService.listDocuments(req.query);
        sendSuccess(res, { data: result });
    } catch (err) {
        next(err);
    }
};

const download = async (req, res, next) => {
    try {
        const { buffer, originalName, mimeType } = await documentService.downloadDocument(req.params.id);
        res.set({
            "Content-Type": mimeType,
            "Content-Disposition": `attachment; filename="${originalName}"`,
            "Content-Length": buffer.length,
        });
        res.send(buffer);
    } catch (err) {
        next(err);
    }
};

const verify = async (req, res, next) => {
    try {
        validateVerify(req.body);
        const doc = await documentService.verifyDocument(req.params.id, req.body, req.user.userId);
        sendSuccess(res, { message: `Document ${doc.status.toLowerCase()}.`, data: doc });
    } catch (err) {
        next(err);
    }
};

const rename = async (req, res, next) => {
    try {
        const doc = await documentService.renameDocument(req.params.id, req.body);
        sendSuccess(res, { message: "Document renamed.", data: doc });
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        const doc = await documentService.updateDocument(req.params.id, req.body);
        sendSuccess(res, { message: "Document updated.", data: doc });
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        await documentService.deleteDocument(req.params.id);
        sendSuccess(res, { message: "Document deleted." });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    upload,
    replace,
    review,
    getHistory,
    listProfiles,
    getOne,
    list,
    download,
    verify,
    rename,
    update,
    remove,
};

