const STORY_POSTS_KEY = "veloFanPosts";
const STORY_USER_KEY = "veloFanUserKey";
const PENDING_UNLOCK_KEY = "veloPendingUnlockEpisode";
const STORY_VIEW_COUNTS_KEY = "veloStoryViewCounts";
const STORY_LIKE_COUNTS_KEY = "veloStoryLikeCounts";
const STORY_LIKED_EPISODES_KEY = "veloStoryLikedEpisodes";
const STORY_PENDING_VIEWS_KEY = "veloPendingStoryViews";
const STORY_PENDING_LIKES_KEY = "veloPendingStoryLikes";
const STORY_MAX_UNLOCKED_EPISODE_KEY = "veloMaxUnlockedEpisode";
const STORY_PRODUCER_SIGNUP_JOINED_KEY = "veloProducerSignupJoined";
const STORY_LIKE_SYNC_DELAY_MS = 300;

const EPISODES = [
  { episode: 0, title: "자정의 오페라(미래)", sections: ["0"] },
  { episode: 1, title: "암전", sections: ["!"] },
  { episode: 2, title: "빨간 딱지", sections: ["2"] },
  { episode: 3, title: "완전히 끊어진 동아줄", sections: ["3"] },
  { episode: 4, title: "보랏빛 안개", sections: ["4"] },
  { episode: 5, title: "핏빛 협상", sections: ["5"] },
  { episode: 6, title: "어설픈 사기꾼과 정직한 절망", sections: ["6"] },
  { episode: 7, title: "오전의 빛과 미련의 매장", sections: ["7"] },
];

const SPEAKERS = [
  "무대 감독",
  "무대감독",
  "스태프 1",
  "스태프 2",
  "스태프1",
  "스태프2",
  "스태프",
  "관객 1",
  "관객 2",
  "관객1",
  "관객2",
  "P(독백)",
  "P(백업)",
  "강주희",
  "주희",
  "강주",
  "P",
  "무명",
  "리아",
  "서윤",
  "미나",
  "하나",
  "지우",
];

const SPEAKER_LABELS = {
  "무대감독": "무대 감독",
  "스태프1": "스태프 1",
  "스태프2": "스태프 2",
  "관객1": "관객 1",
  "관객2": "관객 2",
};

const episodeList = document.getElementById("episodeList");
const novelReader = document.getElementById("novelReader");
const storyViewSyncInFlight = new Set();
const storyLikeSyncStates = new Map();
const storyViewLiveProtection = new Map();
const storyLikeLiveProtection = new Map();
let episodeStructuredData = null;
const STORY_BASE_URL = "https://velo-landing-puce.vercel.app/story.html";
let prologueSections = {};
let remoteUnlockedEpisode = null;
let storyBootstrapPending = true;
let storyViewCounts = readStoryJson(STORY_VIEW_COUNTS_KEY, {});
let storyLikeCounts = readStoryJson(STORY_LIKE_COUNTS_KEY, {});
let storyLikedEpisodes = new Set(readStoryJson(STORY_LIKED_EPISODES_KEY, []).map(Number));
let confirmedStoryLikedEpisodes = null;

function formatStoryCount(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function readStoryJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
}

function escapeStoryHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setMetaContent(selector, content) {
  const element = document.querySelector(selector);
  if (element) element.setAttribute("content", content);
}

