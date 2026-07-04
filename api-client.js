(function () {
  async function request(path, options = {}) {
    try {
      const response = await fetch(path, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        ...options,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, message: payload.message || "요청에 실패했습니다." };
      return payload;
    } catch {
      return { ok: false, mode: "local", message: "백엔드에 연결할 수 없어 로컬 저장소를 사용합니다." };
    }
  }

  function trackPageView() {
    return request("/api/session", {
      method: "POST",
      body: JSON.stringify({
        pagePath: `${location.pathname}${location.search}${location.hash}`,
      }),
    });
  }

  window.VeloApi = {
    trackPageView,
    listPosts: () => request("/api/posts"),
    createPost: (post) => request("/api/posts", {
      method: "POST",
      body: JSON.stringify(post),
    }),
    updatePost: (id, post) => request(`/api/posts?id=${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(post),
    }),
    deletePost: (id) => request(`/api/posts?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
    getUnlockState: () => request("/api/unlocks"),
    getMemberFavorites: () => request("/api/reactions"),
    setMemberFavorite: (memberId, active) => request("/api/reactions", {
      method: "POST",
      body: JSON.stringify({ memberId, active }),
    }),
  };

  trackPageView();
})();
