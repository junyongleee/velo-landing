const {
  admin,
  ensureUser,
  readJson,
  recordEvent,
  sendJson,
} = require("./_firebase");
const { EPISODES, getStorySummary, setStorySummaryCount } = require("./_story-summary");

module.exports = async function handler(req, res) {
  try {
    const { userId, firebase } = await ensureUser(req, res);
    if (!firebase) {
      sendJson(res, 200, { ok: false, mode: "local", likedEpisodes: [], counts: {} });
      return;
    }

    const { db } = firebase;

    if (req.method === "GET") {
      const [storySummary, likedSnapshot] = await Promise.all([
        getStorySummary(db),
        db.collection("story_likes")
          .where("userId", "==", userId)
          .get(),
      ]);

      sendJson(res, 200, {
        ok: true,
        counts: storySummary.likeCounts,
        likedEpisodes: likedSnapshot.docs
          .filter((doc) => doc.data().active === true)
          .map((doc) => doc.data().episodeNumber),
      });
      return;
    }

    if (req.method === "POST") {
      const payload = await readJson(req);
      const episode = Number(payload.episode);
      if (!EPISODES.includes(episode)) {
        sendJson(res, 400, { ok: false, message: "알 수 없는 회차입니다." });
        return;
      }

      const active = Boolean(payload.active);
      const likeRef = db.collection("story_likes").doc(`${userId}_${episode}`);
      const statsRef = db.collection("stats").doc(`story_like_${episode}`);

      const { count, changed } = await db.runTransaction(async (transaction) => {
        const [likeSnapshot, statsSnapshot] = await Promise.all([
          transaction.get(likeRef),
          transaction.get(statsRef),
        ]);
        const wasActive = likeSnapshot.exists && Boolean(likeSnapshot.data().active);
        const currentCount = statsSnapshot.exists ? statsSnapshot.data().count || 0 : 0;
        let nextCount = currentCount;
        if (active && !wasActive) nextCount = currentCount + 1;
        if (!active && wasActive) nextCount = Math.max(0, currentCount - 1);

        const likePatch = {
          userId,
          episodeNumber: episode,
          active,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (!likeSnapshot.exists) likePatch.createdAt = admin.firestore.FieldValue.serverTimestamp();
        transaction.set(likeRef, likePatch, { merge: true });

        if (nextCount !== currentCount) {
          transaction.set(statsRef, {
            count: nextCount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          setStorySummaryCount(transaction, db, "like", episode, nextCount);
        }

        return { count: nextCount, changed: active !== wasActive };
      });

      if (changed) {
        await recordEvent(db, userId, active ? "story_liked" : "story_unliked", "story_episode", String(episode));
      }
      sendJson(res, 200, { ok: true, episode, active, count });
      return;
    }

    sendJson(res, 405, { ok: false, message: "지원하지 않는 요청입니다." });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error.message });
  }
};
