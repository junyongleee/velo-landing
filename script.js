// V.E.L.O. — 브랜드 랜딩페이지

/* ===== 외부 CTA 링크 =====
   텀블벅 / 구글폼 링크가 생기면 아래 빈 문자열만 실제 URL로 바꾸면 됩니다. */
const LAUNCH_LINKS = {
  producerClub: "",
  mvpTest: "",
};

/* ===== 멤버 데이터 (파일 기준: 리/서/미/하/지 = 리아/서윤/미나/하나/지우) ===== */
const MEMBERS = [
  { en: "ria", ko: "리아", roman: "RIA", role: "리더 · 메인보컬", accent: "#9a7be0",
    intro: "빼앗긴 곡을 되찾기 위해, 떨리는 손으로도 팀의 앞에 서는 리더.",
    kw: ["리더", "메인보컬", "허당미"],
    line: "무서워도 해야지. 내 곡도, 우리 무대도 아직 못 돌려받았잖아." },
  { en: "seoyun", ko: "서윤", roman: "SEOYUN", role: "메인댄서", accent: "#46c2b8",
    intro: "무서울수록 더 신나고, 이상할수록 더 춤추고 싶어지는 팀의 에너지.",
    kw: ["메인댄서", "강심장", "분위기메이커"],
    line: "와, 저 관절 꺾이는 거 봤어? 저거 안무에 쓰면 진짜 대박인데?" },
  { en: "mina", ko: "미나", roman: "MINA", role: "비주얼", accent: "#7d7ad6",
    intro: "완벽한 아름다움을 고집하는 순간, 이상하게도 귀신들마저 그녀를 따른다.",
    kw: ["비주얼", "도도함", "츤데레"],
    line: "무서운 건 둘째치고, 저 조명 각도는 정말 최악이야." },
  { en: "hana", ko: "하나", roman: "HANA", role: "래퍼", accent: "#9690b2",
    intro: "작은 목소리로 떨던 아이가, 무대 위에서는 가장 날카로운 목소리가 된다.",
    kw: ["래퍼", "반전매력", "갭모에"],
    line: "저는… 못 해요… 아니, 마이크만 주면 할 수 있어요." },
  { en: "jiwu", ko: "지우", roman: "JIWOO", role: "막내 · 올라운더", accent: "#f0ad6a",
    intro: "가장 어린 막내지만, 무서운 세계 속에서 모두를 웃게 만드는 중심축.",
    kw: ["막내", "올라운더", "인간비타민"],
    line: "괜찮아, 무서운 애들도 얘기해보면 그렇게 나쁘진 않아!" },
];

