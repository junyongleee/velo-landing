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

async function ensureUser(req, res) {
  let userId = getSessionUserId(req);
  const isNewUser = !userId;
  if (!userId) userId = createUserId();
  setSessionCookie(res, userId);

  const firebase = getFirebase();
  if (!firebase) return { userId, isNewUser, firebase: null };

  const now = admin.firestore.FieldValue.serverTimestamp();
  const userPatch = {
    userId,
    authProvider: "signed_cookie",
    lastSeenAt: now,
  };
  if (isNewUser) userPatch.createdAt = now;
  await firebase.db.collection("users").doc(userId).set(userPatch, { merge: true });

  return { userId, isNewUser, firebase };
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
    .where("categoryId", "==", "review")
    .where("isDeleted", "==", false)
    .get();

  const reviewCount = reviewSnapshot.size;
  const unlocks = [];
  if (reviewCount >= 1) unlocks.push(6);
  if (reviewCount >= 2) unlocks.push(7);

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

  return { reviewCount, maxUnlockedEpisode: Math.min(7, 5 + unlocks.length) };
}

module.exports = {
  CATEGORY_LABELS,
  admin,
  categoryToId,
  cleanString,
  ensureUser,
  getFirebase,
  readJson,
  recordEvent,
  sendJson,
  syncStoryUnlocks,
  toIso,
};
