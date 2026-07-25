const LAUNCH_LINKS = {
  producerClub: "",
  mvpTest: "",
};

const MEMBER_FAVORITES_KEY = "veloMemberFavorites";
const MEMBER_FAVORITE_COUNTS_KEY = "veloMemberFavoriteCounts";
const MEMBER_FAVORITE_PENDING_KEY = "veloPendingMemberFavorites";
const MEMBER_SYNC_DELAY_MS = 300;
const PRODUCER_SIGNUP_JOINED_KEY = "veloProducerSignupJoined";
const MAX_UNLOCKED_EPISODE_KEY = "veloMaxUnlockedEpisode";

const MEMBERS = [
  {
    en: "ria",
    ko: "리아",
    roman: "RIA",
    role: "리더 · 메인보컬",
    accent: "#9a7be0",
    intro: "흩어진 팀을 다시 세우기 위해, 누구보다 먼저 무대 앞에 서는 리더.",
    kw: ["리더", "메인보컬", "단단함"],
    line: "무서워도 해야지. 우리 무대는 아직 끝나지 않았어.",
  },
  {
    en: "seoyun",
    ko: "서윤",
    roman: "SEOYUN",
    role: "메인댄서",
    accent: "#46c2b8",
    intro: "움직일수록 선명해지고, 이상할수록 더 정확해지는 에너지.",
    kw: ["메인댄서", "강심장", "분위기메이커"],
    line: "관객이 있든 없든, 지금 이 순간은 진짜야.",
  },
  {
    en: "mina",
    ko: "미나",
    roman: "MINA",
    role: "비주얼",
    accent: "#7d7ad6",
    intro: "완벽한 장면을 고집하지만, 이상하게도 멤버들을 가장 먼저 챙긴다.",
    kw: ["비주얼", "완벽주의", "츤데레"],
    line: "조명 각도부터 다시 잡자. 무대는 디테일이야.",
  },
  {
    en: "hana",
    ko: "하나",
    roman: "HANA",
    role: "래퍼",
    accent: "#9690b2",
    intro: "작은 목소리로 숨던 아이가, 무대 위에서는 가장 날카로운 말을 꺼낸다.",
    kw: ["래퍼", "반전매력", "가사천재"],
    line: "마이크만 주면 괜찮아요. 나머지는 제가 해볼게요.",
  },
  {
    en: "jiwu",
    ko: "지우",
    roman: "JIWOO",
    role: "막내 · 올라운더",
    accent: "#f0ad6a",
    intro: "가장 어린 막내지만, 무대의 빈틈을 누구보다 빠르게 채운다.",
    kw: ["막내", "올라운더", "인간비타민"],
    line: "괜찮아! 흔들려도 다시 맞추면 되잖아!",
  },
];

const DEV = [
  ["캐릭터 디자인 완료", "5명 멤버의 기본 디자인이 완료되었습니다.", 100],
  ["스토리 시놉시스 구축 완료", "메인 스토리의 큰 줄기가 완성되었습니다.", 100],
  ["MVP 작업 진행 중", "핵심 콘텐츠를 개발하고 있습니다.", 65],
  ["리듬게임 시스템 개발 중", "리듬게임 시스템을 개발하고 있습니다.", 40],
];

function readStoredJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function renderMembers() {
  const grid = document.getElementById("memberGrid");
  if (!grid) return;

  grid.innerHTML = MEMBERS.map((m, i) => `
    <article class="mcard reveal" data-member-id="${m.en}" style="--accent:${m.accent}; --d:${i * 0.06}s">
      <div class="mc-photo">
        <span class="mc-star"><img src="assets/star.png" alt=""></span>
        <span class="mc-no">0${i + 1}</span>
        <img class="mc-img" src="members/${m.en}.png" alt="${m.ko}" loading="lazy" />
      </div>
      <div class="mc-body">
        <h3 class="mc-name">${m.ko}<small>${m.roman}</small></h3>
        <span class="mc-role">${m.role}</span>
        <p class="mc-intro">${m.intro}</p>
        <div class="mc-kw">${m.kw.map((k) => `<span>#${k}</span>`).join("")}</div>
        <p class="mc-line">"${m.line}"</p>
        <div class="mc-foot">
          <button class="mc-btn" type="button">이 멤버가 궁금해요</button>
          <button class="mc-heart" type="button" aria-label="${m.ko} 좋아요" aria-pressed="false">
            <span class="heart-symbol" aria-hidden="true">♥️</span>
            <span class="mc-heart-count">0</span>
          </button>
        </div>
      </div>
    </article>`).join("");

  const applyFavorites = (favorites) => {
    grid.querySelectorAll(".mcard").forEach((card) => {
      const heart = card.querySelector(".mc-heart");
      const selected = favorites.has(card.dataset.memberId);
      heart?.classList.toggle("on", selected);
      heart?.setAttribute("aria-pressed", String(selected));
    });
  };

  const applyFavoriteCounts = (counts = {}) => {
    grid.querySelectorAll(".mcard").forEach((card) => {
      const countEl = card.querySelector(".mc-heart-count");
      if (countEl) countEl.textContent = formatCount(counts[card.dataset.memberId] || 0);
    });
  };

  const memberSyncStates = new Map();
  const memberLiveProtection = new Map();
  let memberBootstrapPending = true;
  let confirmedFavorites = null;
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const readFavorites = () => new Set(readStoredJson(MEMBER_FAVORITES_KEY, []));
  const readPendingFavorites = () => readStoredJson(MEMBER_FAVORITE_PENDING_KEY, {});

  const saveMemberState = (favorites, counts) => {
    localStorage.setItem(MEMBER_FAVORITES_KEY, JSON.stringify([...favorites]));
    localStorage.setItem(MEMBER_FAVORITE_COUNTS_KEY, JSON.stringify(counts));
    applyFavorites(favorites);
    applyFavoriteCounts(counts);
  };

  const getMemberSyncState = (memberId) => {
    if (!memberSyncStates.has(memberId)) {
      memberSyncStates.set(memberId, { timer: null, inFlight: false });
    }
    return memberSyncStates.get(memberId);
  };

  function scheduleMemberFavoriteSync(memberId, delay = MEMBER_SYNC_DELAY_MS) {
    if (memberBootstrapPending) return;
    const state = getMemberSyncState(memberId);
    if (state.inFlight) return;
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => syncMemberFavorite(memberId), delay);
  }

  async function syncMemberFavorite(memberId) {
    const state = getMemberSyncState(memberId);
    state.timer = null;
    if (state.inFlight) return;

    const pending = readPendingFavorites();
    if (!hasOwn(pending, memberId)) return;

    const desired = Boolean(pending[memberId]);
    state.inFlight = true;
    const response = await window.VeloApi?.setMemberFavorite(memberId, desired);
    state.inFlight = false;

    const latestPending = readPendingFavorites();
    const isLatest = hasOwn(latestPending, memberId) && Boolean(latestPending[memberId]) === desired;
    if (response?.ok && confirmedFavorites) {
      if (desired) confirmedFavorites.add(memberId);
      else confirmedFavorites.delete(memberId);
    }
    if (response?.ok && response.count != null && isLatest) {
      delete latestPending[memberId];
      localStorage.setItem(MEMBER_FAVORITE_PENDING_KEY, JSON.stringify(latestPending));

      const favorites = readFavorites();
      const counts = readStoredJson(MEMBER_FAVORITE_COUNTS_KEY, {});
      if (favorites.has(memberId) === desired) {
        counts[memberId] = Number(response.count || 0);
        memberLiveProtection.set(memberId, Date.now() + 15000);
        saveMemberState(favorites, counts);
      }
    }

    const remaining = readPendingFavorites();
    if (hasOwn(remaining, memberId) && Boolean(remaining[memberId]) !== desired) {
      scheduleMemberFavoriteSync(memberId, 0);
    }
  }

  function flushPendingMemberFavorites() {
    Object.keys(readPendingFavorites()).forEach((memberId) => {
      scheduleMemberFavoriteSync(memberId, 0);
    });
  }

  const cachedFavorites = readFavorites();
  const cachedCounts = readStoredJson(MEMBER_FAVORITE_COUNTS_KEY, {});
  applyFavorites(cachedFavorites);
  applyFavoriteCounts(cachedCounts);

  const applyLiveMemberStats = (response) => {
    const remoteCounts = response?.memberFavoriteCounts;
    if (!remoteCounts || typeof remoteCounts !== "object") return;
    const currentCounts = readStoredJson(MEMBER_FAVORITE_COUNTS_KEY, {});
    const pending = readPendingFavorites();
    const nextCounts = { ...currentCounts };
    const now = Date.now();

    MEMBERS.forEach((member) => {
      const memberId = member.en;
      if (hasOwn(pending, memberId) || Number(memberLiveProtection.get(memberId) || 0) > now) return;
      if (hasOwn(remoteCounts, memberId)) nextCounts[memberId] = Number(remoteCounts[memberId] || 0);
    });

    localStorage.setItem(MEMBER_FAVORITE_COUNTS_KEY, JSON.stringify(nextCounts));
    applyFavoriteCounts(nextCounts);
  };

  window.VeloApi?.getMemberFavorites()
    .then((response) => {
      if (!response?.ok) return;
      const serverFavorites = new Set(response.favorites || []);
      if (response.mode !== "local") confirmedFavorites = new Set(serverFavorites);
      const favorites = new Set(serverFavorites);
      const counts = { ...cachedCounts, ...(response.counts || {}) };
      const pending = readPendingFavorites();

      Object.entries(pending).forEach(([memberId, active]) => {
        const desired = Boolean(active);
        const serverActive = serverFavorites.has(memberId);
        if (response.mode !== "local" && desired === serverActive) {
          delete pending[memberId];
          return;
        }
        if (desired) favorites.add(memberId);
        else favorites.delete(memberId);
        if (desired !== serverActive) {
          counts[memberId] = Math.max(0, Number(counts[memberId] || 0) + (desired ? 1 : -1));
        }
      });

      localStorage.setItem(MEMBER_FAVORITE_PENDING_KEY, JSON.stringify(pending));
      saveMemberState(favorites, counts);
    })
    .catch(() => {})
    .finally(() => {
      memberBootstrapPending = false;
      flushPendingMemberFavorites();
      window.VeloApi?.subscribeLiveStats?.(applyLiveMemberStats);
    });

  window.addEventListener("online", flushPendingMemberFavorites);

  grid.addEventListener("click", (event) => {
    const heart = event.target.closest(".mc-heart");
    if (!heart) return;

    const card = heart.closest(".mcard");
    const memberId = card?.dataset.memberId;
    if (!memberId) return;

    const favorites = readFavorites();
    const selected = !favorites.has(memberId);
    if (selected) favorites.add(memberId);
    else favorites.delete(memberId);

    const counts = readStoredJson(MEMBER_FAVORITE_COUNTS_KEY, {});
    counts[memberId] = Math.max(0, Number(counts[memberId] || 0) + (selected ? 1 : -1));
    saveMemberState(favorites, counts);

    const pending = readPendingFavorites();
    pending[memberId] = selected;
    const syncState = getMemberSyncState(memberId);
    if (!syncState.inFlight && confirmedFavorites && confirmedFavorites.has(memberId) === selected) {
      delete pending[memberId];
      if (syncState.timer) window.clearTimeout(syncState.timer);
      syncState.timer = null;
      localStorage.setItem(MEMBER_FAVORITE_PENDING_KEY, JSON.stringify(pending));
      return;
    }
    localStorage.setItem(MEMBER_FAVORITE_PENDING_KEY, JSON.stringify(pending));
    scheduleMemberFavoriteSync(memberId);
  });
}

function renderDevLog() {
  const devGrid = document.getElementById("devGrid");
  if (!devGrid) return;
  devGrid.innerHTML = DEV.map(([title, desc, progress], i) => `
    <article class="dcard reveal" style="--d:${i * 0.06}s">
      <div class="dc-ring" style="--p:${progress}">
        ${progress === 100
          ? '<span class="dc-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></span>'
          : `<b>${progress}<i>%</i></b>`}
      </div>
      <h3>${title}</h3>
      <p>${desc}</p>
      <span class="dc-pct ${progress === 100 ? "done" : ""}">${progress === 100 ? "COMPLETE" : `${progress}% 진행`}</span>
    </article>`).join("");
}

function renderFooterSns() {
  const icons = {
    X: '<path d="M4 4l16 16M20 4L4 20" stroke-width="2"/>',
    Instagram: '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1.2" fill="currentColor"/>',
    YouTube: '<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>',
  };
  const footSns = document.getElementById("footSns");
  if (!footSns) return;
  footSns.innerHTML = Object.entries(icons).map(([name, path]) =>
    `<a class="sns" href="#" aria-label="${name}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${path}</svg></a>`
  ).join("");
}

