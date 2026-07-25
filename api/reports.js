const {
  admin,
  cleanString,
  enforceRateLimit,
  ensureUser,
  getUserRateLimitKey,
  readJson,
  recordEvent,
  sendJson,
} = require("./_firebase");

module.exports = async function handler(req, res) {
  try {
    const { userId, firebase } = await ensureUser(req, res);
    if (!firebase) {
      sendJson(res, 200, { ok: false, mode: "local", reason: "Firebase 환경변수가 아직 설정되지 않았습니다." });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, message: "지원하지 않는 요청입니다." });
      return;
    }

    const { db } = firebase;
    await enforceRateLimit(db, getUserRateLimitKey(req, userId, "post_report"), 10, 60 * 60 * 1000);

    const payload = await readJson(req);
    const postId = cleanString(payload.postId, 120);
    const reason = cleanString(payload.reason, 80) || "사용자 신고";
    const details = cleanString(payload.details, 1000);
    if (!postId) {
      sendJson(res, 400, { ok: false, message: "신고할 글 ID가 필요합니다." });
      return;
    }

    const postRef = db.collection("posts").doc(postId);
    const post = await postRef.get();
    if (!post.exists || post.data().isDeleted) {
      sendJson(res, 404, { ok: false, message: "신고할 글을 찾지 못했습니다." });
      return;
    }

    if (post.data().ownerUserId === userId) {
      sendJson(res, 400, { ok: false, message: "본인 글은 신고할 수 없습니다." });
      return;
    }

    const reportRef = db.collection("post_reports").doc(`${postId}_${userId}`);
    const report = await reportRef.get();
    const reportPatch = {
      postId,
      reporterUserId: userId,
      postOwnerUserId: post.data().ownerUserId,
      reason,
      details,
      status: "open",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!report.exists) reportPatch.createdAt = admin.firestore.FieldValue.serverTimestamp();
    await reportRef.set(reportPatch, { merge: true });

    const openReports = await db.collection("post_reports")
      .where("postId", "==", postId)
      .where("status", "==", "open")
      .get();

    await postRef.set({
      reportCount: openReports.size,
      moderationStatus: openReports.size >= 3 ? "reported" : "normal",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await recordEvent(db, userId, "post_reported", "post", postId, { reason });
    sendJson(res, 200, { ok: true, reportCount: openReports.size });
  } catch (error) {
    if (error.statusCode === 429 && error.retryAfterSeconds) {
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
    }
    sendJson(res, error.statusCode || 500, { ok: false, message: error.message });
  }
};
