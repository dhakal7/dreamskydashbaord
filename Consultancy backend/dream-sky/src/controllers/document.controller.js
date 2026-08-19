const documentService = require("../services/document.service");
const { sendSuccess, sendCreated } = require("../utils/response.util");
const { validateUpload, validateVerify, validateReview } = require("../validators/document.validator");

const upload = async (req, res) => {
    validateUpload(req.body);
    const doc = await documentService.uploadDocument(req.file, req.body, req.user.userId);
    sendCreated(res, { message: "Document uploaded successfully.", data: doc });
};

const replace = async (req, res) => {
    const doc = await documentService.replaceDocument(req.params.id, req.file, req.body, req.user.userId);
    sendSuccess(res, { message: "Document replaced successfully with new version.", data: doc });
};

const review = async (req, res) => {
    validateReview(req.body);
    const doc = await documentService.reviewDocument(req.params.id, req.body, req.user.userId);
    sendSuccess(res, { message: `Document review saved (${doc.status.toLowerCase()}).`, data: doc });
};

const getHistory = async (req, res) => {
    const doc = await documentService.getDocumentHistory(req.params.id);
    sendSuccess(res, { data: doc });
};

const listProfiles = async (req, res) => {
    const profiles = await documentService.listStudentProfiles(req.query);
    sendSuccess(res, { data: profiles });
};

const getOne = async (req, res) => {
    const doc = await documentService.getDocumentById(req.params.id);
    sendSuccess(res, { data: doc });
};

const list = async (req, res) => {
    const result = await documentService.listDocuments(req.query);
    sendSuccess(res, { data: result });
};

const download = async (req, res) => {
    const { buffer, originalName, mimeType } = await documentService.downloadDocument(req.params.id);
    res.set({
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${originalName}"`,
        "Content-Length": buffer.length,
    });
    res.send(buffer);
};

const verify = async (req, res) => {
    validateVerify(req.body);
    const doc = await documentService.verifyDocument(req.params.id, req.body, req.user.userId);
    sendSuccess(res, { message: `Document ${doc.status.toLowerCase()}.`, data: doc });
};

const rename = async (req, res) => {
    const doc = await documentService.renameDocument(req.params.id, req.body);
    sendSuccess(res, { message: "Document renamed.", data: doc });
};

const update = async (req, res) => {
    const doc = await documentService.updateDocument(req.params.id, req.body);
    sendSuccess(res, { message: "Document updated.", data: doc });
};

const remove = async (req, res) => {
    await documentService.deleteDocument(req.params.id);
    sendSuccess(res, { message: "Document deleted." });
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
