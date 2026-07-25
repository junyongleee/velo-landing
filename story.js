const STORY_POSTS_KEY = "veloFanPosts";
const STORY_USER_KEY = "veloFanUserKey";
const PENDING_UNLOCK_KEY = "veloPendingUnlockEpisode";

const EPISODES = [
  { episode: 0, title: "자정의 오페라", sections: ["0"] },
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
  "스태프1",
  "스태프2",
  "스태프",
  "관객1",
  "관객2",
  "강주희",
  "P(독백)",
  "P",
  "무명",
  "리아",
  "서윤",
  "미나",
  "하나",
  "지우",
];

const episodeList = document.getElementById("episodeList");
const novelReader = document.getElementById("novelReader");
let episodeStructuredData = null;
const STORY_BASE_URL = "https://velo-landing-puce.vercel.app/story.html";
let prologueSections = {};
let remoteUnlockedEpisode = null;

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
    return posts.filter((post) => post.ownerKey === userKey && post.category === "감상글").length;
  } catch {
    return 0;
  }
}

function getUnlockedEpisode() {
  if (Number.isInteger(remoteUnlockedEpisode)) return remoteUnlockedEpisode;
  return Math.min(7, 5 + getReviewCount());
}

function escapeStoryHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanHeading(line) {
  return line.replace(/^#[!\d]+\.?\s*/, "").trim();
}

function parsePrologue(raw) {
  const sections = {};
  let currentKey = "";

  raw.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || /^--- PAGE \d+ ---$/.test(line) || line === "Prologue") return;

    const headingMatch = line.match(/^#([!\d]+)\.?\s*(.+)$/);
    if (headingMatch) {
      currentKey = headingMatch[1];
      sections[currentKey] = {
        heading: cleanHeading(line),
        lines: [],
      };
      return;
    }

    if (!currentKey) return;
    sections[currentKey].lines.push(line);
  });

  return sections;
}

function matchSpeaker(line) {
  const speaker = SPEAKERS.find((candidate) => line === candidate || line.startsWith(`${candidate} `));
  if (!speaker) return null;

  let rest = line.slice(speaker.length).trim();
  let tone = "";
  const toneMatch = rest.match(/^\(([^)]+)\)\s*(.*)$/);
  if (toneMatch) {
    tone = toneMatch[1];
    rest = toneMatch[2];
  }

  return { speaker, tone, text: rest };
}

function appendText(previous, next) {
  if (!previous) return next;
  return `${previous} ${next}`;
}

