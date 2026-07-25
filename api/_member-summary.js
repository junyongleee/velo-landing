const { admin } = require("./_firebase");

const MEMBERS = ["ria", "seoyun", "mina", "hana", "jiwu"];
const SUMMARY_DOC_ID = "member_favorite_summary";

function emptyCounts() {
  return MEMBERS.reduce((counts, memberId) => {
    counts[memberId] = 0;
    return counts;
  }, {});
}

function normalizeCounts(value) {
  if (!value || typeof value !== "object") return null;
  if (MEMBERS.some((memberId) => !Object.prototype.hasOwnProperty.call(value, memberId))) return null;
  return MEMBERS.reduce((counts, memberId) => {
    counts[memberId] = Number(value[memberId] || 0);
    return counts;
  }, {});
}

async function readLegacyCounts(db) {
  const snapshots = await Promise.all(
    MEMBERS.map((memberId) => db.collection("stats").doc(`member_favorite_${memberId}`).get())
  );
  return MEMBERS.reduce((counts, memberId, index) => {
    const snapshot = snapshots[index];
    counts[memberId] = snapshot.exists ? Number(snapshot.data().count || 0) : 0;
    return counts;
  }, {});
}

async function getMemberSummary(db) {
  const summaryRef = db.collection("stats").doc(SUMMARY_DOC_ID);
  const summarySnapshot = await summaryRef.get();
  const summaryCounts = normalizeCounts(summarySnapshot.exists ? summarySnapshot.data().counts : null);
  if (summaryCounts) return summaryCounts;

  const counts = await readLegacyCounts(db);
  await summaryRef.set({
    counts,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return counts || emptyCounts();
}

function setMemberSummaryCount(transaction, db, memberId, count) {
  transaction.set(db.collection("stats").doc(SUMMARY_DOC_ID), {
    counts: { [memberId]: Number(count || 0) },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

module.exports = {
  MEMBERS,
  getMemberSummary,
  setMemberSummaryCount,
};
