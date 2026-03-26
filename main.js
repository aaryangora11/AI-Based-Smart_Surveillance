/* ============================================================
   Planner Bidding System — Main JS
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Tab Filtering ── */
  const tabs = document.querySelectorAll('.tab');
  const cards = document.querySelectorAll('.bid-card');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab style
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const filter = tab.dataset.tab; // "pending" | "accepted" | "declined"

      cards.forEach(card => {
        const status = card.dataset.status; // "pending" | "accepted" | "declined"
        if (filter === status || filter === 'pending' && status === 'pending') {
          card.classList.remove('hidden');
        } else if (filter === status) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });

      // Simple match: show cards whose data-status equals the tab
      cards.forEach(card => {
        card.classList.toggle('hidden', card.dataset.status !== filter);
      });
    });
  });

  /* ── Accept / Decline Actions ── */
  document.getElementById('cards-container').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-accept, .btn-reject');
    if (!btn) return;

    const cardId = btn.dataset.card;
    const action = btn.dataset.action; // "accepted" | "declined"
    const card   = document.getElementById(cardId);

    if (!card || card.dataset.status !== 'pending') return;

    // Update card state
    applyCardStatus(card, action);

    // Update tab counts
    updateCounts();

    // Show feedback toast
    const msg = action === 'accepted'
      ? '🎉 Bid accepted! The couple will be notified.'
      : 'Bid declined. They will be notified.';
    showToast(msg);
  });

  /* ── Apply status to a card ── */
  function applyCardStatus(card, status) {
    // Remove previous status classes
    card.classList.remove('accepted', 'declined');

    // Remove existing ribbon if any
    const oldRibbon = card.querySelector('.status-ribbon');
    if (oldRibbon) oldRibbon.remove();

    // Set new state
    card.dataset.status = status;
    card.classList.add(status);

    // Add status ribbon
    const ribbon = document.createElement('div');
    ribbon.className = `status-ribbon ribbon-${status}`;
    ribbon.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    card.appendChild(ribbon);

    // Disable accept / reject buttons
    card.querySelectorAll('.btn-accept, .btn-reject').forEach(b => {
      b.disabled = true;
    });
  }

  /* ── Update tab counts ── */
  function updateCounts() {
    const allCards = document.querySelectorAll('.bid-card');
    const counts = { pending: 0, accepted: 0, declined: 0 };

    allCards.forEach(c => {
      const s = c.dataset.status;
      if (counts[s] !== undefined) counts[s]++;
    });

    tabs.forEach(tab => {
      const countEl = tab.querySelector('.count');
      if (!countEl) return;
      const key = tab.dataset.tab;
      const n = counts[key] ?? 0;
      countEl.textContent = n;
      countEl.style.display = n === 0 ? 'none' : 'inline-flex';
    });
  }

  /* ── Toast notification ── */
  let toastTimer = null;
  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

});
