const {
  ensureUser,
  getCachedStoryUnlocks,
  sendJson,
} = require("./_firebase");

module.exports = async function handler(req, res) {
  try {
    const { userId, firebase } = await ensureUser(req, res);
    if (!firebase) {
      sendJson(res, 200, { ok: false, mode: "local", maxUnlockedEpisode: null });
      return;
    }

    const unlockState = await getCachedStoryUnlocks(firebase.db, userId);
    sendJson(res, 200, { ok: true, userId, ...unlockState });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error.message });
  }
};
