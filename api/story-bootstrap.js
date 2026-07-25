const {
  ensureUser,
  getCachedStoryUnlocks,
  sendJson,
} = require("./_firebase");
const { getStorySummary } = require("./_story-summary");

module.exports = async function handler(req, res) {
  try {
    const { userId, firebase } = await ensureUser(req, res);
    if (!firebase) {
      sendJson(res, 200, {
        ok: false,
        mode: "local",
        maxUnlockedEpisode: null,
        reviewCount: 0,
        hasMvpUnlock: false,
        viewCounts: {},
        likeCounts: {},
        likedEpisodes: [],
      });
      return;
    }

    const { db } = firebase;
    const [unlockState, storySummary, likedSnapshot] = await Promise.all([
      getCachedStoryUnlocks(db, userId),
      getStorySummary(db),
      db.collection("story_likes")
        .where("userId", "==", userId)
        .get(),
    ]);

    sendJson(res, 200, {
      ok: true,
      userId,
      ...unlockState,
      viewCounts: storySummary.viewCounts,
      likeCounts: storySummary.likeCounts,
      likedEpisodes: likedSnapshot.docs
        .filter((doc) => doc.data().active === true)
        .map((doc) => doc.data().episodeNumber),
    });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error.message });
  }
};
