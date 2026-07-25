const { getFirebase, sendJson } = require("./_firebase");
const { getMemberSummary } = require("./_member-summary");
const { getStorySummary } = require("./_story-summary");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { ok: false, message: "지원하지 않는 요청입니다." });
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=4, stale-while-revalidate=6");

    const firebase = getFirebase();
    if (!firebase) {
      sendJson(res, 200, {
        ok: false,
        mode: "local",
        memberFavoriteCounts: {},
        storyViewCounts: {},
        storyLikeCounts: {},
      });
      return;
    }

    const [memberFavoriteCounts, storySummary] = await Promise.all([
      getMemberSummary(firebase.db),
      getStorySummary(firebase.db),
    ]);

    sendJson(res, 200, {
      ok: true,
      memberFavoriteCounts,
      storyViewCounts: storySummary.viewCounts,
      storyLikeCounts: storySummary.likeCounts,
    });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error.message });
  }
};
