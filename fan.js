const POSTS_KEY = "veloFanPosts";
const USER_KEY = "veloFanUserKey";
const NAME_KEY = "veloFanAuthorName";

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
const postBody = document.getElementById("postBody");
const postImage = document.getElementById("postImage");
const imagePreviewWrap = document.getElementById("imagePreviewWrap");
const imagePreview = document.getElementById("imagePreview");
const removeImage = document.getElementById("removeImage");

let draftImage = "";
let draftImageName = "";

function getUserKey() {
  const savedKey = localStorage.getItem(USER_KEY);
  if (savedKey) return savedKey;

  const nextKey = `fan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(USER_KEY, nextKey);
  return nextKey;
}

function getPosts() {
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

function savePosts(posts) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
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

function renderList() {
  const posts = sortPosts(getPosts());
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
}

function renderDetail(id) {
  const post = getPosts().find((candidatePost) => candidatePost.id === id);
  if (!post) {
    renderList();
    return;
  }

  const isOwner = post.ownerKey === userKey;
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
      ${isOwner ? `
        <button class="btn btn-ghost" type="button" data-action="edit" data-id="${escapeHtml(post.id)}">수정</button>
        <button class="btn btn-ghost danger" type="button" data-action="delete" data-id="${escapeHtml(post.id)}">삭제</button>
      ` : `<p>작성한 브라우저에서만 수정/삭제할 수 있습니다.</p>`}
    </div>
  `;
  setView("detail");
}

function resetForm() {
  postId.value = "";
  postTitle.value = "";
  postAuthor.value = localStorage.getItem(NAME_KEY) || "";
  postCategory.value = "자유";
  postBody.value = "";
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

function openEditForm(id) {
  const post = getPosts().find((candidatePost) => candidatePost.id === id);
  if (!post || post.ownerKey !== userKey) return;

  postId.value = post.id;
  postTitle.value = post.title;
  postAuthor.value = post.author;
  postCategory.value = post.category;
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

function handleSubmit(event) {
  event.preventDefault();

  const now = new Date().toISOString();
  const savedName = postAuthor.value.trim();
  const posts = getPosts();
  const editingId = postId.value;
  localStorage.setItem(NAME_KEY, savedName);

  if (editingId) {
    const nextPosts = posts.map((post) => {
      if (post.id !== editingId || post.ownerKey !== userKey) return post;
      return {
        ...post,
        title: postTitle.value.trim(),
        author: savedName,
        category: postCategory.value,
        body: postBody.value.trim(),
        image: draftImage,
        imageName: draftImageName,
        updatedAt: now
      };
    });
    savePosts(nextPosts);
    renderDetail(editingId);
    return;
  }

  const newPost = {
    id: `post-${Date.now()}`,
    title: postTitle.value.trim(),
    category: postCategory.value,
    author: savedName,
    body: postBody.value.trim(),
    image: draftImage,
    imageName: draftImageName,
    ownerKey: userKey,
    createdAt: now,
    updatedAt: now
  };

  savePosts([newPost, ...posts]);
  renderDetail(newPost.id);
}

postList.addEventListener("click", (event) => {
  const row = event.target.closest(".post-row");
  if (!row) return;
  renderDetail(row.dataset.id);
});

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;

  const action = trigger.dataset.action;
  if (action === "list") renderList();
  if (action === "write") openWriteForm();
  if (action === "edit") openEditForm(trigger.dataset.id);
  if (action === "delete") {
    const post = getPosts().find((candidatePost) => candidatePost.id === trigger.dataset.id);
    if (!post || post.ownerKey !== userKey) return;
    const shouldDelete = confirm("이 글을 삭제할까요?");
    if (!shouldDelete) return;
    savePosts(getPosts().filter((candidatePost) => candidatePost.id !== post.id));
    renderList();
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
renderList();
