const {
  admin,
  cleanString,
  ensureUser,
  readJson,
  recordEvent,
  sendJson,
} = require("./_firebase");

module.exports = async function handler(req, res) {
  try {
    const payload = req.method === "POST" ? await readJson(req) : {};
    const isEngagementUpdate = payload.action === "engagement";
    const { userId, isNewUser, firebase } = await ensureUser(req, res, {
      touchUser: !isEngagementUpdate,
    });

    if (!firebase) {
      sendJson(res, 200, { ok: false, mode: "local", userId, reason: "Firebase 환경변수가 아직 설정되지 않았습니다." });
      return;
    }

    const pagePath = cleanString(payload.pagePath || req.headers.referer || "/", 300);
    const visitId = cleanString(payload.visitId, 80);

    if (isEngagementUpdate) {
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(visitId)) {
        sendJson(res, 400, { ok: false, message: "올바르지 않은 방문 ID입니다." });
        return;
      }

      const activeDurationMs = Math.min(
        12 * 60 * 60 * 1000,
        Math.max(0, Math.round(Number(payload.activeDurationMs) || 0))
      );
      const visitRef = firebase.db.collection("page_sessions").doc(`${userId}_${visitId}`);

      await firebase.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(visitRef);
        const previousDurationMs = snapshot.exists
          ? Math.max(0, Number(snapshot.data().activeDurationMs) || 0)
          : 0;
        const patch = {
          userId,
          visitId,
          pagePath,
          activeDurationMs: Math.max(previousDurationMs, activeDurationMs),
          lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (!snapshot.exists) patch.createdAt = admin.firestore.FieldValue.serverTimestamp();
        if (payload.ended === true) patch.endedAt = admin.firestore.FieldValue.serverTimestamp();
        transaction.set(visitRef, patch, { merge: true });
      });

      sendJson(res, 200, { ok: true, mode: "firebase" });
      return;
    }

    const writes = [recordEvent(firebase.db, userId, "page_view", "page", pagePath, {
      isNewUser,
      visitId,
      userAgent: cleanString(req.headers["user-agent"], 300),
    })];

    if (/^[a-zA-Z0-9_-]{16,80}$/.test(visitId)) {
      writes.push(firebase.db.collection("page_sessions").doc(`${userId}_${visitId}`).set({
        userId,
        visitId,
        pagePath,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }));
    }

    await Promise.all(writes);

    sendJson(res, 200, { ok: true, mode: "firebase", userId, isNewUser });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error.message });
  }
};
