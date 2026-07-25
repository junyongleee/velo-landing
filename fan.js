const POSTS_KEY = "veloFanPosts";
const REMOTE_POSTS_CACHE_KEY = "veloRemotePostsCache";
const MIGRATED_LOCAL_POSTS_KEY = "veloMigratedLocalPostIds";
const REMOTE_POST_PASSWORDS_KEY = "veloRemotePostPasswords";
const USER_KEY = "veloFanUserKey";
const NAME_KEY = "veloFanAuthorName";
const PENDING_UNLOCK_KEY = "veloPendingUnlockEpisode";
const FAN_MAX_UNLOCKED_EPISODE_KEY = "veloMaxUnlockedEpisode";
const ADMIN_TOKEN_KEY = "veloAdminToken";

const seedPosts = [
  {
    id: "seed-1",
    title: "서윤 티저 컷에서 손 모양 봤어요?",
    category: "세계관 해석",
    author: "루프탐정",
    body: "두 번째 티저의 손 모양이 지난 공지 이미지의 문양이랑 닮아 보여요. 혹시 선택지가 반복되는 조건이 멤버별 제스처와 관련 있는 걸까요?",
    image: "",
    imageName: "",
    ownerKey: "seed",
    createdAt: "2026-06-28T10:00:00.000Z",
    updatedAt: "2026-06-28T10:00:00.000Z"
  },
  {
    id: "seed-2",
    title: "MVP 테스트 열리면 리듬게임 난이도부터 보고 싶어요",
    category: "후기",
    author: "초기프로듀서",
    body: "스토리도 궁금하지만 첫 플레이에서는 노트 판정감이 제일 궁금합니다. 오컬트 분위기랑 리듬 파트가 어떻게 이어질지도 기대돼요.",
    image: "",
    imageName: "",
    ownerKey: "seed",
    createdAt: "2026-06-27T12:30:00.000Z",
    updatedAt: "2026-06-27T12:30:00.000Z"
  },
  {
    id: "seed-3",
    title: "팬아트 올릴 때 말머리 있으면 좋겠어요",
    category: "팬아트",
    author: "별조각",
    body: "팬아트, 세계관 해석, 테스트 후기처럼 말머리가 있으면 나중에 글을 찾기 편할 것 같아요.",
    image: "",
    imageName: "",
    ownerKey: "seed",
    createdAt: "2026-06-26T09:15:00.000Z",
    updatedAt: "2026-06-26T09:15:00.000Z"
  }
];

const userKey = getUserKey();
const postList = document.getElementById("postList");
const emptyBoard = document.getElementById("emptyBoard");
const listView = document.getElementById("boardListView");
const detailView = document.getElementById("postDetailView");
const postForm = document.getElementById("postForm");
const postId = document.getElementById("postId");
const postTitle = document.getElementById("postTitle");
const postAuthor = document.getElementById("postAuthor");
const postCategory = document.getElementById("postCategory");
const postPassword = document.getElementById("postPassword");
const postBody = document.getElementById("postBody");
const postImage = document.getElementById("postImage");
const imagePreviewWrap = document.getElementById("imagePreviewWrap");
const imagePreview = document.getElementById("imagePreview");
const removeImage = document.getElementById("removeImage");

let draftImage = "";
let draftImageName = "";
let cachedPosts = null;
let useRemotePosts = false;
let migrationPromptShown = false;

function getAdminToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("admin");
  if (token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    return token;
  }
  return localStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

