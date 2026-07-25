const {
  admin,
  cleanString,
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
      sendJson(res, 200, { ok: false, mode: "local", counts: {} });
      return;
    }

    const { db } = firebase;

    if (req.method === "GET") {
      const storySummary = await getStorySummary(db);
      sendJson(res, 200, { ok: true, counts: storySummary.viewCounts });
      return;
    }

    if (req.method === "POST") {
      const payload = await readJson(req);
      const episode = Number(payload.episode);
      if (!EPISODES.includes(episode)) {
        sendJson(res, 400, { ok: false, message: "알 수 없는 회차입니다." });
        return;
      }

      const suppliedViewId = cleanString(payload.viewId, 96);
      if (suppliedViewId && !/^[A-Za-z0-9_-]+$/.test(suppliedViewId)) {
        sendJson(res, 400, { ok: false, message: "올바르지 않은 조회 식별자입니다." });
        return;
      }
      const viewId = suppliedViewId || `legacy_${episode}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const viewRef = db.collection("story_views").doc(`${userId}_${viewId}`);
      const statsRef = db.collection("stats").doc(`story_view_${episode}`);

      const { count, isNewView } = await db.runTransaction(async (transaction) => {
        const [viewSnapshot, statsSnapshot] = await Promise.all([
          transaction.get(viewRef),
          transaction.get(statsRef),
        ]);
        const currentCount = statsSnapshot.exists ? statsSnapshot.data().count || 0 : 0;
        const isNew = !viewSnapshot.exists;
        const nextCount = isNew ? currentCount + 1 : currentCount;

        if (isNew) {
          transaction.set(viewRef, {
            userId,
            viewId,
            episodeNumber: episode,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          transaction.set(statsRef, {
            count: nextCount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          setStorySummaryCount(transaction, db, "view", episode, nextCount);
        }

        return { count: nextCount, isNewView: isNew };
      });

      if (isNewView) await recordEvent(db, userId, "story_viewed", "story_episode", String(episode));
      sendJson(res, 200, { ok: true, episode, viewId, count });
      return;
    }

    sendJson(res, 405, { ok: false, message: "지원하지 않는 요청입니다." });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error.message });
  }
};
