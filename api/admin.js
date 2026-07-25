const {
  admin,
  cleanString,
  ensureUser,
  isAdminRequest,
  readJson,
  recordEvent,
  sendJson,
} = require("./_firebase");

async function addModerationAction(db, adminUserId, actionType, postId, targetUserId, reason) {
  await db.collection("moderation_actions").add({
    adminUserId,
    actionType,
    postId,
    targetUserId,
    reason,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

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

    const payload = await readJson(req);
    if (!isAdminRequest(req, payload)) {
      sendJson(res, 401, { ok: false, message: "관리자 권한이 필요합니다." });
      return;
    }

    const { db } = firebase;
    const action = cleanString(payload.action, 40);
    const postId = cleanString(payload.postId, 120);
    const reason = cleanString(payload.reason, 300) || "관리자 조치";
    if (!postId) {
      sendJson(res, 400, { ok: false, message: "관리할 글 ID가 필요합니다." });
      return;
    }

    const postRef = db.collection("posts").doc(postId);
    const post = await postRef.get();
    if (!post.exists) {
      sendJson(res, 404, { ok: false, message: "글을 찾지 못했습니다." });
      return;
    }

    const targetUserId = post.data().ownerUserId;

    if (action === "delete_post") {
      await postRef.set({
        isDeleted: true,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        deletedByAdmin: true,
        moderationReason: reason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await addModerationAction(db, userId, action, postId, targetUserId, reason);
      await recordEvent(db, userId, "admin_post_deleted", "post", postId, { targetUserId });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (action === "block_user") {
      await db.collection("user_blocks").doc(targetUserId).set({
        userId: targetUserId,
        active: true,
        reason,
        sourcePostId: postId,
        blockedByAdminUserId: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      if (payload.hideExistingPosts !== false) {
        const posts = await db.collection("posts")
          .where("ownerUserId", "==", targetUserId)
          .where("isDeleted", "==", false)
          .limit(100)
          .get();
        const batch = db.batch();
        posts.docs.forEach((doc) => batch.set(doc.ref, {
          isDeleted: true,
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
          deletedByAdmin: true,
          moderationReason: reason,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }));
        if (!posts.empty) await batch.commit();
      }

      await addModerationAction(db, userId, action, postId, targetUserId, reason);
      await recordEvent(db, userId, "admin_user_blocked", "user", targetUserId, { sourcePostId: postId });
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 400, { ok: false, message: "알 수 없는 관리자 작업입니다." });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, message: error.message });
  }
};