function setStoryMetadata(episode = null) {
  const canonical = document.querySelector('link[rel="canonical"]');
  const isEpisode = Boolean(episode);
  const url = isEpisode ? `${STORY_BASE_URL}?episode=${episode.episode}` : STORY_BASE_URL;
  const title = isEpisode
    ? `${episode.episode}화 ${episode.title} | V.E.L.O. 오컬트 아이돌 비주얼 노벨`
    : "V.E.L.O. 스토리 | 오컬트 아이돌 비주얼 노벨";
  const description = isEpisode
    ? `V.E.L.O. 오컬트 아이돌 비주얼 노벨 ${episode.episode}화 '${episode.title}'. 유령의 무대에서 다시 데뷔하는 다섯 아이돌의 서사를 읽어보세요.`
    : "빛을 잃은 다섯 아이돌이 유령의 무대에서 다시 데뷔하는 V.E.L.O. 오컬트 비주얼 노벨 스토리.";

  document.title = title;
  if (canonical) canonical.href = url;
  setMetaContent('meta[name="description"]', description);
  setMetaContent('meta[property="og:title"]', title);
  setMetaContent('meta[property="og:description"]', description);
  setMetaContent('meta[property="og:url"]', url);
  setMetaContent('meta[name="twitter:title"]', title);
  setMetaContent('meta[name="twitter:description"]', description);

  if (!isEpisode) {
    episodeStructuredData?.remove();
    episodeStructuredData = null;
    return;
  }

  if (!episodeStructuredData) {
    episodeStructuredData = document.createElement("script");
    episodeStructuredData.id = "episodeStructuredData";
    episodeStructuredData.type = "application/ld+json";
    document.head.appendChild(episodeStructuredData);
  }
  episodeStructuredData.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Chapter",
    "@id": `${url}#chapter`,
    url,
    name: `${episode.episode}화. ${episode.title}`,
    position: episode.episode,
    inLanguage: "ko-KR",
    isPartOf: {
      "@type": "CreativeWorkSeries",
      "@id": `${STORY_BASE_URL}#series`,
      name: "V.E.L.O. 오컬트 아이돌 비주얼 노벨",
      url: STORY_BASE_URL,
    },
    about: {
      "@id": "https://velo-landing-puce.vercel.app/#game",
    },
  });
}