function initDecorations() {
  document.querySelectorAll("[data-petals]").forEach((layer) => {
    const count = Number(layer.dataset.petals || 14);
    layer.innerHTML = Array.from({ length: count }, () => {
      const size = (8 + Math.random() * 10).toFixed(0);
      return `<i style="left:${(Math.random() * 100).toFixed(1)}%;width:${size}px;height:${(size * 1.3).toFixed(0)}px;animation-duration:${(8 + Math.random() * 8).toFixed(1)}s;animation-delay:${(-Math.random() * 12).toFixed(1)}s;opacity:${(0.3 + Math.random() * 0.4).toFixed(2)}"></i>`;
    }).join("");
  });

  document.querySelectorAll("[data-sparkles]").forEach((layer) => {
    const count = Number(layer.dataset.sparkles || 18);
    layer.innerHTML = Array.from({ length: count }, () => {
      const size = (3 + Math.random() * 5).toFixed(1);
      return `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;width:${size}px;height:${size}px;animation-duration:${(2.4 + Math.random() * 3).toFixed(1)}s;animation-delay:${(-Math.random() * 4).toFixed(1)}s"></i>`;
    }).join("");
  });
}

function initVote() {
  const voteOpts = document.getElementById("voteOpts");
  const voteNote = document.getElementById("voteNote");
  if (!voteOpts) return;
  voteOpts.addEventListener("click", (event) => {
    const option = event.target.closest(".vopt");
    if (!option) return;
    voteOpts.querySelectorAll(".vopt").forEach((el) => el.classList.remove("on"));
    option.classList.add("on");
    if (voteNote) {
      voteNote.classList.remove("rewind");
      void voteNote.offsetWidth;
      voteNote.classList.add("rewind");
    }
  });
}

