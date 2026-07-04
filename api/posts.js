const crypto = require("crypto");
const {
  CATEGORY_LABELS,
  admin,
  categoryToId,
  cleanString,
  ensureUser,
  readJson,
  recordEvent,
  sendJson,
  syncStoryUnlocks,
  toIso,
} = require("./_firebase");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function normalizePost(doc, currentUserId = "") {
  const data = doc.data();
  const isOwner = data.ownerUserId === currentUserId;
  return {
    id: doc.id,
    title: data.title || "",
    category: CATEGORY_LABELS[data.categoryId] || "자유",
    categoryId: data.categoryId || "free",
    author: data.authorName || "익명 프로듀서",
    body: data.body || "",
    image: data.imageUrl || "",
    imageName: data.imageOriginalName || "",
    ownerKey: isOwner ? data.ownerUserId : "",
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt || data.createdAt),
  };
}

function parseDataUrl(dataUrl) {
  if (!dataUrl) return null;
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (!contentType.startsWith("image/")) throw new Error("이미지 파일만 첨부할 수 있습니다.");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("이미지는 5MB 이하만 첨부할 수 있습니다.");
  return { contentType, buffer };
}

async function uploadImage(bucket, userId, postId, imageName, imageData) {
  const parsedImage = parseDataUrl(imageData);
  if (!parsedImage) return { imageUrl: "", imageStoragePath: "", imageOriginalName: "" };

  const safeName = cleanString(imageName || "upload.png", 120).replace(/[^\w.\-가-힣]/g, "_");
  const token = crypto.randomUUID();
  const storagePath = `post-images/${userId}/${postId}/${Date.now()}-${safeName}`;
  const file = bucket.file(storagePath);

  await file.save(parsedImage.buffer, {
    resumable: false,
    metadata: {
      contentType: parsedImage.contentType,
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  return {
    imageUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`,
    imageStoragePath: storagePath,
    imageOriginalName: safeName,
  };
}

async function listPosts(db, userId) {
  const snapshot = await db.collection("posts")
    .where("isDeleted", "==", false)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  return snapshot.docs.map((doc) => normalizePost(doc, userId));
}

module.exports = async function handler(req, res) {
  try {
    const { userId, firebase } = await ensureUser(req, res);
    if (!firebase) {
      sendJson(res, 200, { ok: false, mode: "local", posts: [], reason: "Firebase 환경변수가 아직 설정되지 않았습니다." });
      return;
    }

    const { db, bucket } = firebase;
    const id = cleanString(req.query.id, 120);

    if (req.method === "GET") {
      sendJson(res, 200, { ok: true, posts: await listPosts(db, userId), userId });
      return;
    }

    if (req.method === "POST") {
      const payload = await readJson(req);
      const postRef = db.collection("posts").doc();
      const image = await uploadImage(bucket, userId, postRef.id, payload.imageName, payload.image);
      const now = admin.firestore.FieldValue.serverTimestamp();
      const categoryId = categoryToId(payload.category);

      await postRef.set({
        title: cleanString(payload.title, 120),
        body: cleanString(payload.body, 10000),
        categoryId,
        authorName: cleanString(payload.author, 40) || "익명 프로듀서",
        ownerUserId: userId,
        imageUrl: image.imageUrl,
        imageStoragePath: image.imageStoragePath,
        imageOriginalName: image.imageOriginalName,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });

      await recordEvent(db, userId, "post_created", "post", postRef.id, { categoryId });
      const unlockState = categoryId === "review" ? await syncStoryUnlocks(db, userId, postRef.id) : null;
      const savedPost = await postRef.get();
      sendJson(res, 201, { ok: true, post: normalizePost(savedPost, userId), unlockState });
      return;
    }

    if (req.method === "PUT" || req.method === "PATCH") {
      if (!id) {
        sendJson(res, 400, { ok: false, message: "수정할 글 ID가 필요합니다." });
        return;
      }

      const postRef = db.collection("posts").doc(id);
      const post = await postRef.get();
      if (!post.exists || post.data().ownerUserId !== userId) {
        sendJson(res, 403, { ok: false, message: "작성자만 수정할 수 있습니다." });
        return;
      }

      const payload = await readJson(req);
      const current = post.data();
      const image = payload.image
        ? await uploadImage(bucket, userId, id, payload.imageName, payload.image)
        : {
            imageUrl: payload.image === "" ? "" : current.imageUrl || "",
            imageStoragePath: payload.image === "" ? "" : current.imageStoragePath || "",
            imageOriginalName: payload.image === "" ? "" : current.imageOriginalName || "",
          };
      const categoryId = categoryToId(payload.category);

      await postRef.update({
        title: cleanString(payload.title, 120),
        body: cleanString(payload.body, 10000),
        categoryId,
        authorName: cleanString(payload.author, 40) || "익명 프로듀서",
        imageUrl: image.imageUrl,
        imageStoragePath: image.imageStoragePath,
        imageOriginalName: image.imageOriginalName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await recordEvent(db, userId, "post_updated", "post", id, { categoryId });
      const unlockState = categoryId === "review" ? await syncStoryUnlocks(db, userId, id) : null;
      const savedPost = await postRef.get();
      sendJson(res, 200, { ok: true, post: normalizePost(savedPost, userId), unlockState });
      return;
    }

    if (req.method === "DELETE") {
      if (!id) {
        sendJson(res, 400, { ok: false, message: "삭제할 글 ID가 필요합니다." });
        return;
      }

      const postRef = db.collection("posts").doc(id);
      const post = await postRef.get();
      if (!post.exists || post.data().ownerUserId !== userId) {
        sendJson(res, 403, { ok: false, message: "작성자만 삭제할 수 있습니다." });
        return;
      }

      await postRef.update({
        isDeleted: true,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await recordEvent(db, userId, "post_deleted", "post", id);
      await syncStoryUnlocks(db, userId);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { ok: false, message: "지원하지 않는 요청입니다." });
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error.message });
  }
};
