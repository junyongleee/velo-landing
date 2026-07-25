const { admin } = require("./_firebase");

const EPISODES = [0, 1, 2, 3, 4, 5, 6, 7];
const SUMMARY_DOC_ID = "story_summary";

function emptyCounts() {
  return EPISODES.reduce((counts, episode) => {
    counts[episode] = 0;
    return counts;
  }, {});
}

function normalizeCounts(value) {
  if (!value || typeof value !== "object") return null;
  return EPISODES.reduce((counts, episode) => {
    counts[episode] = Number(value[episode] || value[String(episode)] || 0);
    return counts;
  }, {});
}

async function readLegacyCounts(db, prefix) {
  const snapshots = await Promise.all(
    EPISODES.map((episode) => db.collection("stats").doc(`story_${prefix}_${episode}`).get())
  );
  return EPISODES.reduce((counts, episode, index) => {
    const snapshot = snapshots[index];
    counts[episode] = snapshot.exists ? Number(snapshot.data().count || 0) : 0;
    return counts;
  }, {});
}

async function getStorySummary(db) {
  const summaryRef = db.collection("stats").doc(SUMMARY_DOC_ID);
  const summarySnapshot = await summaryRef.get();
  const summaryData = summarySnapshot.exists ? summarySnapshot.data() : {};

  let viewCounts = normalizeCounts(summaryData.viewCounts);
  let likeCounts = normalizeCounts(summaryData.likeCounts);
  const shouldRepairViews = !viewCounts;
  const shouldRepairLikes = !likeCounts;

  if (shouldRepairViews || shouldRepairLikes) {
    const [legacyViewCounts, legacyLikeCounts] = await Promise.all([
      shouldRepairViews ? readLegacyCounts(db, "view") : Promise.resolve(null),
      shouldRepairLikes ? readLegacyCounts(db, "like") : Promise.resolve(null),
    ]);

    viewCounts = legacyViewCounts || viewCounts || emptyCounts();
    likeCounts = legacyLikeCounts || likeCounts || emptyCounts();

    await summaryRef.set({
      viewCounts,
      likeCounts,
      repairedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return {
    viewCounts: viewCounts || emptyCounts(),
    likeCounts: likeCounts || emptyCounts(),
  };
}

function setStorySummaryCount(transaction, db, type, episode, count) {
  const summaryRef = db.collection("stats").doc(SUMMARY_DOC_ID);
  const field = type === "view" ? "viewCounts" : "likeCounts";
  transaction.set(summaryRef, {
    [field]: {
      [String(episode)]: Number(count || 0),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

module.exports = {
  EPISODES,
  getStorySummary,
  setStorySummaryCount,
};
