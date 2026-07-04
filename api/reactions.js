const {
  admin,
  cleanString,
  ensureUser,
  readJson,
  recordEvent,
  sendJson,
} = require("./_firebase");

const MEMBERS = new Set(["ria", "seoyun", "mina", "hana", "jiwu"]);

module.exports = async function handler(req, res) {
  try {
    const { userId, firebase } = await ensureUser(req, res);
    if (!firebase) {
      sendJson(res, 200, { ok: false, mode: "local", favorites: [] });
      return;
    }

    const { db } = firebase;

    if (req.method === "GET") {
      const snapshot = await db.collection("user_member_reactions")
        .where("userId", "==", userId)
        .where("reactionType", "==", "favorite")
        .where("active", "==", true)
        .get();

      sendJson(res, 200, {
        ok: true,
        favorites: snapshot.docs.map((doc) => doc.data().memberId),
      });
      return;
    }

    if (req.method === "POST" || req.method === "PUT") {
      const payload = await readJson(req);
      const memberId = cleanString(payload.memberId, 30);
      if (!MEMBERS.has(memberId)) {
        sendJson(res, 400, { ok: false, message: "알 수 없는 멤버입니다." });
        return;
      }

      const active = Boolean(payload.active);
      const reactionRef = db.collection("user_member_reactions").doc(`${userId}_${memberId}_favorite`);
      const reaction = await reactionRef.get();
      const reactionPatch = {
        userId,
        memberId,
        reactionType: "favorite",
        active,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (!reaction.exists) reactionPatch.createdAt = admin.firestore.FieldValue.serverTimestamp();
      await reactionRef.set(reactionPatch, { merge: true });

      await recordEvent(db, userId, active ? "member_favorited" : "member_unfavorited", "member", memberId);
      sendJson(res, 200, { ok: true, memberId, active });
      return;
    }

    sendJson(res, 405, { ok: false, message: "지원하지 않는 요청입니다." });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error.message });
  }
};
