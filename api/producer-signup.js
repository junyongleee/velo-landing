const {
  admin,
  cleanString,
  enforceRateLimit,
  ensureUser,
  getUserRateLimitKey,
  hashValue,
  readJson,
  recordEvent,
  sendJson,
} = require("./_firebase");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s()]{7,30}$/;
const INVALID_CONTACT_MESSAGE = "이메일 또는 전화번호 형식으로 입력해주세요.";
const DUPLICATE_MESSAGE = "이미 참여하셨습니다.";
const THANK_YOU_MESSAGE = "참여해주셔서 감사합니다. 소식이 생기면 연락드릴게요.";

function detectContactType(value) {
  if (EMAIL_PATTERN.test(value)) return "email";
  if (PHONE_PATTERN.test(value)) return "phone";
  return "";
}

function normalizeContact(contact, contactType) {
  if (contactType === "email") return contact.toLowerCase();

  let digits = contact.replace(/\D/g, "");
  if (digits.startsWith("0082")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("82")) digits = `0${digits.slice(2)}`;
  return digits;
}

function isValidNormalizedContact(normalizedContact, contactType) {
  if (contactType === "email") return EMAIL_PATTERN.test(normalizedContact);
  return /^[0-9]{7,15}$/.test(normalizedContact);
}

function getContactDocId(contactType, normalizedContact) {
  return hashValue(`${contactType}:${normalizedContact}`).slice(0, 48);
}

async function getSignupCount(db) {
  const statsSnapshot = await db.collection("stats").doc("producer_signup_count").get();
  return statsSnapshot.exists ? statsSnapshot.data().count || 0 : 0;
}

module.exports = async function handler(req, res) {
  try {
    const { userId, firebase } = await ensureUser(req, res);
    if (!firebase) {
      sendJson(res, 200, { ok: false, mode: "local", count: 0, alreadyJoined: false });
      return;
    }

    const { db } = firebase;

    if (req.method === "GET") {
      const [count, existing] = await Promise.all([
        getSignupCount(db),
        db.collection("producer_signups").doc(userId).get(),
      ]);
      sendJson(res, 200, {
        ok: true,
        count,
        alreadyJoined: existing.exists,
        maxUnlockedEpisode: existing.exists ? 7 : null,
        message: existing.exists ? DUPLICATE_MESSAGE : "",
      });
      return;
    }

    if (req.method === "POST") {
      await enforceRateLimit(db, getUserRateLimitKey(req, userId, "producer_signup"), 5, 10 * 60 * 1000);

      const payload = await readJson(req);
      const contact = cleanString(payload.contact, 120);
      const contactType = detectContactType(contact);
      const normalizedContact = contactType ? normalizeContact(contact, contactType) : "";
      if (!contactType || !isValidNormalizedContact(normalizedContact, contactType)) {
        sendJson(res, 400, { ok: false, message: INVALID_CONTACT_MESSAGE });
        return;
      }

      const signupRef = db.collection("producer_signups").doc(userId);
      const contactRef = db.collection("producer_signup_contacts").doc(getContactDocId(contactType, normalizedContact));
      const statsRef = db.collection("stats").doc("producer_signup_count");
      const legacyContactQuery = db.collection("producer_signups")
        .where("contactType", "==", contactType)
        .limit(500);

      const result = await db.runTransaction(async (transaction) => {
        const [signupSnapshot, contactSnapshot, statsSnapshot, legacyContactSnapshot] = await Promise.all([
          transaction.get(signupRef),
          transaction.get(contactRef),
          transaction.get(statsRef),
          transaction.get(legacyContactQuery),
        ]);
        const currentCount = statsSnapshot.exists ? statsSnapshot.data().count || 0 : 0;

        if (signupSnapshot.exists) {
          return {
            count: currentCount,
            duplicate: true,
            isNewSignup: false,
            reason: "same_user",
          };
        }

        if (contactSnapshot.exists) {
          return {
            count: currentCount,
            duplicate: true,
            isNewSignup: false,
            reason: "same_contact",
          };
        }

        const legacyDuplicate = legacyContactSnapshot.docs.find((doc) => {
          const data = doc.data();
          return normalizeContact(String(data.contact || ""), contactType) === normalizedContact;
        });
        if (legacyDuplicate) {
          transaction.set(contactRef, {
            userId: legacyDuplicate.id,
            contactType,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            migratedFromLegacy: true,
          });
          return {
            count: currentCount,
            duplicate: true,
            isNewSignup: false,
            reason: "legacy_same_contact",
          };
        }

        const nextCount = currentCount + 1;
        const now = admin.firestore.FieldValue.serverTimestamp();
        transaction.set(signupRef, {
          userId,
          contact,
          contactType,
          contactHash: contactRef.id,
          createdAt: now,
          updatedAt: now,
        });
        transaction.set(contactRef, {
          userId,
          contactType,
          createdAt: now,
        });
        transaction.set(statsRef, {
          count: nextCount,
          updatedAt: now,
        }, { merge: true });

        return {
          count: nextCount,
          duplicate: false,
          isNewSignup: true,
          reason: "",
        };
      });

      await recordEvent(db, userId, result.duplicate ? "producer_signup_duplicate" : "producer_signup", "producer_signup", userId, {
        contactType,
        duplicate: result.duplicate,
        duplicateReason: result.reason,
        isNewSignup: result.isNewSignup,
      });

      await db.collection("story_unlocks").doc(`${userId}_7`).set({
        userId,
        episodeNumber: 7,
        unlockReason: "mvp_test_contact",
        sourcePostId: "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await db.collection("users").doc(userId).set({
        storyUnlock: {
          hasMvpUnlock: true,
          maxUnlockedEpisode: 7,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      }, { merge: true });

      sendJson(res, 200, {
        ok: true,
        count: result.count,
        alreadyJoined: true,
        duplicate: result.duplicate,
        isNewSignup: result.isNewSignup,
        maxUnlockedEpisode: 7,
        message: result.duplicate ? DUPLICATE_MESSAGE : THANK_YOU_MESSAGE,
      });
      return;
    }

    sendJson(res, 405, { ok: false, message: "지원하지 않는 요청입니다." });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, message: error.message });
  }
};