function getUserKey() {
  const savedKey = localStorage.getItem(USER_KEY);
  if (savedKey) return savedKey;

  const nextKey = `fan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(USER_KEY, nextKey);
  return nextKey;
}

function getLocalPosts() {
  const savedPosts = localStorage.getItem(POSTS_KEY);
  if (!savedPosts) {
    localStorage.setItem(POSTS_KEY, JSON.stringify(seedPosts));
    return [...seedPosts];
  }

  try {
    const parsedPosts = JSON.parse(savedPosts);
    return Array.isArray(parsedPosts) ? parsedPosts : [...seedPosts];
  } catch {
    return [...seedPosts];
  }
}

function saveLocalPosts(posts) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
}

function getRemotePostsCache() {
  try {
    const parsedPosts = JSON.parse(localStorage.getItem(REMOTE_POSTS_CACHE_KEY) || "[]");
    return Array.isArray(parsedPosts) ? parsedPosts : [];
  } catch {
    return [];
  }
}

function saveRemotePostsCache(posts) {
  localStorage.setItem(REMOTE_POSTS_CACHE_KEY, JSON.stringify(posts));
}

function getMigratedLocalPostIds() {
  try {
    const parsedIds = JSON.parse(localStorage.getItem(MIGRATED_LOCAL_POSTS_KEY) || "[]");
    return new Set(Array.isArray(parsedIds) ? parsedIds : []);
  } catch {
    return new Set();
  }
}

function saveMigratedLocalPostIds(ids) {
  localStorage.setItem(MIGRATED_LOCAL_POSTS_KEY, JSON.stringify([...ids]));
}

function getRemotePostPasswords() {
  try {
    const parsedPasswords = JSON.parse(localStorage.getItem(REMOTE_POST_PASSWORDS_KEY) || "{}");
    return parsedPasswords && typeof parsedPasswords === "object" ? parsedPasswords : {};
  } catch {
    return {};
  }
}

function saveRemotePostPassword(postId, password) {
  if (!postId || !password) return;
  const passwords = getRemotePostPasswords();
  passwords[postId] = password;
  localStorage.setItem(REMOTE_POST_PASSWORDS_KEY, JSON.stringify(passwords));
}

function getRemotePostPassword(postId) {
  return getRemotePostPasswords()[postId] || "";
}

function createMigrationPassword(post) {
  if (window.crypto?.randomUUID) return `restored-${window.crypto.randomUUID()}`;
  return `restored-${post.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isSeedPost(post) {
  return post.ownerKey === "seed" || String(post.id || "").startsWith("seed-");
}

function getMigratableLocalPosts(remotePosts = []) {
  const migratedIds = getMigratedLocalPostIds();
  return getLocalPosts().filter((post) => {
    if (isSeedPost(post) || migratedIds.has(post.id)) return false;
    return !remotePosts.some((remotePost) =>
      remotePost.title === post.title &&
      remotePost.body === post.body &&
      remotePost.author === post.author
    );
  });
}

async function maybeMigrateLocalPosts(remotePosts = []) {
  if (migrationPromptShown || !window.VeloApi) return null;
  const localPosts = getMigratableLocalPosts(remotePosts);
  if (!localPosts.length) return null;

  migrationPromptShown = true;
  const migratedIds = getMigratedLocalPostIds();
  const migratedPosts = [];
  for (const post of localPosts) {
    const password = createMigrationPassword(post);
    const response = await window.VeloApi.createPost({
      title: post.title,
      category: post.category,
      author: post.author,
      password,
      body: post.body,
      image: post.image || "",
      imageName: post.imageName || "",
    });
    if (!response?.ok) break;
    migratedIds.add(post.id);
    migratedPosts.push(response.post);
    saveRemotePostPassword(response.post?.id, password);
    if (response.unlockState?.maxUnlockedEpisode) rememberUnlockedEpisode(response.unlockState.maxUnlockedEpisode);
  }

  saveMigratedLocalPostIds(migratedIds);
  if (!migratedPosts.length) return null;
  const refreshed = await window.VeloApi.listPosts();
  if (refreshed?.ok) {
    useRemotePosts = true;
    cachedPosts = refreshed.posts || migratedPosts;
    saveRemotePostsCache(cachedPosts);
    return cachedPosts;
  }
  return [...migratedPosts, ...remotePosts];
}

function createLocalSalt() {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function hashLocalPassword(password, salt) {
  const text = `${salt}:${password}`;
  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return btoa(unescape(encodeURIComponent(text)));
}

async function createLocalPasswordRecord(password) {
  const postPasswordSalt = createLocalSalt();
  return {
    postPasswordSalt,
    postPasswordHash: await hashLocalPassword(password, postPasswordSalt),
  };
}

async function verifyLocalPostPassword(post, password) {
  if (!post.postPasswordHash || !post.postPasswordSalt) return post.ownerKey === userKey;
  return await hashLocalPassword(password, post.postPasswordSalt) === post.postPasswordHash;
}

function rememberUnlockedEpisode(maxUnlockedEpisode) {
  const current = Number(localStorage.getItem(FAN_MAX_UNLOCKED_EPISODE_KEY) || 5);
  const next = Math.max(current, Number(maxUnlockedEpisode || 5));
  localStorage.setItem(FAN_MAX_UNLOCKED_EPISODE_KEY, String(Math.min(7, next)));
}

function rememberLocalReviewUnlock(posts) {
  const reviewCount = getReviewCount(posts);
  if (reviewCount >= 1) rememberUnlockedEpisode(6);
}

function getFastPosts() {
  if (cachedPosts) return cachedPosts;
  const remoteCache = getRemotePostsCache();
  if (remoteCache.length) {
    useRemotePosts = true;
    cachedPosts = remoteCache;
    return cachedPosts;
  }

  useRemotePosts = false;
  cachedPosts = getLocalPosts();
  return cachedPosts;
}

async function loadPosts() {
  if (window.VeloApi) {
    const response = await window.VeloApi.listPosts();
    if (response?.ok) {
      const migratedPosts = await maybeMigrateLocalPosts(response.posts || []);
      if (migratedPosts) return migratedPosts;

      const fallbackPosts = cachedPosts || getRemotePostsCache();
      const localPosts = getLocalPosts();
      if ((!response.posts || response.posts.length === 0) && fallbackPosts.length > 0) {
        useRemotePosts = true;
        cachedPosts = fallbackPosts;
        return cachedPosts;
      }
      if ((!response.posts || response.posts.length === 0) && localPosts.length > 0) {
        useRemotePosts = false;
        cachedPosts = localPosts;
        return cachedPosts;
      }

      useRemotePosts = true;
      cachedPosts = response.posts;
      saveRemotePostsCache(response.posts);
      return cachedPosts;
    }
  }

  if (cachedPosts) return cachedPosts;
  useRemotePosts = false;
  cachedPosts = getLocalPosts();
  return cachedPosts;
}

function getCachedPosts() {
  return cachedPosts || getLocalPosts();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function sortPosts(posts) {
  return [...posts].sort((leftPost, rightPost) => new Date(rightPost.createdAt) - new Date(leftPost.createdAt));
}

function setView(viewName) {
  listView.classList.toggle("hidden", viewName !== "list");
  detailView.classList.toggle("hidden", viewName !== "detail");
  postForm.classList.toggle("hidden", viewName !== "form");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function renderList() {
  const posts = sortPosts(getFastPosts());
  emptyBoard.classList.toggle("hidden", posts.length > 0);
  postList.innerHTML = posts.map((post) => `
    <button class="post-row" type="button" data-id="${escapeHtml(post.id)}">
      <span class="post-title">
        <b>${escapeHtml(post.title)}</b>
        <small>${escapeHtml(post.category)}${post.image ? " · 이미지" : ""}</small>
      </span>
      <span>${escapeHtml(post.author)}</span>
      <time>${formatDate(post.createdAt)}</time>
    </button>
  `).join("");
  setView("list");

  if (!window.VeloApi) return;
  const remotePosts = sortPosts(await loadPosts());
  if (listView.classList.contains("hidden")) return;
  emptyBoard.classList.toggle("hidden", remotePosts.length > 0);
  postList.innerHTML = remotePosts.map((post) => `
    <button class="post-row" type="button" data-id="${escapeHtml(post.id)}">
      <span class="post-title">
        <b>${escapeHtml(post.title)}</b>
        <small>${escapeHtml(post.category)}${post.image ? " · 이미지" : ""}</small>
      </span>
      <span>${escapeHtml(post.author)}</span>
      <time>${formatDate(post.createdAt)}</time>
    </button>
  `).join("");
}

function renderDetail(id) {
  const post = getCachedPosts().find((candidatePost) => candidatePost.id === id);
  if (!post) {
    renderList();
    return;
  }

  const canManage = post.ownerKey !== "seed";
  const adminToken = getAdminToken();
  const adminActions = useRemotePosts && adminToken ? `
    <span class="admin-tools-label">관리자 모드</span>
    <button class="btn btn-ghost danger" type="button" data-action="admin-delete" data-id="${escapeHtml(post.id)}">관리자 삭제</button>
    <button class="btn btn-ghost danger" type="button" data-action="admin-block" data-id="${escapeHtml(post.id)}">작성자 차단</button>
  ` : "";
  detailView.innerHTML = `
    <div class="detail-top">
      <button class="back-link" type="button" data-action="list">← 목록으로</button>
      <span class="post-chip">${escapeHtml(post.category)}</span>
    </div>
    <h2>${escapeHtml(post.title)}</h2>
    <div class="detail-meta">
      <span>${escapeHtml(post.author)}</span>
      <time>${formatDate(post.createdAt)}</time>
      ${post.updatedAt !== post.createdAt ? "<span>수정됨</span>" : ""}
    </div>
    ${post.image ? `<figure class="detail-image"><img src="${post.image}" alt="${escapeHtml(post.imageName || "첨부 이미지")}"></figure>` : ""}
    <div class="detail-body">${escapeHtml(post.body).replaceAll("\n", "<br>")}</div>
    <div class="detail-actions">
      ${useRemotePosts ? `<button class="btn btn-ghost" type="button" data-action="report" data-id="${escapeHtml(post.id)}">신고</button>` : ""}
      ${canManage ? `
        <button class="btn btn-ghost" type="button" data-action="edit" data-id="${escapeHtml(post.id)}">수정</button>
        <button class="btn btn-ghost danger" type="button" data-action="delete" data-id="${escapeHtml(post.id)}">삭제</button>
      ` : `<p>기본 예시 글은 수정/삭제할 수 없습니다.</p>`}
      ${adminActions}
    </div>
  `;
  setView("detail");
}

function resetForm() {
  postId.value = "";
  postTitle.value = "";
  postTitle.placeholder = "제목을 입력하세요";
  postAuthor.value = localStorage.getItem(NAME_KEY) || "";
  postCategory.value = "자유";
  postPassword.value = "";
  postPassword.placeholder = "이 글을 수정하거나 삭제할 때 사용할 비밀번호";
  postBody.value = "";
  postBody.placeholder = "상세 글은 글을 눌렀을 때만 보입니다.";
  postImage.value = "";
  draftImage = "";
  draftImageName = "";
  updateImagePreview();
}

function openWriteForm() {
  resetForm();
  setView("form");
  postTitle.focus();
}

function openReviewForm() {
  const pendingEpisode = localStorage.getItem(PENDING_UNLOCK_KEY);
  resetForm();
  postCategory.value = "감상글";
  postTitle.value = pendingEpisode ? `${pendingEpisode}화 감상글` : "";
  postTitle.placeholder = "프롤로그 감상글 제목";
  postBody.placeholder = "읽고 난 느낌, 궁금한 단서, 응원 메시지를 남겨주세요.";
  setView("form");
  postBody.focus();
}

function getReviewCount(posts) {
  return posts.filter((post) => post.ownerKey === userKey && post.category === "감상글").length;
}

function shouldOpenUnlockedEpisode(posts) {
  const pendingEpisode = Number(localStorage.getItem(PENDING_UNLOCK_KEY));
  if (!pendingEpisode) return false;
  if (pendingEpisode !== 6) return false;

  const reviewCount = getReviewCount(posts);
  return reviewCount >= 1;
}

function openEditForm(id) {
  const post = getCachedPosts().find((candidatePost) => candidatePost.id === id);
  if (!post) return;

  postId.value = post.id;
  postTitle.value = post.title;
  postAuthor.value = post.author;
  postCategory.value = post.category;
  postPassword.value = getRemotePostPassword(post.id);
  postPassword.placeholder = "작성 시 입력했던 비밀번호";
  postBody.value = post.body;
  postImage.value = "";
  draftImage = post.image || "";
  draftImageName = post.imageName || "";
  updateImagePreview();
  setView("form");
  postTitle.focus();
}

function updateImagePreview() {
  imagePreviewWrap.classList.toggle("hidden", !draftImage);
  if (draftImage) imagePreview.src = draftImage;
}

async function saveRemotePost(editingId, payload) {
  if (!window.VeloApi) return null;
  return editingId
    ? window.VeloApi.updatePost(editingId, payload)
    : window.VeloApi.createPost(payload);
}

async function handleSubmit(event) {
  event.preventDefault();

  const now = new Date().toISOString();
  const savedName = postAuthor.value.trim();
  const editingId = postId.value;
  localStorage.setItem(NAME_KEY, savedName);

  const payload = {
    title: postTitle.value.trim(),
    category: postCategory.value,
    author: savedName,
    password: postPassword.value,
    body: postBody.value.trim(),
    image: draftImage,
    imageName: draftImageName,
  };

  if (useRemotePosts) {
    if (editingId && !payload.password) payload.password = getRemotePostPassword(editingId);
    const response = await saveRemotePost(editingId, payload);
    if (response?.ok) {
      saveRemotePostPassword(response.post?.id || editingId, payload.password);
      if (response.unlockState?.maxUnlockedEpisode) rememberUnlockedEpisode(response.unlockState.maxUnlockedEpisode);
      if (payload.category === "감상글" && response.unlockState && shouldOpenRemoteUnlockedEpisode(response.unlockState)) {
        const pendingEpisode = localStorage.getItem(PENDING_UNLOCK_KEY);
        localStorage.removeItem(PENDING_UNLOCK_KEY);
        window.location.href = `story.html?episode=${pendingEpisode}`;
        return;
      }
      cachedPosts = await loadPosts();
      renderDetail(response.post.id);
      return;
    }

    alert(response?.message || "저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  const posts = getLocalPosts();
  if (editingId) {
    const currentPost = posts.find((post) => post.id === editingId);
    if (!currentPost || !(await verifyLocalPostPassword(currentPost, payload.password))) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }

    const nextPosts = posts.map((post) => {
      if (post.id !== editingId) return post;
      return {
        ...post,
        ...payload,
        password: undefined,
        updatedAt: now
      };
    });
    saveLocalPosts(nextPosts);
    cachedPosts = nextPosts;
    rememberLocalReviewUnlock(nextPosts);
    renderDetail(editingId);
    return;
  }

  const passwordRecord = await createLocalPasswordRecord(payload.password);
  const newPost = {
    id: `post-${Date.now()}`,
    ...payload,
    password: undefined,
    ...passwordRecord,
    ownerKey: userKey,
    createdAt: now,
    updatedAt: now
  };

  const nextPosts = [newPost, ...posts];
  saveLocalPosts(nextPosts);
  cachedPosts = nextPosts;
  rememberLocalReviewUnlock(nextPosts);
  if (newPost.category === "감상글" && shouldOpenUnlockedEpisode(nextPosts)) {
    const pendingEpisode = localStorage.getItem(PENDING_UNLOCK_KEY);
    localStorage.removeItem(PENDING_UNLOCK_KEY);
    window.location.href = `story.html?episode=${pendingEpisode}`;
    return;
  }
  renderDetail(newPost.id);
}

function shouldOpenRemoteUnlockedEpisode(unlockState) {
  const pendingEpisode = Number(localStorage.getItem(PENDING_UNLOCK_KEY));
  return Boolean(pendingEpisode && unlockState.maxUnlockedEpisode >= pendingEpisode);
}

postList.addEventListener("click", (event) => {
  const row = event.target.closest(".post-row");
  if (!row) return;
  renderDetail(row.dataset.id);
});

document.addEventListener("click", async (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;

  const action = trigger.dataset.action;
  if (action === "list") renderList();
  if (action === "write") openWriteForm();
  if (action === "edit") openEditForm(trigger.dataset.id);
  if (action === "report") {
    if (!useRemotePosts || !window.VeloApi) return;
    const reason = prompt("신고 사유를 간단히 적어주세요.", "스팸/도배");
    if (!reason) return;
    const response = await window.VeloApi.reportPost(trigger.dataset.id, { reason });
    alert(response?.ok ? "신고가 접수되었습니다." : response?.message || "신고 접수에 실패했습니다.");
  }
  if (action === "admin-delete") {
    const adminToken = getAdminToken();
    if (!adminToken || !window.VeloApi) return;
    const reason = prompt("관리자 삭제 사유를 적어주세요.", "운영 정책 위반");
    if (!reason) return;
    const shouldDelete = confirm("관리자 권한으로 이 글을 숨길까요?");
    if (!shouldDelete) return;
    const response = await window.VeloApi.adminDeletePost(trigger.dataset.id, adminToken, reason);
    if (!response?.ok) {
      alert(response?.message || "관리자 삭제에 실패했습니다.");
      return;
    }
    await renderList();
  }
  if (action === "admin-block") {
    const adminToken = getAdminToken();
    if (!adminToken || !window.VeloApi) return;
    const reason = prompt("작성자 차단 사유를 적어주세요.", "도배/악성 게시물");
    if (!reason) return;
    const shouldBlock = confirm("작성자를 차단하고 기존 글도 숨길까요?");
    if (!shouldBlock) return;
    const response = await window.VeloApi.adminBlockPostAuthor(trigger.dataset.id, adminToken, reason);
    if (!response?.ok) {
      alert(response?.message || "작성자 차단에 실패했습니다.");
      return;
    }
    await renderList();
  }
  if (action === "delete") {
    const post = getCachedPosts().find((candidatePost) => candidatePost.id === trigger.dataset.id);
    if (!post) return;
    const shouldDelete = confirm("이 글을 삭제할까요?");
    if (!shouldDelete) return;
    const savedPassword = getRemotePostPassword(post.id);
    const password = savedPassword || prompt("작성 시 입력한 수정/삭제 비밀번호를 입력해주세요.");
    if (password === null) return;
    if (!password) {
      alert("비밀번호를 입력해주세요.");
      return;
    }

    if (useRemotePosts && window.VeloApi) {
      const response = await window.VeloApi.deletePost(post.id, password);
      if (!response?.ok) {
        alert(response?.message || "삭제에 실패했습니다.");
        return;
      }
      await renderList();
      return;
    }

    if (!(await verifyLocalPostPassword(post, password))) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }
    saveLocalPosts(getLocalPosts().filter((candidatePost) => candidatePost.id !== post.id));
    await renderList();
  }
});

postImage.addEventListener("change", () => {
  const imageFile = postImage.files?.[0];
  if (!imageFile) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    draftImage = String(reader.result || "");
    draftImageName = imageFile.name;
    updateImagePreview();
  });
  reader.readAsDataURL(imageFile);
});

removeImage.addEventListener("click", () => {
  draftImage = "";
  draftImageName = "";
  postImage.value = "";
  updateImagePreview();
});

postForm.addEventListener("submit", handleSubmit);
if (window.location.hash === "#write-review") openReviewForm();
else renderList();
