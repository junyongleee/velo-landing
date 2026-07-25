(function () {
  const LOCAL_KEY = "veloLocalStats";
  const MEMBER_FAVORITES_KEY = "veloMemberFavorites";
  const MEMBER_FAVORITE_COUNTS_KEY = "veloMemberFavoriteCounts";
  const STORY_VIEW_COUNTS_KEY = "veloStoryViewCounts";
  const STORY_LIKE_COUNTS_KEY = "veloStoryLikeCounts";
  const STORY_LIKED_EPISODES_KEY = "veloStoryLikedEpisodes";
  const LIVE_STATS_INTERVAL_MS = 10000;
  const ENGAGEMENT_FLUSH_INTERVAL_MS = 30000;
  const MEMBERS = ["ria", "seoyun", "mina", "hana", "jiwu"];
  const EPISODES = [0, 1, 2, 3, 4, 5, 6, 7];
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_PATTERN = /^[0-9+\-\s]{7,20}$/;
  let liveStatsRequest = null;

  function defaultLocalStats() {
    return {
      producerSignupCount: 0,
      producerJoined: false,
      memberFavorites: [],
      memberFavoriteCounts: Object.fromEntries(MEMBERS.map((id) => [id, 0])),
      storyViewCounts: Object.fromEntries(EPISODES.map((ep) => [ep, 0])),
      storyLikeCounts: Object.fromEntries(EPISODES.map((ep) => [ep, 0])),
      storyLikedEpisodes: [],
    };
  }

  function readLocalStats() {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
      return { ...defaultLocalStats(), ...(saved || {}) };
    } catch {
      return defaultLocalStats();
    }
  }

  function writeLocalStats(stats) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(stats));
  }

  function readStoredJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value && typeof value === "object" ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function isValidContact(value) {
    return EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value);
  }

  async function request(path, options = {}) {
    const {
      headers = {},
      timeoutMs = 8000,
      ...fetchOptions
    } = options;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(path, {
        credentials: "include",
        signal: controller.signal,
        ...fetchOptions,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, message: payload.message || "요청에 실패했습니다." };
      return payload;
    } catch {
      return { ok: false, mode: "local", message: "백엔드에 연결할 수 없어 로컬 저장소를 사용합니다." };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function getLiveStats() {
    if (liveStatsRequest) return liveStatsRequest;
    liveStatsRequest = request("/api/live-stats", {
      credentials: "omit",
      timeoutMs: 3500,
    }).finally(() => {
      liveStatsRequest = null;
    });
    return liveStatsRequest;
  }

  function subscribeLiveStats(listener, options = {}) {
    if (typeof listener !== "function") return () => {};
    const intervalMs = Math.max(5000, Number(options.intervalMs || LIVE_STATS_INTERVAL_MS));
    let stopped = false;
    let timer = null;
    let lastRequestedAt = Date.now();

    const schedule = (delay = intervalMs) => {
      if (stopped) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(poll, delay);
    };

    const poll = async () => {
      timer = null;
      if (stopped) return;
      if (document.visibilityState !== "visible" || navigator.onLine === false) {
        schedule();
        return;
      }

      lastRequestedAt = Date.now();
      try {
        const response = await getLiveStats();
        if (!stopped && response?.ok) listener(response);
      } finally {
        schedule();
      }
    };

    const refreshIfStale = () => {
      if (stopped || document.visibilityState !== "visible" || navigator.onLine === false) return;
      if (Date.now() - lastRequestedAt < intervalMs) return;
      if (timer) window.clearTimeout(timer);
      timer = null;
      poll();
    };

    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("online", refreshIfStale);
    schedule();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("online", refreshIfStale);
    };
  }

  function trackPageView(visitId = "") {
    return request("/api/session", {
      method: "POST",
      body: JSON.stringify({
        pagePath: `${location.pathname}${location.search}${location.hash}`,
        visitId,
      }),
    });
  }

  function createVisitId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replaceAll("-", "");
    const randomPart = Math.random().toString(36).slice(2);
    return `${Date.now().toString(36)}${randomPart}${randomPart}`.slice(0, 32);
  }

  function startPageEngagementTracking() {
    const visitId = createVisitId();
    const pagePath = `${location.pathname}${location.search}${location.hash}`;
    let activeDurationMs = 0;
    let activeStartedAt = document.visibilityState === "visible" ? performance.now() : null;
    let flushInFlight = false;
    let lastSentDurationMs = -1;

    const updateActiveDuration = () => {
      if (activeStartedAt === null) return;
      const now = performance.now();
      activeDurationMs += Math.max(0, now - activeStartedAt);
      activeStartedAt = now;
    };

    const payload = (ended = false) => ({
      action: "engagement",
      visitId,
      pagePath,
      activeDurationMs: Math.round(activeDurationMs),
      ended,
    });

    const flush = async (ended = false, useBeacon = false) => {
      updateActiveDuration();
      const roundedDurationMs = Math.round(activeDurationMs);
      if (!ended && (flushInFlight || roundedDurationMs === lastSentDurationMs)) return;
      lastSentDurationMs = roundedDurationMs;

      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/session", new Blob(
          [JSON.stringify(payload(ended))],
          { type: "application/json" }
        ));
        return;
      }

      flushInFlight = true;
      try {
        await request("/api/session", {
          method: "POST",
          timeoutMs: 5000,
          keepalive: ended,
          body: JSON.stringify(payload(ended)),
        });
      } finally {
        flushInFlight = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flush(false, true);
        activeStartedAt = null;
      } else if (activeStartedAt === null) {
        activeStartedAt = performance.now();
      }
    };

    trackPageView(visitId);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", () => flush(true, true), { once: true });
    window.setInterval(() => flush(), ENGAGEMENT_FLUSH_INTERVAL_MS);
  }

  async function getProducerSignupStatus() {
    const response = await request("/api/producer-signup");
    if (response?.ok) return response;
    const stats = readLocalStats();
    return {
      ok: true,
      mode: "local",
      count: stats.producerSignupCount,
      alreadyJoined: stats.producerJoined,
      maxUnlockedEpisode: stats.producerJoined ? 7 : null,
    };
  }

  async function submitProducerSignup(contact) {
    const value = String(contact || "").trim();
    if (!isValidContact(value)) {
      return { ok: false, message: "이메일 또는 전화번호 형식으로 입력해주세요." };
    }

    const response = await request("/api/producer-signup", {
      method: "POST",
      body: JSON.stringify({ contact: value }),
    });
    if (response?.ok) {
      if (response.isNewSignup === true) window.VeloAnalytics?.trackMvpSignup();
      return response;
    }

    const stats = readLocalStats();
    if (!stats.producerJoined) {
      stats.producerSignupCount += 1;
      stats.producerJoined = true;
    }
    writeLocalStats(stats);
    return {
      ok: true,
      mode: "local",
      count: stats.producerSignupCount,
      alreadyJoined: true,
      maxUnlockedEpisode: 7,
    };
  }

  async function getMemberFavorites() {
    const response = await request("/api/reactions");
    if (response?.ok) return response;
    const stats = readLocalStats();
    return {
      ok: true,
      mode: "local",
      favorites: readStoredJson(MEMBER_FAVORITES_KEY, stats.memberFavorites),
      counts: readStoredJson(MEMBER_FAVORITE_COUNTS_KEY, stats.memberFavoriteCounts),
    };
  }

  async function setMemberFavorite(memberId, active) {
    const response = await request("/api/reactions", {
      method: "POST",
      body: JSON.stringify({ memberId, active }),
    });
    if (response?.ok) return response;
    return { ...response, ok: false, mode: "local", retryable: true, memberId, active };
  }

  async function getStoryViewCounts() {
    const response = await request("/api/story-views", { timeoutMs: 4500 });
    if (response?.ok) return response;
    const stats = readLocalStats();
    return {
      ok: true,
      mode: "local",
      counts: readStoredJson(STORY_VIEW_COUNTS_KEY, stats.storyViewCounts),
    };
  }

  async function trackStoryView(episode, viewId) {
    const response = await request("/api/story-views", {
      method: "POST",
      body: JSON.stringify({ episode, viewId }),
    });
    if (response?.ok) return response;
    return { ...response, ok: false, mode: "local", retryable: true, episode, viewId };
  }

  async function getStoryLikes() {
    const response = await request("/api/story-likes");
    if (response?.ok) return response;
    const stats = readLocalStats();
    return {
      ok: true,
      mode: "local",
      likedEpisodes: readStoredJson(STORY_LIKED_EPISODES_KEY, stats.storyLikedEpisodes).map(Number),
      counts: readStoredJson(STORY_LIKE_COUNTS_KEY, stats.storyLikeCounts),
    };
  }

  async function setStoryLike(episode, active) {
    const response = await request("/api/story-likes", {
      method: "POST",
      body: JSON.stringify({ episode, active }),
    });
    if (response?.ok) return response;
    return { ...response, ok: false, mode: "local", retryable: true, episode, active };
  }

  window.VeloApi = {
    trackPageView,
    listPosts: () => request("/api/posts", { timeoutMs: 4500 }),
    createPost: (post) => request("/api/posts", {
      method: "POST",
      timeoutMs: 20000,
      body: JSON.stringify(post),
    }),
    updatePost: (id, post) => request(`/api/posts?id=${encodeURIComponent(id)}`, {
      method: "PUT",
      timeoutMs: 20000,
      body: JSON.stringify(post),
    }),
    deletePost: (id, password) => request(`/api/posts?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      timeoutMs: 12000,
      body: JSON.stringify({ password }),
    }),
    reportPost: (postId, report) => request("/api/reports", {
      method: "POST",
      body: JSON.stringify({ postId, ...report }),
    }),
    adminDeletePost: (postId, adminToken, reason) => request("/api/admin", {
      method: "POST",
      headers: { "X-Velo-Admin-Token": adminToken },
      body: JSON.stringify({ action: "delete_post", postId, reason }),
    }),
    adminBlockPostAuthor: (postId, adminToken, reason) => request("/api/admin", {
      method: "POST",
      headers: { "X-Velo-Admin-Token": adminToken },
      body: JSON.stringify({ action: "block_user", postId, reason, hideExistingPosts: true }),
    }),
    getUnlockState: () => request("/api/unlocks"),
    getStoryBootstrap: () => request("/api/story-bootstrap", { timeoutMs: 4500 }),
    getLiveStats,
    subscribeLiveStats,
    getMemberFavorites,
    setMemberFavorite,
    getProducerSignupStatus,
    submitProducerSignup,
    getStoryViewCounts,
    trackStoryView,
    getStoryLikes,
    setStoryLike,
  };

  startPageEngagementTracking();
})();