function getStoryUserKey() {
  const savedKey = localStorage.getItem(STORY_USER_KEY);
  if (savedKey) return savedKey;
  const nextKey = `fan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(STORY_USER_KEY, nextKey);
  return nextKey;
}

function getReviewCount() {
  const userKey = getStoryUserKey();
  try {
    const posts = JSON.parse(localStorage.getItem(STORY_POSTS_KEY) || "[]");
    if (!Array.isArray(posts)) return 0;
    return posts.filter((post) =>
      post.ownerKey === userKey &&
      (post.category === "감상글" || post.categoryId === "review")
    ).length;
  } catch {
    return 0;
  }
}

function getUnlockedEpisode() {
  const rawSavedUnlockedEpisode = Number(localStorage.getItem(STORY_MAX_UNLOCKED_EPISODE_KEY) || 5);
  const hasLocalMvpUnlock = localStorage.getItem(STORY_PRODUCER_SIGNUP_JOINED_KEY) === "true";
  const savedUnlockedEpisode = hasLocalMvpUnlock
    ? Math.max(rawSavedUnlockedEpisode, 7)
    : rawSavedUnlockedEpisode >= 7 ? 6 : rawSavedUnlockedEpisode;
  if (Number.isInteger(remoteUnlockedEpisode)) return Math.max(remoteUnlockedEpisode, savedUnlockedEpisode);
  const reviewUnlockedEpisode = getReviewCount() >= 1 ? 6 : 5;
  return Math.min(7, Math.max(savedUnlockedEpisode, reviewUnlockedEpisode));
}

function rememberUnlockedEpisode(episodeNumber) {
  const current = Number(localStorage.getItem(STORY_MAX_UNLOCKED_EPISODE_KEY) || 5);
  localStorage.setItem(STORY_MAX_UNLOCKED_EPISODE_KEY, String(Math.min(7, Math.max(current, episodeNumber))));
}

function cleanHeading(line) {
  return line.replace(/^#[!\d]+\.?\s*/, "").trim();
}

function parsePrologue(raw) {
  const sections = {};
  let currentKey = "";

  raw.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || /^--- PAGE \d+ ---$/.test(line) || line.toLowerCase() === "prologue") return;

    const headingMatch = line.match(/^#([!\d]+)\.?\s*(.*)$/);
    if (headingMatch) {
      currentKey = headingMatch[1];
      sections[currentKey] = {
        heading: cleanHeading(line) || `${currentKey}화`,
        lines: [],
      };
      return;
    }

    if (currentKey) sections[currentKey].lines.push(line);
  });

  return sections;
}

function matchSpeaker(line) {
  const speaker = SPEAKERS.find((candidate) => line === candidate || line.startsWith(`${candidate} `));
  if (!speaker) return null;

  let text = line.slice(speaker.length).trim();
  let tone = "";
  const toneMatch = text.match(/^\(([^)]+)\)\s*(.*)$/);
  if (toneMatch) {
    tone = toneMatch[1];
    text = toneMatch[2];
  }

  return { speaker: SPEAKER_LABELS[speaker] || speaker, tone, text };
}

function endsWithSentenceMark(value) {
  return /[.!?。！？…)"'”’]$/.test(String(value).trim());
}

function shouldContinueDialogue(line, dialogueBlock) {
  if (!dialogueBlock) return false;
  if (!endsWithSentenceMark(dialogueBlock.text)) return true;
  if (/^[.!?。！？…]/.test(line)) return true;
  if (/^(?:하지만|그러나|그리고|게다가|그래도|아니|네,|저,|당신|내|나|우리|너|그게|그건|이거|뭐야)/.test(line)) return true;
  return false;
}

function parseBlocks(lines) {
  const blocks = [];
  let narration = [];
  let activeDialogue = null;

  const flushNarration = () => {
    if (!narration.length) return;
    blocks.push({ type: "narration", text: narration.join(" ") });
    narration = [];
  };

  lines.forEach((line) => {
    if (/^\[[^\]]+\]$/.test(line)) {
      flushNarration();
      blocks.push({ type: "meta", text: line.replace(/^\[|\]$/g, "") });
      return;
    }

    const dialogue = matchSpeaker(line);
    if (dialogue) {
      flushNarration();
      activeDialogue = { type: "dialogue", ...dialogue };
      blocks.push(activeDialogue);
      return;
    }

    if (shouldContinueDialogue(line, activeDialogue)) {
      activeDialogue.text = `${activeDialogue.text} ${line}`.trim();
      return;
    }

    activeDialogue = null;
    narration.push(line);
  });

  flushNarration();
  return blocks;
}

function getEpisodeContent(episode) {
  return episode.sections.flatMap((sectionKey) => {
    const section = prologueSections[sectionKey];
    if (!section) return [];
    return [
      { type: "scene", text: section.heading },
      ...parseBlocks(section.lines),
    ];
  });
}

function renderBlock(block) {
  if (block.type === "scene") return `<h2>${escapeStoryHtml(block.text)}</h2>`;
  if (block.type === "meta") return `<p class="novel-meta">${escapeStoryHtml(block.text)}</p>`;
  if (block.type === "dialogue") {
    return `
      <div class="novel-line">
        <strong>${escapeStoryHtml(block.speaker)}</strong>
        <p>${escapeStoryHtml(block.text)}</p>
      </div>
    `;
  }

  return String(block.text)
    .split(/(?<=[.!?。！？…])\s+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p class="novel-narration">${escapeStoryHtml(paragraph)}</p>`)
    .join("");
}

function renderEpisodeList() {
  const unlockedEpisode = getUnlockedEpisode();
  setStoryMetadata();
  novelReader.classList.add("hidden");
  episodeList.classList.remove("hidden");
  episodeList.innerHTML = EPISODES.map((episode) => {
    const isLocked = episode.episode > unlockedEpisode;
    const views = storyViewCounts[episode.episode] ?? storyViewCounts[String(episode.episode)] ?? 0;
    const likes = storyLikeCounts[episode.episode] ?? storyLikeCounts[String(episode.episode)] ?? 0;
    return `
      <button class="episode-row ${isLocked ? "locked" : ""}" type="button" data-episode="${episode.episode}">
        <span>${episode.episode}화. ${escapeStoryHtml(episode.title)}</span>
        <span class="episode-meta">
          ${isLocked
            ? '<i aria-hidden="true">●</i>'
            : `<em class="episode-views">조회 ${formatStoryCount(views)}</em><em class="episode-views">좋아요 ${formatStoryCount(likes)}</em>`}
        </span>
      </button>
    `;
  }).join("");
}

