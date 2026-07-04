const {
  cleanString,
  ensureUser,
  readJson,
  recordEvent,
  sendJson,
} = require("./_firebase");

module.exports = async function handler(req, res) {
  try {
    const { userId, isNewUser, firebase } = await ensureUser(req, res);

    if (!firebase) {
      sendJson(res, 200, { ok: false, mode: "local", userId, reason: "Firebase 환경변수가 아직 설정되지 않았습니다." });
      return;
    }

    const payload = req.method === "POST" ? await readJson(req) : {};
    const pagePath = cleanString(payload.pagePath || req.headers.referer || "/", 300);

    await recordEvent(firebase.db, userId, "page_view", "page", pagePath, {
      isNewUser,
      userAgent: cleanString(req.headers["user-agent"], 300),
    });

    sendJson(res, 200, { ok: true, mode: "firebase", userId, isNewUser });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error.message });
  }
};