function rememberUnlockedEpisode(episodeNumber) {
  const current = Number(localStorage.getItem(MAX_UNLOCKED_EPISODE_KEY) || 5);
  localStorage.setItem(MAX_UNLOCKED_EPISODE_KEY, String(Math.min(7, Math.max(current, Number(episodeNumber || 5)))));
}

async function refreshParticipationStatus() {
  const response = await window.VeloApi?.getProducerSignupStatus();
  if (!response?.ok) return;

  localStorage.setItem(PRODUCER_SIGNUP_JOINED_KEY, response.alreadyJoined ? "true" : "false");
  if (response.maxUnlockedEpisode) rememberUnlockedEpisode(response.maxUnlockedEpisode);
}

function openParticipationModal() {
  if (!confirm("MVP 데모 알림을 신청하시겠습니까?")) return;
  const modal = document.getElementById("participationModal");
  const contact = document.getElementById("participationContact");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  refreshParticipationStatus();
  window.setTimeout(() => contact?.focus(), 80);
}

function closeParticipationModal() {
  const modal = document.getElementById("participationModal");
  const message = document.getElementById("participationMsg");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  message?.classList.add("hidden");
}

function initParticipationModal() {
  const modal = document.getElementById("participationModal");
  const form = document.getElementById("participationForm");
  const contact = document.getElementById("participationContact");
  const message = document.getElementById("participationMsg");

  modal?.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", closeParticipationModal));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal && !modal.classList.contains("hidden")) closeParticipationModal();
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = contact?.value.trim();
    if (!value) return;

    if (message) {
      message.textContent = "저장 중입니다...";
      message.classList.remove("hidden");
    }

    const response = await window.VeloApi?.submitProducerSignup(value);
    if (response?.ok) {
      localStorage.setItem(PRODUCER_SIGNUP_JOINED_KEY, "true");
      if (response.maxUnlockedEpisode) rememberUnlockedEpisode(response.maxUnlockedEpisode);
      if (contact) contact.disabled = true;
      if (message) message.textContent = response.message || "신청해주셔서 감사합니다. 테스트 소식이 생기면 연락드릴게요.";
      return;
    }

    localStorage.setItem(PRODUCER_SIGNUP_JOINED_KEY, "true");
    rememberUnlockedEpisode(7);
    if (contact) contact.disabled = true;
    if (message) message.textContent = response?.message || "미리보기 환경이라 이 브라우저에 임시 저장했어요.";
  });

  refreshParticipationStatus();
}

function initHeader() {
  const header = document.getElementById("hd");
  const navToggle = document.getElementById("navToggle");
  const nav = document.getElementById("nav");
  const onScroll = () => header?.classList.toggle("scrolled", window.scrollY > 30);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  navToggle?.addEventListener("click", () => document.body.classList.toggle("nav-open"));
  nav?.addEventListener("click", (event) => {
    if (event.target.tagName === "A") document.body.classList.remove("nav-open");
  });
}

function initLaunchLinks() {
  document.querySelectorAll("[data-launch-link]").forEach((link) => {
    const type = link.dataset.launchLink;
    const url = LAUNCH_LINKS[type];
    if (url) {
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      return;
    }

    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (type === "producerClub") {
        openParticipationModal();
        return;
      }
      alert("아직 준비 중입니다. 링크가 생기면 바로 연결해둘게요.");
    });
  });
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const id = anchor.getAttribute("href");
      if (!id || id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function initReveal() {
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("in");
    observer.unobserve(entry.target);
  }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
}

renderMembers();
renderDevLog();
renderFooterSns();
initDecorations();
initVote();
initHeader();
initParticipationModal();
initLaunchLinks();
initSmoothScroll();
initReveal();