function normalizeNarrationSpacing(text) {
  const replacements = [
    [/V\.E\.L\.O\s+의/g, "V.E.L.O의"],
    [/S-Tier\s+의/g, "S-Tier의"],
    [/밤\s+하늘/g, "밤하늘"],
    [/쉴\s+새\s+없이/g, "쉴 새 없이"],
    [/알\s+수\s+없는/g, "알 수 없는"],
    [/그\s+말/g, "그 말"],
    [/그\s+모든/g, "그 모든"],
    [/그\s+저/g, "그저"],
    [/이\s+승/g, "이승"],
    [/저\s+승/g, "저승"],
    [/생\s+방송/g, "생방송"],
    [/스마트\s+폰/g, "스마트폰"],
    [/대한민\s*국/g, "대한민국"],
    [/미친\s*듯이/g, "미친 듯이"],
    [/삐걱\s+거리는/g, "삐걱거리는"],
    [/지직\s+거리는/g, "지직거리는"],
    [/번쩍\s+이게/g, "번쩍이게"],
    [/빨\s+리/g, "빨리"],
    [/어떻\s+게/g, "어떻게"],
    [/어두\s+운/g, "어두운"],
    [/무거\s+운/g, "무거운"],
    [/차가\s+운/g, "차가운"],
    [/날카로\s+운/g, "날카로운"],
    [/새로\s+운/g, "새로운"],
    [/뜨거\s+운/g, "뜨거운"],
    [/외로\s+운/g, "외로운"],
    [/두려\s+운/g, "두려운"],
    [/완벽\s+하게/g, "완벽하게"],
    [/기괴\s+하게/g, "기괴하게"],
    [/잔인\s+하게/g, "잔인하게"],
    [/화려\s+하게/g, "화려하게"],
    [/처절\s+하게/g, "처절하게"],
    [/싸늘\s+하게/g, "싸늘하게"],
  ];

  let normalized = text.replace(/\s+/g, " ").trim();
  replacements.forEach(([pattern, value]) => {
    normalized = normalized.replace(pattern, value);
  });

  return normalized
    .replace(/([가-힣A-Za-z0-9.)\]])\s+(은|는|이|가|을|를|과|와|도|만|의|에|에서|에게|한테|으로|로|부터|까지|처럼|보다|조차|마저|라도|이나|나|든|마다)(?=[\s.,!?…'"”’)\]]|$)/g, "$1$2")
    .replace(/([가-힣])\s+(었다|았다|였다|했다|였다|입니다|습니다|이다|였다|한다|된다|했다|되었다)(?=[\s.,!?…'"”’)\]]|$)/g, "$1$2")
    .replace(/([가-힣])\s+(운|은|인|던|는|게|니까|는데|인데|라서|어서|아서|면서|지만|도록|스럽게)(?=[\s.,!?…'"”’)\]]|$)/g, "$1$2")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/([([{“‘])\s+/g, "$1")
    .replace(/\s+([)\]})”’])/g, "$1");
}

function splitNarrationParagraphs(text) {
  const protectedText = normalizeNarrationSpacing(text)
    .replaceAll("V.E.L.O.", "V§E§L§O§")
    .replaceAll("...", "…");

  return protectedText
    .split(/(?<=[가-힣0-9]\.)\s+/)
    .map((paragraph) => paragraph.replaceAll("V§E§L§O§", "V.E.L.O.").replaceAll("…", "...").trim())
    .filter(Boolean);
}

function shouldContinueDialogue(text) {
  const trimmedText = text.trim();
  if (!trimmedText) return false;
  return !/[.!?…]$/.test(trimmedText) && !/[다요죠까네군]$/.test(trimmedText);
}

function parseBlocks(lines) {
  const blocks = [];
  let currentBlock = null;

  lines.forEach((line) => {
    if (/^\[(장소|시간):/.test(line)) {
      currentBlock = { type: "meta", text: line.replace(/^\[|\]$/g, "") };
      blocks.push(currentBlock);
      return;
    }

    const dialogue = matchSpeaker(line);
    if (dialogue) {
      currentBlock = {
        type: "dialogue",
        speaker: dialogue.speaker,
        tone: dialogue.tone,
        text: dialogue.text,
      };
      blocks.push(currentBlock);
      return;
    }

    if (currentBlock?.type === "dialogue" && shouldContinueDialogue(currentBlock.text)) {
      currentBlock.text = appendText(currentBlock.text, line);
      return;
    }

    if (!currentBlock || currentBlock.type !== "narration") {
      currentBlock = { type: "narration", text: line };
      blocks.push(currentBlock);
      return;
    }

    currentBlock.text = appendText(currentBlock.text, line);
  });

  return blocks;
}

function renderEpisodeList() {
  const unlockedEpisode = getUnlockedEpisode();
  setStoryMetadata();
  novelReader.classList.add("hidden");
  episodeList.classList.remove("hidden");
  episodeList.innerHTML = EPISODES.map((episode) => {
    const isLocked = episode.episode > unlockedEpisode;
    return `
      <a class="episode-row ${isLocked ? "locked" : ""}" href="story.html?episode=${episode.episode}" data-episode="${episode.episode}">
        <span>${episode.episode}화. ${escapeStoryHtml(episode.title)}</span>
        ${isLocked ? "<i aria-hidden=\"true\">●</i>" : ""}
      </a>
    `;
  }).join("");
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

function renderReader(episodeNumber) {
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
  episodeList.classList.add("hidden");
  novelReader.classList.remove("hidden");
  novelReader.innerHTML = `
    <div class="novel-top">
      <a href="story.html" class="back-link">← 목록으로</a>
      ${nextEpisode ? "" : "<span>마지막 화</span>"}
    </div>
    <h1>${episode.episode}화. ${escapeStoryHtml(episode.title)}</h1>
    <div class="novel-flow">
      ${blocks.map((block) => renderBlock(block)).join("")}
    </div>
    <div class="story-side-nav" aria-label="회차 이동">
      ${previousEpisode ? `<a class="story-side-btn story-side-btn-prev" href="story.html?episode=${previousEpisode.episode}">← 이전 화 보기</a>` : ""}
      ${nextEpisode ? `<a class="story-side-btn story-side-btn-next" href="story.html?episode=${nextEpisode.episode}">다음 화 보기 →</a>` : ""}
    </div>
  `;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderBlock(block) {
  if (block.type === "scene") return `<h2>${escapeStoryHtml(block.text)}</h2>`;
  if (block.type === "meta") return `<p class="novel-meta">${escapeStoryHtml(block.text)}</p>`;
  if (block.type === "dialogue") {
    return `
      <div class="novel-line">
        <strong>${escapeStoryHtml(block.speaker)}</strong>
        <p>${escapeStoryHtml(normalizeNarrationSpacing(block.text))}</p>
      </div>
    `;
  }
  return splitNarrationParagraphs(block.text)
    .map((paragraph) => `<p class="novel-narration">${escapeStoryHtml(paragraph)}</p>`)
    .join("");
}

function requestUnlock(episodeNumber) {
  const unlockedEpisode = getUnlockedEpisode();
  if (episodeNumber === 7 && unlockedEpisode < 6) {
    alert("7화는 6화를 먼저 해금한 뒤 열 수 있습니다.");
    return;
  }

  localStorage.setItem(PENDING_UNLOCK_KEY, String(episodeNumber));
  alert(`${episodeNumber}화를 보려면 팬존에 감상글을 하나 남겨주세요.`);
  window.location.href = "fan.html#write-review";
}

episodeList.addEventListener("click", (event) => {
  const row = event.target.closest(".episode-row");
  if (!row) return;
  const episodeNumber = Number(row.dataset.episode);
  if (episodeNumber <= getUnlockedEpisode()) return;
  event.preventDefault();
  requestUnlock(episodeNumber);
});

async function loadRemoteUnlockState() {
  if (!window.VeloApi) return;
  const response = await window.VeloApi.getUnlockState();
  if (response?.ok && Number.isInteger(response.maxUnlockedEpisode)) {
    remoteUnlockedEpisode = response.maxUnlockedEpisode;
  }
}

fetch("prologue.txt")
  .then((response) => response.text())
  .then(async (raw) => {
    prologueSections = parsePrologue(raw);
    await loadRemoteUnlockState();
    const params = new URLSearchParams(window.location.search);
    const episodeParam = Number(params.get("episode"));
    if (params.has("episode")) renderReader(episodeParam);
    else renderEpisodeList();
  })
  .catch(() => {
    episodeList.innerHTML = "<p class=\"empty-board\">프롤로그를 불러오지 못했습니다. 로컬 서버 또는 Vercel 주소로 다시 열어주세요.</p>";
  });