function renderReader(episodeNumber, { trackView = true } = {}) {
  const episode = EPISODES.find((candidate) => candidate.episode === episodeNumber);
  if (!episode) {
    renderEpisodeList();
    return;
  }

  if (episode.episode > getUnlockedEpisode()) {
    requestUnlock(episode.episode);
    renderEpisodeList();
    return;
  }

  setStoryMetadata(episode);
  const blocks = getEpisodeContent(episode);
  const previousEpisode = EPISODES.find((candidate) => candidate.episode === episode.episode - 1);
  const nextEpisode = EPISODES.find((candidate) => candidate.episode === episode.episode + 1);
  const views = storyViewCounts[episodeNumber] ?? storyViewCounts[String(episodeNumber)] ?? 0;
  const likes = storyLikeCounts[episodeNumber] ?? storyLikeCounts[String(episodeNumber)] ?? 0;
  const isLiked = storyLikedEpisodes.has(episodeNumber);

  episodeList.classList.add("hidden");
  novelReader.classList.remove("hidden");
  novelReader.innerHTML = `
    <div class="novel-top">
      <a href="story.html" class="back-link">목록으로</a>
      <span class="novel-top-stats">조회 ${formatStoryCount(views)}</span>
    </div>
    <h1>${episode.episode}화. ${escapeStoryHtml(episode.title)}</h1>
    <div class="novel-flow">
      ${blocks.length ? blocks.map((block) => renderBlock(block)).join("") : '<p class="novel-narration">스토리를 불러오는 중입니다.</p>'}
    </div>
    <div class="story-like-bar">
      <button class="story-like-btn ${isLiked ? "on" : ""}" type="button" data-episode-like="${episodeNumber}" aria-pressed="${isLiked}">
        <span class="heart-symbol" aria-hidden="true">♥️</span>
        <span>재밌어요</span>
        <strong class="story-like-count">${formatStoryCount(likes)}</strong>
      </button>
    </div>
    <div class="story-side-nav" aria-label="회차 이동">
      ${previousEpisode ? `<button class="story-side-btn story-side-btn-prev" type="button" data-target-episode="${previousEpisode.episode}">이전 화 보기</button>` : ""}
      ${nextEpisode ? `<button class="story-side-btn story-side-btn-next" type="button" data-target-episode="${nextEpisode.episode}">다음 화 보기</button>` : ""}
    </div>
  `;

  window.scrollTo({ top: 0, behavior: "smooth" });
  if (trackView) trackEpisodeView(episodeNumber);
}

function getCurrentReaderEpisode() {
  const value = Number(novelReader.querySelector("[data-episode-like]")?.dataset.episodeLike);
  return Number.isFinite(value) ? value : null;
}

function updateCurrentViewCount(episodeNumber, count) {
  if (getCurrentReaderEpisode() !== episodeNumber) return;
  const statEl = novelReader.querySelector(".novel-top-stats");
  if (statEl) statEl.textContent = `조회 ${formatStoryCount(count)}`;
}

