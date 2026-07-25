const crypto = require("crypto");
const admin = require("firebase-admin");

const COOKIE_NAME = "velo_session";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function getPrivateKey() {
  return process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

function hasFirebaseConfig() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
}

function getFirebase() {
  if (!hasFirebaseConfig()) return null;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: getPrivateKey(),
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
    });
  }

  return {
    admin,
    db: admin.firestore(),
    bucket: admin.storage().bucket(),
  };
}

function getSessionSecret() {
  return process.env.VELO_SESSION_SECRET || process.env.FIREBASE_PRIVATE_KEY || "velo-local-dev-session";
}

function sign(value) {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function encodeSession(userId) {
  return `${userId}.${sign(userId)}`;
}

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((cookies, part) => {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) return cookies;
    cookies[rawName] = decodeURIComponent(rawValue.join("="));
    return cookies;
  }, {});
}

function getSessionUserId(req) {
  const cookie = parseCookies(req.headers.cookie || "")[COOKIE_NAME];
  if (!cookie) return "";

  const [userId, signature] = cookie.split(".");
  if (!userId || !signature) return "";
  return sign(userId) === signature ? userId : "";
}

function createUserId() {
  return `usr_${crypto.randomUUID().replaceAll("-", "")}`;
}

function setSessionCookie(res, userId) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(encodeSession(userId))}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; HttpOnly; Secure; SameSite=Lax`
  );
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  return req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

function hashValue(value) {
  return crypto.createHmac("sha256", getSessionSecret()).update(String(value)).digest("hex");
}

function getAdminToken(req, payload = {}) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) return authHeader.slice(7).trim();
  return req.headers["x-velo-admin-token"] || req.headers["x-admin-token"] || payload.adminToken || "";
}

function isAdminRequest(req, payload = {}) {
  const expectedToken = process.env.VELO_ADMIN_TOKEN;
  if (!expectedToken) return false;
  return getAdminToken(req, payload) === expectedToken;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8 * 1024 * 1024) {
        reject(new Error("요청 본문이 너무 큽니다."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function ensureUser(req, res, options = {}) {
  let userId = getSessionUserId(req);
  const isNewUser = !userId;
  if (!userId) userId = createUserId();
  setSessionCookie(res, userId);

  const firebase = getFirebase();
  if (!firebase) return { userId, isNewUser, firebase: null };

  const shouldTouchUser = isNewUser || (
    options.touchUser !== false && String(req.url || "").startsWith("/api/session")
  );
  if (shouldTouchUser) {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const userPatch = {
      userId,
      authProvider: "signed_cookie",
      lastSeenAt: now,
    };
    if (isNewUser) userPatch.createdAt = now;
    await firebase.db.collection("users").doc(userId).set(userPatch, { merge: true });
  }

  return { userId, isNewUser, firebase };
}

async function getActiveUserBlock(db, userId) {
  const block = await db.collection("user_blocks").doc(userId).get();
  if (!block.exists) return null;
  const data = block.data();
  return data.active ? data : null;
}

async function assertUserCanWrite(db, userId) {
  const block = await getActiveUserBlock(db, userId);
  if (!block) return;
  const error = new Error("차단된 사용자입니다.");
  error.statusCode = 403;
  throw error;
}

async function enforceRateLimit(db, key, limit, windowMs) {
  const nowMs = Date.now();
  const resetAtMs = nowMs + windowMs;
  const docId = hashValue(key).slice(0, 48);
  const ref = db.collection("rate_limits").doc(docId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : {};
    const currentResetAt = data.resetAt?.toMillis ? data.resetAt.toMillis() : 0;
    const isFreshWindow = currentResetAt > nowMs;
    const currentCount = isFreshWindow ? data.count || 0 : 0;

    if (currentCount >= limit) {
      const error = new Error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
      error.statusCode = 429;
      error.retryAfterSeconds = Math.max(1, Math.ceil((currentResetAt - nowMs) / 1000));
      throw error;
    }

    transaction.set(ref, {
      keyHash: docId,
      count: currentCount + 1,
      limit,
      resetAt: admin.firestore.Timestamp.fromMillis(isFreshWindow ? currentResetAt : resetAtMs),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

function getUserRateLimitKey(req, userId, scope) {
  return `${scope}:${userId}:${hashValue(getClientIp(req)).slice(0, 16)}`;
}

function toIso(value) {
  if (!value) return new Date().toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function cleanString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function categoryToId(category) {
  const value = cleanString(category, 30);
  const known = {
    자유: "free",
    감상글: "review",
    팬아트: "fanart",
    "세계관 해석": "theory",
    "테스트 후기": "test",
  };
  return known[value] || "free";
}

const CATEGORY_LABELS = {
  free: "자유",
  review: "감상글",
  fanart: "팬아트",
  theory: "세계관 해석",
  test: "테스트 후기",
};

async function recordEvent(db, userId, eventType, entityType, entityId, properties = {}) {
  await db.collection("user_events").add({
    userId,
    eventType,
    entityType,
    entityId,
    properties,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function syncStoryUnlocks(db, userId, sourcePostId = "") {
  const reviewSnapshot = await db.collection("posts")
    .where("ownerUserId", "==", userId)
    .get();

  const reviewCount = reviewSnapshot.docs.filter((doc) => {
    const data = doc.data();
    return data.categoryId === "review" && data.isDeleted === false;
  }).length;
  const unlocks = [];
  if (reviewCount >= 1) unlocks.push(6);

  const [savedUnlockSnapshot, producerSignup] = await Promise.all([
    db.collection("story_unlocks")
      .where("userId", "==", userId)
      .get(),
    db.collection("producer_signups").doc(userId).get(),
  ]);
  const hasMvpUnlock = producerSignup.exists || savedUnlockSnapshot.docs.some((doc) => {
    const data = doc.data();
    return Number(data.episodeNumber || 0) === 7 && data.unlockReason !== "review_post";
  });
  const savedMaxUnlockedEpisode = savedUnlockSnapshot.docs.reduce((maxEpisode, doc) => {
    const data = doc.data();
    const episodeNumber = Number(data.episodeNumber || 0);
    if (episodeNumber === 7 && !hasMvpUnlock) return maxEpisode;
    return Math.max(maxEpisode, episodeNumber);
  }, 5);

  await Promise.all(unlocks.map((episodeNumber) => db
    .collection("story_unlocks")
    .doc(`${userId}_${episodeNumber}`)
    .set({
      userId,
      episodeNumber,
      unlockReason: "review_post",
      sourcePostId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })));

  const reviewUnlockedEpisode = reviewCount >= 1 ? 6 : 5;
  const mvpUnlockedEpisode = hasMvpUnlock ? 7 : 5;
  const unlockState = {
    reviewCount,
    hasMvpUnlock,
    maxUnlockedEpisode: Math.min(7, Math.max(savedMaxUnlockedEpisode, reviewUnlockedEpisode, mvpUnlockedEpisode)),
  };
  await db.collection("users").doc(userId).set({
    storyUnlock: {
      ...unlockState,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  }, { merge: true });
  return unlockState;
}

async function getCachedStoryUnlocks(db, userId) {
  const userSnapshot = await db.collection("users").doc(userId).get();
  const storyUnlock = userSnapshot.exists ? userSnapshot.data().storyUnlock : null;
  if (
    storyUnlock &&
    Number.isInteger(storyUnlock.maxUnlockedEpisode) &&
    Number.isInteger(storyUnlock.reviewCount)
  ) {
    return {
      reviewCount: storyUnlock.reviewCount,
      hasMvpUnlock: Boolean(storyUnlock.hasMvpUnlock),
      maxUnlockedEpisode: storyUnlock.maxUnlockedEpisode,
    };
  }

  return syncStoryUnlocks(db, userId);
}

module.exports = {
  CATEGORY_LABELS,
  admin,
  assertUserCanWrite,
  categoryToId,
  cleanString,
  enforceRateLimit,
  ensureUser,
  getActiveUserBlock,
  getClientIp,
  getCachedStoryUnlocks,
  getFirebase,
  getUserRateLimitKey,
  hashValue,
  isAdminRequest,
  readJson,
  recordEvent,
  sendJson,
  syncStoryUnlocks,
  toIso,
};