/* ===== 멤버 카드 ===== */
const grid = document.getElementById("memberGrid");
if (grid) {
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
        <p class="mc-line">“${m.line}”</p>
        <div class="mc-foot">
          <button class="mc-btn">이 멤버가 궁금해요</button>
          <button class="mc-heart" aria-label="좋아요"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 20s-7-4.4-9.2-8.3C1.2 8.9 2.6 5.5 6 5.5c2 0 3.2 1.3 4 2.5.8-1.2 2-2.5 4-2.5 3.4 0 4.8 3.4 3.2 6.2C19 15.6 12 20 12 20z"/></svg></button>
        </div>
      </div>
    </article>`).join("");
  const localFavorites = new Set(JSON.parse(localStorage.getItem("veloMemberFavorites") || "[]"));
  const applyFavorites = (favorites) => {
    grid.querySelectorAll(".mcard").forEach((card) => {
      const isFavorite = favorites.has(card.dataset.memberId);
      const heart = card.querySelector(".mc-heart");
      if (!heart) return;
      heart.classList.toggle("on", isFavorite);
      heart.setAttribute("aria-pressed", String(isFavorite));
    });
  };

  applyFavorites(localFavorites);
  window.VeloApi?.getMemberFavorites().then((response) => {
    if (!response?.ok) return;
    const remoteFavorites = new Set(response.favorites || []);
    localStorage.setItem("veloMemberFavorites", JSON.stringify([...remoteFavorites]));
    applyFavorites(remoteFavorites);
  });

  grid.addEventListener("click", async (e) => {
    const h = e.target.closest(".mc-heart");
    if (!h) return;
    const card = h.closest(".mcard");
    const memberId = card?.dataset.memberId;
    if (!memberId) return;

    const favorites = new Set(JSON.parse(localStorage.getItem("veloMemberFavorites") || "[]"));
    const nextSelected = !h.classList.contains("on");
    h.classList.toggle("on", nextSelected);
    h.setAttribute("aria-pressed", String(nextSelected));
    if (nextSelected) favorites.add(memberId);
    else favorites.delete(memberId);
    localStorage.setItem("veloMemberFavorites", JSON.stringify([...favorites]));

    const response = await window.VeloApi?.setMemberFavorite(memberId, nextSelected);
    if (response && !response.ok) {
      console.warn("캐릭터 선호 기록은 로컬에만 저장되었습니다.", response.message);
    }
  });
}

/* ===== 개발 소식 ===== */
const DEV = [
  ["캐릭터 디자인 완료", "5인 멤버의 기본 디자인이 완료되었습니다.", 100],
  ["스토리 시놉시스 구축 완료", "메인 스토리의 큰 줄기가 완성되었습니다.", 100],
  ["MVP 작업 진행 중", "핵심 콘텐츠를 개발하고 있습니다.", 65],
  ["리듬게임 시스템 개발 중", "리듬게임 시스템을 개발하고 있습니다.", 40],
];
const devGrid = document.getElementById("devGrid");
if (devGrid) {
  devGrid.innerHTML = DEV.map(([t, d, p], i) => `
    <article class="dcard reveal" style="--d:${i * 0.06}s">
      <div class="dc-ring" style="--p:${p}">
        ${p === 100
          ? '<span class="dc-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></span>'
          : `<b>${p}<i>%</i></b>`}
      </div>
      <h3>${t}</h3>
      <p>${d}</p>
      <span class="dc-pct ${p === 100 ? "done" : ""}">${p === 100 ? "COMPLETE" : p + "% 진행"}</span>
    </article>`).join("");
}

/* ===== 푸터 SNS ===== */
const SNS = {
  X: '<path d="M4 4l16 16M20 4L4 20" stroke-width="2"/>',
  Instagram: '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1.2" fill="currentColor"/>',
  YouTube: '<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>',
};
const footSns = document.getElementById("footSns");
if (footSns) footSns.innerHTML = Object.entries(SNS).map(([n, p]) =>
  `<a class="sns" href="#" aria-label="${n}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${p}</svg></a>`).join("");

/* ===== 꽃잎 + 별 파티클 ===== */
document.querySelectorAll("[data-petals]").forEach((layer) => {
  const n = +layer.dataset.petals || 14;
  layer.innerHTML = Array.from({ length: n }, () => {
    const s = (8 + Math.random() * 10).toFixed(0);
    return `<i style="left:${(Math.random() * 100).toFixed(1)}%;width:${s}px;height:${(s * 1.3).toFixed(0)}px;
      animation-duration:${(8 + Math.random() * 8).toFixed(1)}s;animation-delay:${(-Math.random() * 12).toFixed(1)}s;
      opacity:${(0.3 + Math.random() * 0.4).toFixed(2)}"></i>`;
  }).join("");
});
document.querySelectorAll("[data-sparkles]").forEach((layer) => {
  const n = +layer.dataset.sparkles || 18;
  layer.innerHTML = Array.from({ length: n }, () => {
    const s = (3 + Math.random() * 5).toFixed(1);
    return `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;
      width:${s}px;height:${s}px;animation-duration:${(2.4 + Math.random() * 3).toFixed(1)}s;
      animation-delay:${(-Math.random() * 4).toFixed(1)}s"></i>`;
  }).join("");
});

/* ===== 선택지 투표 — 어떤 선택이든 "회귀" ===== */
const voteOpts = document.getElementById("voteOpts");
const voteNote = document.getElementById("voteNote");
if (voteOpts) {
  voteOpts.addEventListener("click", (e) => {
    const v = e.target.closest(".vopt");
    if (!v) return;
    voteOpts.querySelectorAll(".vopt").forEach((x) => x.classList.remove("on"));
    v.classList.add("on");
    if (voteNote) { voteNote.classList.remove("rewind"); void voteNote.offsetWidth; voteNote.classList.add("rewind"); }
  });
}

/* ===== 헤더 스크롤 + 모바일 메뉴 ===== */
const hd = document.getElementById("hd");
const onScroll = () => hd.classList.toggle("scrolled", window.scrollY > 30);
onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
const navToggle = document.getElementById("navToggle");
const nav = document.getElementById("nav");
if (navToggle) {
  navToggle.addEventListener("click", () => document.body.classList.toggle("nav-open"));
  nav.addEventListener("click", (e) => { if (e.target.tagName === "A") document.body.classList.remove("nav-open"); });
}

/* ===== 텀블벅 / MVP 신청 외부 링크 ===== */
document.querySelectorAll("[data-launch-link]").forEach((link) => {
  const type = link.dataset.launchLink;
  const url = LAUNCH_LINKS[type];
  const label = type === "producerClub" ? "텀블벅 후원 페이지" : "MVP 테스트 신청 구글폼";

  if (url) {
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return;
  }

  link.addEventListener("click", (e) => {
    e.preventDefault();
    alert(`${label}는 아직 준비 중입니다. 링크가 생기면 바로 연결해둘게요.`);
  });
});

/* ===== 스크롤 등장 ===== */
const io = new IntersectionObserver((es) => es.forEach((en) => {
  if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
}), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* ===== 부드러운 앵커 스크롤 ===== */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href"); if (id.length < 2) return;
    const t = document.querySelector(id); if (!t) return;
    e.preventDefault(); t.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