function createStoryViewId(episodeNumber) {
  const randomId = window.crypto?.randomUUID?.()
    || `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  return `${episodeNumber}_${randomId}`;
}

function readPendingStoryViews() {
  const value = readStoryJson(STORY_PENDING_VIEWS_KEY, {});
  if (!Array.isArray(value)) return value;

  const migrated = {};
  value.map(Number).filter(Number.isFinite).forEach((episodeNumber) => {
    migrated[createStoryViewId(episodeNumber)] = episodeNumber;
  });
  localStorage.setItem(STORY_PENDING_VIEWS_KEY, JSON.stringify(migrated));
  return migrated;
}

function readPendingStoryLikes() {
  return readStoryJson(STORY_PENDING_LIKES_KEY, {});
}

async function syncStoryView(viewId) {
  if (storyViewSyncInFlight.has(viewId)) return;
  const pendingViews = readPendingStoryViews();
  if (!Object.prototype.hasOwnProperty.call(pendingViews, viewId)) return;
  const episodeNumber = Number(pendingViews[viewId]);
  if (!Number.isFinite(episodeNumber)) return;

  storyViewSyncInFlight.add(viewId);
  const response = await window.VeloApi?.trackStoryView(episodeNumber, viewId);
  storyViewSyncInFlight.delete(viewId);
  if (!response?.ok || response.count == null) return;

  const latestPendingViews = readPendingStoryViews();
  delete latestPendingViews[viewId];
  localStorage.setItem(STORY_PENDING_VIEWS_KEY, JSON.stringify(latestPendingViews));
  storyViewCounts[episodeNumber] = Math.max(
    Number(storyViewCounts[episodeNumber] || storyViewCounts[String(episodeNumber)] || 0),
    Number(response.count || 0)
  );
  storyViewLiveProtection.set(episodeNumber, Date.now() + 15000);
  localStorage.setItem(STORY_VIEW_COUNTS_KEY, JSON.stringify(storyViewCounts));
  updateCurrentViewCount(episodeNumber, storyViewCounts[episodeNumber]);
}

function trackEpisodeView(episodeNumber) {
  const pendingViews = readPendingStoryViews();
  const viewId = createStoryViewId(episodeNumber);
  pendingViews[viewId] = episodeNumber;
  storyViewCounts[episodeNumber] = Number(storyViewCounts[episodeNumber] || storyViewCounts[String(episodeNumber)] || 0) + 1;
  localStorage.setItem(STORY_PENDING_VIEWS_KEY, JSON.stringify(pendingViews));
  localStorage.setItem(STORY_VIEW_COUNTS_KEY, JSON.stringify(storyViewCounts));
  updateCurrentViewCount(episodeNumber, storyViewCounts[episodeNumber]);

  if (!storyBootstrapPending) syncStoryView(viewId);
}

function getStoryLikeSyncState(episodeNumber) {
  if (!storyLikeSyncStates.has(episodeNumber)) {
    storyLikeSyncStates.set(episodeNumber, { timer: null, inFlight: false });
  }
  return storyLikeSyncStates.get(episodeNumber);
}

function scheduleStoryLikeSync(episodeNumber, delay = STORY_LIKE_SYNC_DELAY_MS) {
  const state = getStoryLikeSyncState(episodeNumber);
  if (state.inFlight) return;
  if (state.timer) window.clearTimeout(state.timer);
  state.timer = window.setTimeout(() => syncStoryLike(episodeNumber), delay);
}

async function syncStoryLike(episodeNumber) {
  const state = getStoryLikeSyncState(episodeNumber);
  state.timer = null;
  if (state.inFlight) return;

  const pending = readPendingStoryLikes();
  if (!Object.prototype.hasOwnProperty.call(pending, episodeNumber)) return;

  const desired = Boolean(pending[episodeNumber]);
  state.inFlight = true;
  const response = await window.VeloApi?.setStoryLike(episodeNumber, desired);
  state.inFlight = false;

  const latestPending = readPendingStoryLikes();
  const isLatest = Object.prototype.hasOwnProperty.call(latestPending, episodeNumber)
    && Boolean(latestPending[episodeNumber]) === desired;
  if (response?.ok && confirmedStoryLikedEpisodes) {
    if (desired) confirmedStoryLikedEpisodes.add(episodeNumber);
    else confirmedStoryLikedEpisodes.delete(episodeNumber);
  }
  if (response?.ok && response.count != null && isLatest) {
    delete latestPending[episodeNumber];
    localStorage.setItem(STORY_PENDING_LIKES_KEY, JSON.stringify(latestPending));
    if (storyLikedEpisodes.has(episodeNumber) === desired) {
      storyLikeCounts[episodeNumber] = Number(response.count || 0);
      storyLikeLiveProtection.set(episodeNumber, Date.now() + 15000);
      localStorage.setItem(STORY_LIKE_COUNTS_KEY, JSON.stringify(storyLikeCounts));
      if (getCurrentReaderEpisode() === episodeNumber) {
        const countEl = novelReader.querySelector(".story-like-count");
        if (countEl) countEl.textContent = formatStoryCount(storyLikeCounts[episodeNumber]);
      }
    }
  }

  const remaining = readPendingStoryLikes();
  if (Object.prototype.hasOwnProperty.call(remaining, episodeNumber)
      && Boolean(remaining[episodeNumber]) !== desired) {
    scheduleStoryLikeSync(episodeNumber, 0);
  }
}

function flushPendingStorySync() {
  if (storyBootstrapPending) return;
  Object.keys(readPendingStoryViews()).forEach((viewId) => syncStoryView(viewId));
  Object.keys(readPendingStoryLikes()).forEach((episodeNumber) => {
    scheduleStoryLikeSync(Number(episodeNumber), 0);
  });
}

function toggleStoryLike(episodeNumber, button) {
  const nextActive = !storyLikedEpisodes.has(episodeNumber);
  if (nextActive) storyLikedEpisodes.add(episodeNumber);
  else storyLikedEpisodes.delete(episodeNumber);

  storyLikeCounts[episodeNumber] = Math.max(0, Number(storyLikeCounts[episodeNumber] || storyLikeCounts[String(episodeNumber)] || 0) + (nextActive ? 1 : -1));
  localStorage.setItem(STORY_LIKED_EPISODES_KEY, JSON.stringify([...storyLikedEpisodes]));
  localStorage.setItem(STORY_LIKE_COUNTS_KEY, JSON.stringify(storyLikeCounts));
  button.classList.toggle("on", nextActive);
  button.setAttribute("aria-pressed", String(nextActive));
  const countEl = button.querySelector(".story-like-count");
  if (countEl) countEl.textContent = formatStoryCount(storyLikeCounts[episodeNumber]);

  const pending = readPendingStoryLikes();
  pending[episodeNumber] = nextActive;
  const syncState = getStoryLikeSyncState(episodeNumber);
  if (!syncState.inFlight && confirmedStoryLikedEpisodes
      && confirmedStoryLikedEpisodes.has(episodeNumber) === nextActive) {
    delete pending[episodeNumber];
    if (syncState.timer) window.clearTimeout(syncState.timer);
    syncState.timer = null;
    localStorage.setItem(STORY_PENDING_LIKES_KEY, JSON.stringify(pending));
    return;
  }
  localStorage.setItem(STORY_PENDING_LIKES_KEY, JSON.stringify(pending));
  scheduleStoryLikeSync(episodeNumber);
}

async function requestMvpUnlock() {
  const contact = prompt("7화를 보려면 MVP 테스트 신청 연락처를 남겨주세요. 이메일 또는 전화번호를 입력해주세요.");
  if (contact === null) return;
  const value = contact.trim();
  if (!value) {
    alert("연락처를 입력해주세요.");
    return;
  }

  const response = await window.VeloApi?.submitProducerSignup(value);
  if (!response?.ok) {
    alert(response?.message || "연락처 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  localStorage.setItem(STORY_PRODUCER_SIGNUP_JOINED_KEY, "true");
  rememberUnlockedEpisode(7);
  remoteUnlockedEpisode = Math.max(remoteUnlockedEpisode || 5, 7);
  alert(response.message || "MVP 테스트 신청이 완료되었습니다. 7화를 열어드릴게요.");
  renderEpisodeList();
  renderReader(7);
}

function requestUnlock(episodeNumber) {
  const unlockedEpisode = getUnlockedEpisode();
  if (episodeNumber === 7) {
    if (unlockedEpisode < 6) {
      alert("7화는 6화를 먼저 연 뒤, MVP 테스트 신청 연락처를 남기면 볼 수 있습니다.");
      return;
    }
    requestMvpUnlock();
    return;
  }

  localStorage.setItem(PENDING_UNLOCK_KEY, String(episodeNumber));
  alert(`${episodeNumber}화를 보려면 팬존에 감상글을 하나 남겨주세요.`);
  window.location.href = "fan.html#write-review";
}

async function loadRemoteUnlockState() {
  if (!window.VeloApi) return;
  const response = await window.VeloApi.getUnlockState();
  if (response?.ok && Number.isInteger(response.maxUnlockedEpisode)) {
    remoteUnlockedEpisode = response.maxUnlockedEpisode;
    const savedUnlockedEpisode = Number(localStorage.getItem(STORY_MAX_UNLOCKED_EPISODE_KEY) || 5);
    localStorage.setItem(STORY_MAX_UNLOCKED_EPISODE_KEY, String(Math.max(savedUnlockedEpisode, remoteUnlockedEpisode)));
  }
}

function refreshCurrentStoryView() {
  const activeEpisode = novelReader.classList.contains("hidden")
    ? null
    : Number(novelReader.querySelector("[data-episode-like]")?.dataset.episodeLike);
  if (activeEpisode != null && Number.isFinite(activeEpisode)) renderReader(activeEpisode, { trackView: false });
  else renderEpisodeList();
}

async function loadStoryBootstrap() {
  const response = await window.VeloApi?.getStoryBootstrap?.();
  if (!response?.ok) return;

  if (Number.isInteger(response.maxUnlockedEpisode)) {
    remoteUnlockedEpisode = response.maxUnlockedEpisode;
    const savedUnlockedEpisode = Number(localStorage.getItem(STORY_MAX_UNLOCKED_EPISODE_KEY) || 5);
    localStorage.setItem(STORY_MAX_UNLOCKED_EPISODE_KEY, String(Math.max(savedUnlockedEpisode, remoteUnlockedEpisode)));
  }

  const localViewCounts = readStoryJson(STORY_VIEW_COUNTS_KEY, storyViewCounts);
  const pendingViews = readPendingStoryViews();
  const pendingViewCounts = Object.values(pendingViews).reduce((counts, episodeValue) => {
    const episodeNumber = Number(episodeValue);
    if (Number.isFinite(episodeNumber)) {
      counts[episodeNumber] = Number(counts[episodeNumber] || 0) + 1;
    }
    return counts;
  }, {});
  storyViewCounts = { ...(response.viewCounts || {}) };
  Object.entries(pendingViewCounts).forEach(([episodeKey, pendingCount]) => {
    const episodeNumber = Number(episodeKey);
    storyViewCounts[episodeNumber] = Math.max(
      Number(storyViewCounts[episodeNumber] || 0) + Number(pendingCount || 0),
      Number(localViewCounts[episodeNumber] || localViewCounts[String(episodeNumber)] || 0)
    );
  });

  const serverLikedEpisodes = new Set((response.likedEpisodes || []).map(Number));
  confirmedStoryLikedEpisodes = new Set(serverLikedEpisodes);
  storyLikedEpisodes = new Set(serverLikedEpisodes);
  storyLikeCounts = { ...(response.likeCounts || {}) };
  const pendingLikes = readPendingStoryLikes();
  Object.entries(pendingLikes).forEach(([episodeKey, active]) => {
    const episodeNumber = Number(episodeKey);
    const desired = Boolean(active);
    const serverActive = serverLikedEpisodes.has(episodeNumber);
    if (desired === serverActive) {
      delete pendingLikes[episodeKey];
      return;
    }
    if (desired) storyLikedEpisodes.add(episodeNumber);
    else storyLikedEpisodes.delete(episodeNumber);
    if (desired !== serverActive) {
      storyLikeCounts[episodeNumber] = Math.max(
        0,
        Number(storyLikeCounts[episodeNumber] || storyLikeCounts[episodeKey] || 0) + (desired ? 1 : -1)
      );
    }
  });

  localStorage.setItem(STORY_VIEW_COUNTS_KEY, JSON.stringify(storyViewCounts));
  localStorage.setItem(STORY_PENDING_VIEWS_KEY, JSON.stringify(pendingViews));
  localStorage.setItem(STORY_LIKE_COUNTS_KEY, JSON.stringify(storyLikeCounts));
  localStorage.setItem(STORY_LIKED_EPISODES_KEY, JSON.stringify([...storyLikedEpisodes]));
  localStorage.setItem(STORY_PENDING_LIKES_KEY, JSON.stringify(pendingLikes));
}

function applyLiveStoryStats(response) {
  const remoteViewCounts = response?.storyViewCounts;
  const remoteLikeCounts = response?.storyLikeCounts;
  if (!remoteViewCounts || !remoteLikeCounts) return;

  const pendingViews = readPendingStoryViews();
  const pendingViewEpisodes = new Set(Object.values(pendingViews).map(Number));
  const pendingLikes = readPendingStoryLikes();
  const nextViewCounts = { ...storyViewCounts };
  const nextLikeCounts = { ...storyLikeCounts };
  const now = Date.now();

  EPISODES.forEach(({ episode }) => {
    if (!pendingViewEpisodes.has(episode)
        && Number(storyViewLiveProtection.get(episode) || 0) <= now
        && Object.prototype.hasOwnProperty.call(remoteViewCounts, episode)) {
      nextViewCounts[episode] = Number(remoteViewCounts[episode] || 0);
    }
    if (!Object.prototype.hasOwnProperty.call(pendingLikes, episode)
        && Number(storyLikeLiveProtection.get(episode) || 0) <= now
        && Object.prototype.hasOwnProperty.call(remoteLikeCounts, episode)) {
      nextLikeCounts[episode] = Number(remoteLikeCounts[episode] || 0);
    }
  });

  storyViewCounts = nextViewCounts;
  storyLikeCounts = nextLikeCounts;
  localStorage.setItem(STORY_VIEW_COUNTS_KEY, JSON.stringify(storyViewCounts));
  localStorage.setItem(STORY_LIKE_COUNTS_KEY, JSON.stringify(storyLikeCounts));

  if (!episodeList.classList.contains("hidden")) {
    renderEpisodeList();
    return;
  }

  const activeEpisode = getCurrentReaderEpisode();
  if (activeEpisode == null) return;
  updateCurrentViewCount(activeEpisode, storyViewCounts[activeEpisode]);
  const countEl = novelReader.querySelector(".story-like-count");
  if (countEl) countEl.textContent = formatStoryCount(storyLikeCounts[activeEpisode]);
}

function startStoryLiveStats() {
  window.VeloApi?.subscribeLiveStats?.(applyLiveStoryStats);
}

episodeList.addEventListener("click", (event) => {
  const row = event.target.closest(".episode-row");
  if (!row) return;
  renderReader(Number(row.dataset.episode));
});

novelReader.addEventListener("click", (event) => {
  const likeButton = event.target.closest("[data-episode-like]");
  if (likeButton) {
    toggleStoryLike(Number(likeButton.dataset.episodeLike), likeButton);
    return;
  }

  const episodeButton = event.target.closest("[data-target-episode]");
  if (episodeButton) renderReader(Number(episodeButton.dataset.targetEpisode));
});

window.addEventListener("online", flushPendingStorySync);

fetch("prologue.txt")
  .then((response) => response.text())
  .then((raw) => {
    prologueSections = parsePrologue(raw);
    const params = new URLSearchParams(window.location.search);
    const episodeParam = Number(params.get("episode"));
    if (params.has("episode")) renderReader(episodeParam);
    else renderEpisodeList();

    loadStoryBootstrap()
      .then(() => {
        storyBootstrapPending = false;
        refreshCurrentStoryView();
        flushPendingStorySync();
        startStoryLiveStats();
      })
      .catch(() => {
        storyBootstrapPending = false;
        flushPendingStorySync();
        startStoryLiveStats();
      });
  })
  .catch(() => {
    episodeList.innerHTML = '<p class="empty-board">프롤로그를 불러오지 못했습니다. 로컬 서버 또는 Vercel 주소로 다시 열어주세요.</p>';
  });
