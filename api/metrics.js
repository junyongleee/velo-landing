const {
  cleanString,
  ensureUser,
  isAdminRequest,
  sendJson,
  toIso,
} = require("./_firebase");

const STAT_LABELS = {
  producer_signup_count: "초기 프로듀서 참여",
  member_favorite_ria: "리아 하트",
  member_favorite_seoyun: "서윤 하트",
  member_favorite_mina: "미나 하트",
  member_favorite_hana: "하나 하트",
  member_favorite_jiwu: "지우 하트",
};

function maskContact(contact, contactType) {
  const value = String(contact || "");
  if (!value) return "";
  if (contactType === "email") {
    const [name, domain] = value.split("@");
    if (!domain) return value;
    return `${name.slice(0, 2)}***@${domain}`;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

async function getCollectionCount(collectionRef) {
  if (typeof collectionRef.count === "function") {
    const snapshot = await collectionRef.count().get();
    return snapshot.data().count || 0;
  }
  const snapshot = await collectionRef.limit(10000).get();
  return snapshot.size;
}

function readStatValue(snapshot) {
  return snapshot.exists ? snapshot.data().count || 0 : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

module.exports = async function handler(req, res) {
  try {
    const { firebase } = await ensureUser(req, res);
    if (!firebase) {
      sendJson(res, 200, { ok: false, mode: "local", message: "Firebase가 연결되지 않았습니다." });
      return;
    }

    if (!isAdminRequest(req)) {
      sendJson(res, 401, { ok: false, message: "관리자 토큰이 필요합니다." });
      return;
    }

    const { db } = firebase;
    const statsSnapshot = await db.collection("stats").get();
    const stats = {};
    statsSnapshot.docs.forEach((doc) => {
      stats[doc.id] = readStatValue(doc);
    });

    const [usersCount, signupsCount, postsCount, eventsSnapshot, signupsSnapshot, pageSessionsSnapshot] = await Promise.all([
      getCollectionCount(db.collection("users")),
      getCollectionCount(db.collection("producer_signups")),
      getCollectionCount(db.collection("posts")),
      db.collection("user_events").orderBy("createdAt", "desc").limit(500).get(),
      db.collection("producer_signups").orderBy("createdAt", "desc").limit(50).get(),
      db.collection("page_sessions").limit(10000).get(),
    ]);

    const eventCounts = {};
    const pageViews = {};
    const recentEvents = eventsSnapshot.docs.map((doc) => {
      const data = doc.data();
      eventCounts[data.eventType] = (eventCounts[data.eventType] || 0) + 1;
      if (data.eventType === "page_view") {
        pageViews[data.entityId] = (pageViews[data.entityId] || 0) + 1;
      }
      return {
        id: doc.id,
        eventType: data.eventType,
        entityType: data.entityType,
        entityId: data.entityId,
        properties: data.properties || {},
        createdAt: toIso(data.createdAt),
      };
    });

    const recentSignups = signupsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        userId: data.userId,
        contactType: data.contactType,
        contact: maskContact(data.contact, data.contactType),
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

    const story = Array.from({ length: 8 }, (_, episode) => ({
      episode,
      views: stats[`story_view_${episode}`] || 0,
      likes: stats[`story_like_${episode}`] || 0,
    }));

    const members = ["ria", "seoyun", "mina", "hana", "jiwu"].map((memberId) => ({
      memberId,
      favorites: stats[`member_favorite_${memberId}`] || 0,
    }));

    const pageEngagementMap = {};
    pageSessionsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const pagePath = cleanString(data.pagePath, 300) || "/";
      const activeDurationMs = Math.max(0, Number(data.activeDurationMs) || 0);
      if (!pageEngagementMap[pagePath]) {
        pageEngagementMap[pagePath] = {
          pagePath,
          durations: [],
          users: new Set(),
          totalActiveDurationMs: 0,
        };
      }
      const page = pageEngagementMap[pagePath];
      page.durations.push(activeDurationMs);
      if (data.userId) page.users.add(data.userId);
      page.totalActiveDurationMs += activeDurationMs;
    });

    const pageEngagement = Object.values(pageEngagementMap).map((page) => ({
      pagePath: page.pagePath,
      visits: page.durations.length,
      uniqueUsers: page.users.size,
      totalActiveDurationMs: Math.round(page.totalActiveDurationMs),
      averageActiveDurationMs: page.durations.length
        ? Math.round(page.totalActiveDurationMs / page.durations.length)
        : 0,
      medianActiveDurationMs: median(page.durations),
    })).sort((a, b) => b.visits - a.visits);

    const measuredActiveDurationMs = pageEngagement.reduce(
      (total, page) => total + page.totalActiveDurationMs,
      0
    );

    sendJson(res, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      totals: {
        users: usersCount,
        signups: signupsCount,
        posts: postsCount,
        producerSignupCount: stats.producer_signup_count || 0,
        measuredPageSessions: pageSessionsSnapshot.size,
        measuredActiveDurationMs,
      },
      stats: Object.entries(stats).map(([id, count]) => ({
        id,
        label: STAT_LABELS[id] || id,
        count,
      })),
      members,
      story,
      eventCounts,
      pageViews,
      pageEngagement,
      recentEvents,
      recentSignups,
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, message: cleanString(error.message, 500) });
  }
};
