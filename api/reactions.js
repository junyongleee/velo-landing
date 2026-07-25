const {
  admin,
  cleanString,
  ensureUser,
  readJson,
  recordEvent,
  sendJson,
} = require("./_firebase");
const {
  MEMBERS,
  getMemberSummary,
  setMemberSummaryCount,
} = require("./_member-summary");

const MEMBER_SET = new Set(MEMBERS);

module.exports = async function handler(req, res) {
  try {
    const { userId, firebase } = await ensureUser(req, res);
    if (!firebase) {
      sendJson(res, 200, { ok: false, mode: "local", favorites: [], counts: {} });
      return;
    }

    const { db } = firebase;

    if (req.method === "GET") {
      const [snapshot, counts] = await Promise.all([
        db.collection("user_member_reactions")
          .where("userId", "==", userId)
          .where("reactionType", "==", "favorite")
          .where("active", "==", true)
          .get(),
        getMemberSummary(db),
      ]);

      sendJson(res, 200, {
        ok: true,
        favorites: snapshot.docs.map((doc) => doc.data().memberId),
        counts,
      });
      return;
    }

    if (req.method === "POST" || req.method === "PUT") {
      const payload = await readJson(req);
      const memberId = cleanString(payload.memberId, 30);
      if (!MEMBER_SET.has(memberId)) {
        sendJson(res, 400, { ok: false, message: "알 수 없는 멤버입니다." });
        return;
      }

      const active = Boolean(payload.active);
      const reactionRef = db.collection("user_member_reactions").doc(`${userId}_${memberId}_favorite`);
      const statsRef = db.collection("stats").doc(`member_favorite_${memberId}`);

      const { count, changed } = await db.runTransaction(async (transaction) => {
        const [reactionSnapshot, statsSnapshot] = await Promise.all([
          transaction.get(reactionRef),
          transaction.get(statsRef),
        ]);
        const wasActive = reactionSnapshot.exists && Boolean(reactionSnapshot.data().active);
        const currentCount = statsSnapshot.exists ? statsSnapshot.data().count || 0 : 0;
        let nextCount = currentCount;
        if (active && !wasActive) nextCount = currentCount + 1;
        if (!active && wasActive) nextCount = Math.max(0, currentCount - 1);

        const reactionPatch = {
          userId,
          memberId,
          reactionType: "favorite",
          active,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (!reactionSnapshot.exists) reactionPatch.createdAt = admin.firestore.FieldValue.serverTimestamp();
        transaction.set(reactionRef, reactionPatch, { merge: true });

        if (nextCount !== currentCount) {
          transaction.set(statsRef, {
            count: nextCount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          setMemberSummaryCount(transaction, db, memberId, nextCount);
        }

        return { count: nextCount, changed: active !== wasActive };
      });

      if (changed) {
        await recordEvent(db, userId, active ? "member_favorited" : "member_unfavorited", "member", memberId);
      }
      sendJson(res, 200, { ok: true, memberId, active, count });
      return;
    }

    sendJson(res, 405, { ok: false, message: "지원하지 않는 요청입니다." });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error.message });
  }
};
