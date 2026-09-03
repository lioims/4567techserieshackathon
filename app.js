// SaveWiser - renderer application
//
// Plain-JS single-page app (no framework/build step -- keeps `npm start`
// down to just installing Electron). Talks to the main process only
// through window.savewiser (see preload.js); never touches Node directly.
//
// Rendering architecture: the DOM has three independent, persistent
// regions -- #sw-shell (topbar + current page + bottom nav), #sw-overlay
// (Singpass modal / log-savings sheet / search sheet), and #sw-toast.
// Each is updated ONLY when its own state changes. Earlier builds rebuilt
// the entire app on every click/keystroke and relied on a CSS @keyframes
// animation on `.page` to "fade in" -- since that keyframe replayed on
// every single re-render (including ones unrelated to navigation, like
// typing in search or a toast appearing), it looked like the whole screen
// flashing. Keeping the regions separate, and animating shell swaps with a
// JS-driven opacity/transform transition instead of a keyframe, means nav
// transitions stay smooth on purpose while everything else updates
// instantly with no flash.

(function () {
  const M = window.SaveWiserMock;
  const api = window.savewiser;

  // ---------------------------------------------------------------------
  // Icons (small inline SVGs, feather-style). Explicit width/height keep
  // every icon a small, consistent size regardless of where it's dropped
  // in -- nothing here should ever render at an SVG's unconstrained
  // default size.
  // ---------------------------------------------------------------------
  const ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v6h-6"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.6l2.1 11.4a2 2 0 0 0 2 1.6h8.1a2 2 0 0 0 2-1.6L21 7H6"/></svg>',
    car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16V11l2.2-5.2A2 2 0 0 1 7 4.6h10a2 2 0 0 1 1.8 1.2L21 11v5"/><path d="M3 16h18v2.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V17H6.5v1.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><circle cx="7.5" cy="13.5" r="1.3"/><circle cx="16.5" cy="13.5" r="1.3"/></svg>',
    utensils: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v7a2 2 0 0 0 2 2v9M6 3v7M9 3v7M6 10h3M17 3c-1.7 0-3 2-3 5s1.3 5 3 5v8"/></svg>',
    film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M3 9h18M3 15h18M8 4.5v15M16 4.5v15"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  };
  function icon(name, size) {
    const svg = ICON[name];
    if (!svg) return "";
    const s = size || 16;
    return svg.replace("<svg ", `<svg width="${s}" height="${s}" `);
  }
  // The topbar mark: the app's own logo image when bundled, else a plain
  // "SW" monogram fallback so the app never ships a broken <img>.
  function brandMarkHtml() {
    return `<img src="assets/logo-64.png" alt="SaveWiser" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'SW',style:'font-weight:800;font-size:10px;color:var(--sw-blue)'}))" />`;
  }

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const S = {
    route: "home",
    dealsTab: "all",
    deals: { government: [], supermarket: [], amenities: [], loading: false, error: null, lastRun: null },
    singpass: { loggedIn: false, name: "", nric: "" },
    subscriptions: {},
    recentActivity: [],
    usedDeals: [],
    singpassStage: "idle", // idle | scanning | success
    expandedAnnouncement: null,
    searchOpen: false,
    searchQuery: "",
    logSheetOpen: false,
    budgetCategories: [],
    expenseLogs: [],
    expenseCategoryId: null,
  };

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function monthLabel(iso) {
    return new Date(iso + "T00:00:00").toLocaleString("en-SG", { month: "short" });
  }
  function fmtMoney(n) {
    return "$" + Number(n || 0).toLocaleString("en-SG", { maximumFractionDigits: 2 });
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------------------------------------------------------------------
  // Boot / persistence
  // ---------------------------------------------------------------------
  async function boot() {
    document.documentElement.classList.add(api.platform === "darwin" ? "platform-mac" : "platform-other");
    buildStaticShell();

    const persisted = await api.getState();
    Object.assign(S, {
      singpass: persisted.singpass || S.singpass,
      subscriptions: persisted.subscriptions || {},
      recentActivity: persisted.recentActivity && persisted.recentActivity.length ? persisted.recentActivity : M.seedRecentActivity(),
      budgetCategories: persisted.budgetCategories && persisted.budgetCategories.length ? persisted.budgetCategories : M.seedBudgetCategories(),
      expenseLogs: persisted.expenseLogs && persisted.expenseLogs.length ? persisted.expenseLogs : M.seedExpenseLogs(),
    });

    if (!persisted.recentActivity || !persisted.recentActivity.length) {
      await api.patchState({ recentActivity: S.recentActivity });
    }
    if (!persisted.budgetCategories || !persisted.budgetCategories.length) {
      await api.patchState({ budgetCategories: S.budgetCategories });
    }
    if (!persisted.expenseLogs || !persisted.expenseLogs.length) {
      await api.patchState({ expenseLogs: S.expenseLogs });
    }

    S.expenseCategoryId = S.budgetCategories.length ? S.budgetCategories[0].id : null;

    renderPage("none");
    loadDeals(true);
  }

  async function loadDeals(silent) {
    S.deals.loading = true;
    S.deals.error = null;
    if (!silent) renderPage("soft");
    try {
      const result = await api.runScraper({ demo: true });
      S.deals.government = (result.government && result.government.deals) || [];
      S.deals.supermarket = (result.supermarket && result.supermarket.deals) || [];
      S.deals.amenities = (result.amenities && result.amenities.deals) || [];
      S.deals.lastRun = new Date();
    } catch (err) {
      S.deals.error = err.message || String(err);
    } finally {
      S.deals.loading = false;
      renderPage("soft");
    }
  }

  // ---------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------
  function allDeals() {
    return [
      ...S.deals.amenities.map((d) => ({ ...d, category: "amenities" })),
      ...S.deals.supermarket.map((d) => ({ ...d, category: "supermarket" })),
      ...S.deals.government.map((d) => ({ ...d, category: "government" })),
    ];
  }

  function dealsForTab(tab) {
    const all = allDeals();
    if (tab === "all") return all;
    return all.filter((d) => d.category === tab);
  }

  function mergedAnnouncements() {
    const curated = M.CURATED_ANNOUNCEMENTS.map((a) => ({ ...a, live: false }));
    const live = S.deals.government.map((d) => ({
      id: "live-" + d.fingerprint,
      title: d.title,
      summary: d.summary || "Surfaced by the SaveWiser scraper from an official source.",
      scheme: d.source,
      eligible: () => true,
      eligibilityNote: "Surfaced live by the SaveWiser deals scraper -- check the source for full eligibility criteria.",
      live: true,
      url: d.url,
    }));
    return [...curated, ...live];
  }

  function monthlySpendTotals() {
    const byMonth = {};
    S.expenseLogs.forEach((l) => {
      const key = l.date.slice(0, 7);
      byMonth[key] = (byMonth[key] || 0) + Number(l.amount);
    });
    return Object.keys(byMonth).sort().slice(-6).map((key) => ({
      key, label: monthLabel(key + "-01"), value: byMonth[key],
    }));
  }

  // Themed badge name/emoji per default category id -- a custom category
  // falls back to a generic "<Name> Champion" badge.
  const BUDGET_BADGE_META = {
    groceries: { emoji: "🛒", name: "Grocery Guru" },
    transport: { emoji: "🚌", name: "Transit Saver" },
    food: { emoji: "🍜", name: "Foodie on Budget" },
    household: { emoji: "🏠", name: "Home Economist" },
    entertainment: { emoji: "🎬", name: "Fun Fund Master" },
    others: { emoji: "⭐", name: "Budget Boss" },
  };
  function budgetBadgeMeta(cat) {
    return BUDGET_BADGE_META[cat.id] || { emoji: "🏅", name: `${cat.name} Champion` };
  }

  // ---------------------------------------------------------------------
  // Budget Tracker derived data
  //
  // A budget "challenge" isn't a separate stored object -- it's just a
  // category with a monthlyCap. Its status is computed live from
  // expenseLogs rather than a stored completed flag, the same way the
  // Monthly Spending chart is computed from expenseLogs, so it can never
  // drift out of sync with the underlying log entries.
  // ---------------------------------------------------------------------
  function expenseSpentFor(categoryId, monthKey) {
    return S.expenseLogs
      .filter((e) => e.categoryId === categoryId && e.date.slice(0, 7) === monthKey)
      .reduce((sum, e) => sum + Number(e.amount), 0);
  }

  function expenseMonthsFor(categoryId) {
    const keys = new Set();
    S.expenseLogs.forEach((e) => { if (e.categoryId === categoryId) keys.add(e.date.slice(0, 7)); });
    return Array.from(keys).sort();
  }

  // A category's badge unlocks the first time a fully-elapsed past month
  // (not the current, still-in-progress one) stayed at or under the cap --
  // i.e. the user "completed the challenge" of not overspending that month.
  function budgetBadgeEarned(cat) {
    if (cat.monthlyCap == null) return false;
    const thisMonth = todayISO().slice(0, 7);
    return expenseMonthsFor(cat.id).some((mk) => mk < thisMonth && expenseSpentFor(cat.id, mk) <= cat.monthlyCap);
  }

  function budgetCategoriesWithCap() {
    return S.budgetCategories.filter((c) => c.monthlyCap != null);
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------
  function go(route) {
    if (route === S.route) return;
    S.route = route;
    S.expandedAnnouncement = null;
    renderPage("nav");
  }

  function pushActivity(text, linkLabel, route) {
    const entry = { id: "a-" + Date.now(), text, linkLabel, route };
    S.recentActivity = [entry, ...S.recentActivity].slice(0, 20);
    api.pushActivity(entry);
  }

  function useDeal(deal) {
    const label = deal.deal_text ? `${deal.source} ${deal.deal_text}` : deal.title;
    S.usedDeals = [{ ...deal, usedAt: Date.now() }, ...S.usedDeals].slice(0, 12);
    pushActivity("You used the deal:", label + ".", "deals");
    showToast(`Marked "${label}" as used ✅`);
    if (deal.url) api.openExternal(deal.url);
  }

  async function toggleSubscribe(a) {
    const next = !S.subscriptions[a.id];
    S.subscriptions = { ...S.subscriptions, [a.id]: next };
    renderPage("none");
    await api.toggleSubscription(a.id, next);
    showToast(next ? `Subscribed to updates for "${a.title}"` : `Unsubscribed from "${a.title}"`);
    if (next) pushActivity("You subscribed to notifications for", a.title + ".", "announcements");
  }

  function openSingpassModal() {
    S.singpassStage = "scanning";
    setOverlay(singpassShellHtml());
    setTimeout(() => {
      S.singpassStage = "success";
      const body = document.getElementById("sw-singpass-body");
      fadeSwap(body, singpassBodyHtml());
    }, 1700);
  }

  async function confirmSingpassLogin() {
    S.singpass = { loggedIn: true, name: M.PERSONA.name, nric: M.PERSONA.maskedNric };
    S.singpassStage = "idle";
    closeOverlay();
    renderPage("soft");
    await api.setSingpass(S.singpass);
    pushActivity("You logged in with", "Singpass.", "profile");
    showToast("Logged in with Singpass ✅");
  }

  function closeSingpassModal() {
    S.singpassStage = "idle";
    closeOverlay();
  }

  function openLogSheet() {
    S.logSheetOpen = true;
    if (!S.expenseCategoryId && S.budgetCategories.length) S.expenseCategoryId = S.budgetCategories[0].id;
    setOverlay(logSheetHtml());
    focusSoon("sw-amount");
  }
  function closeLogSheet() {
    S.logSheetOpen = false;
    closeOverlay();
  }
  function pickExpenseCategory(categoryId) {
    S.expenseCategoryId = categoryId;
    setOverlay(logSheetHtml());
  }

  async function submitSpendingLog(amount, note, categoryId) {
    if (!amount || amount <= 0 || !categoryId) return;
    const cat = S.budgetCategories.find((c) => c.id === categoryId);
    const entry = { date: todayISO(), amount, note: note || "", categoryId };
    S.expenseLogs = [...S.expenseLogs, entry];
    await api.appendExpenseLog(entry);

    const monthKey = todayISO().slice(0, 7);
    const spentNow = expenseSpentFor(categoryId, monthKey);
    const justWentOver = cat && cat.monthlyCap != null && spentNow > cat.monthlyCap && (spentNow - amount) <= cat.monthlyCap;

    pushActivity("You logged spending:", `${fmtMoney(amount)} on ${cat ? cat.name : "spending"}.`, "budget");

    S.logSheetOpen = false;
    closeOverlay();
    renderPage("soft");

    if (cat && cat.monthlyCap != null && spentNow > cat.monthlyCap) {
      showToast(justWentOver
        ? `⚠️ You've gone over your ${cat.name} budget this month`
        : `⚠️ Still over your ${cat.name} budget (${fmtMoney(spentNow)} / ${fmtMoney(cat.monthlyCap)})`);
    } else {
      showToast(`Logged ${fmtMoney(amount)} to ${cat ? cat.name : "spending"}`);
    }
  }

  function slugifyCategoryName(name) {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return base || "category";
  }

  async function addBudgetCategory(name) {
    let id = slugifyCategoryName(name);
    if (S.budgetCategories.some((c) => c.id === id)) id = `${id}-${Date.now()}`;
    const cat = { id, name: name.trim(), monthlyCap: null, icon: "dots", isCustom: true };
    S.budgetCategories = [...S.budgetCategories, cat];
    await api.patchState({ budgetCategories: S.budgetCategories });
    closeOverlay();
    renderPage("soft");
    showToast(`Added "${cat.name}" category`);
  }

  async function setCategoryCap(categoryId, amount) {
    S.budgetCategories = S.budgetCategories.map((c) => c.id === categoryId ? { ...c, monthlyCap: amount } : c);
    await api.patchState({ budgetCategories: S.budgetCategories });
    closeOverlay();
    renderPage("soft");
    const cat = S.budgetCategories.find((c) => c.id === categoryId);
    if (!cat) return;
    showToast(amount != null
      ? `Set ${cat.name} limit to ${fmtMoney(amount)}/month`
      : `Removed ${cat.name}'s monthly limit`);
  }

  // ---------------------------------------------------------------------
  // Shared chrome: topbar + bottom nav
  // ---------------------------------------------------------------------
  function topbarHtml() {
    const name = S.singpass.loggedIn ? S.singpass.name.split(" ")[0].toUpperCase() : M.PERSONA.displayName.split(" ")[0].toUpperCase();
    return `
      <div class="topbar">
        <div class="topbar__icon">${brandMarkHtml()}</div>
        <div class="topbar__text">Welcome back, <b>${escapeHtml(name)}!</b></div>
        <div class="topbar__actions">
          <button class="topbar__btn" data-action="open-search" title="Search">${icon("search", 15)}</button>
        </div>
      </div>`;
  }

  function bottomNavHtml() {
    const item = (route, iconName, label) => `
      <button class="navbtn ${S.route === route ? "active" : ""}" data-action="go" data-route="${route}">
        ${icon(iconName)}<span>${label}</span>
      </button>`;
    return `
      <nav class="bottomnav">
        ${item("home", "home", "Home")}
        <button class="navbtn navbtn--fab" data-action="open-log-sheet">${icon("plus", 20)}</button>
        ${item("profile", "user", "Profile")}
      </nav>`;
  }

  // ---------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------
  function dealCardHtml(d) {
    const b = M.brandStyle(d.source);
    const title = d.deal_text ? d.source : d.title;
    const desc = d.deal_text ? d.deal_text : (d.summary ? d.summary.slice(0, 70) + (d.summary.length > 70 ? "…" : "") : d.source);
    return `
      <div class="deal-card" data-action="use-deal" data-fingerprint="${d.fingerprint}">
        <div class="deal-card__media" style="background:${b.bg}">${escapeHtml(b.mark)}</div>
        <div class="deal-card__body">
          <p class="deal-card__title">${escapeHtml(title)}</p>
          <p class="deal-card__desc">${escapeHtml(desc)}</p>
          <span class="deal-card__badge">${escapeHtml(categoryLabel(d.category))}</span>
        </div>
      </div>`;
  }

  function categoryLabel(cat) {
    return { amenities: "Amenities & F&B", supermarket: "Supermarket", government: "Gov Assistance" }[cat] || cat;
  }

  function chartHtml(months) {
    const max = Math.max(1, ...months.map((m) => m.value));
    return `
      <div class="chart">
        ${months.map((m) => `
          <div class="chart__bar-wrap">
            <div class="chart__bar" style="height:${Math.max(6, (m.value / max) * 100)}%" title="${fmtMoney(m.value)}"></div>
            <span class="chart__label">${m.label}</span>
          </div>`).join("")}
      </div>`;
  }

  function homePage() {
    const dealsPreview = dealsForTab("amenities").slice(0, 4);
    const activity = S.recentActivity.slice(0, 4);
    return `
      ${topbarHtml()}
      <h1 class="section-title">Your SaveWiser Dashboard</h1>

      <div class="glass card">
        <p class="section-title" style="margin:0 0 10px;font-size:15px;">Recent Activity</p>
        <ul class="activity-list">
          ${activity.length ? activity.map((a) => `
            <li>${escapeHtml(a.text)} <a href="#" data-action="go" data-route="${a.route}">${escapeHtml(a.linkLabel)}</a></li>
          `).join("") : `<li>No activity yet -- log a deal or a saving to get started.</li>`}
        </ul>
      </div>

      <div class="glass-blue card">
        <p class="section-title" style="margin:0 0 12px;color:#fff;font-size:15px;">Lobang Radar</p>
        ${S.deals.loading && !dealsPreview.length ? skeletonGrid() : `<div class="deal-grid">${dealsPreview.map(dealCardHtml).join("") || `<div class="empty-state" style="color:#fff;">No deals yet.</div>`}</div>`}
        <div style="text-align:center;margin-top:12px;">
          <a href="#" data-action="go" data-route="deals" style="color:#fff;text-decoration:underline;font-weight:700;font-size:12.5px;">Tap here to see more</a>
        </div>
      </div>

      <div class="glass-blue card">
        <p class="section-title" style="margin:0 0 12px;color:#fff;font-size:15px;">Budget Tracker</p>
        ${budgetCategoriesWithCap().slice(0, 3).map(budgetMiniHtml).join("") || `<div class="empty-state" style="color:#fff;">Set a monthly limit on a category to start tracking.</div>`}
        <div style="text-align:center;margin-top:8px;">
          <a href="#" data-action="go" data-route="budget" style="color:#fff;text-decoration:underline;font-weight:700;font-size:12.5px;">Tap here to see more</a>
        </div>
      </div>
    `;
  }

  function budgetMiniHtml(cat) {
    const monthKey = todayISO().slice(0, 7);
    const spent = expenseSpentFor(cat.id, monthKey);
    const over = spent > cat.monthlyCap;
    const pct = Math.min(100, Math.round((spent / cat.monthlyCap) * 100));
    return `
      <div style="background:rgba(255,255,255,0.14);border-radius:14px;padding:12px;margin-bottom:8px;cursor:pointer;" data-action="go" data-route="budget">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <b style="font-size:13px;color:#fff;">${escapeHtml(cat.name)}</b>
          ${over ? `<span style="font-size:10.5px;font-weight:800;color:#ffe3dd;">OVER</span>` : ""}
        </div>
        <div class="progress-track" style="background:rgba(255,255,255,0.25);margin-top:6px;">
          <div class="progress-fill ${over ? "over" : ""}" style="background:${over ? "" : "#fff"};width:${pct}%"></div>
        </div>
        <div class="progress-label" style="color:rgba(255,255,255,0.85);"><span>${fmtMoney(spent)} spent</span><span>Limit: ${fmtMoney(cat.monthlyCap)}</span></div>
      </div>`;
  }

  function skeletonGrid() {
    return `<div class="deal-grid">${[1,2,3,4].map(() => `<div class="skeleton" style="height:150px;"></div>`).join("")}</div>`;
  }

  function dealsPage() {
    const tabs = [["all", "All"], ["amenities", "Amenities & F&B"], ["supermarket", "Supermarket"], ["government", "Gov Assistance"]];
    const deals = dealsForTab(S.dealsTab);
    return `
      ${topbarHtml()}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:18px;">
        <h1 class="section-title" style="margin:0;">Lobang Radar</h1>
        <button class="btn btn--glass btn--sm" data-action="refresh-deals" ${S.deals.loading ? "disabled" : ""}>
          ${S.deals.loading ? '<span class="spinner" style="border-top-color:var(--sw-blue);border-color:rgba(0,94,186,0.3);"></span>' : icon("refresh", 14)} Refresh
        </button>
      </div>
      <p class="section-subtitle">AI-curated by the SaveWiser deal scraper -- amenities, food &amp; drink, supermarket promos, and official government assistance schemes, all in one feed.</p>
      <div class="tabs">
        ${tabs.map(([id, label]) => `<button class="tab ${S.dealsTab === id ? "active" : ""}" data-action="set-deals-tab" data-tab="${id}">${label}</button>`).join("")}
      </div>
      ${S.deals.error ? `<div class="empty-state">Couldn't load deals: ${escapeHtml(S.deals.error)}</div>` : ""}
      ${S.deals.loading && !deals.length ? skeletonGrid() : (
        deals.length
          ? `<div class="deal-grid">${deals.map(dealCardHtml).join("")}</div>`
          : `<div class="empty-state">No deals in this category right now.</div>`
      )}
    `;
  }

  function announcementItemHtml(a) {
    const expanded = S.expandedAnnouncement === a.id;
    const eligible = a.eligible(M.PERSONA);
    const subscribed = !!S.subscriptions[a.id];
    return `
      <div class="glass card" style="margin-bottom:12px;">
        <div class="list-item" style="border:none;padding:0;cursor:pointer;" data-action="toggle-announcement" data-id="${a.id}">
          <div class="list-item__icon">${icon("bell", 15)}</div>
          <div class="list-item__body">
            <p class="list-item__title">${escapeHtml(a.title)} ${a.live ? '<span class="deal-card__badge" style="margin-left:4px;">Live</span>' : ""}</p>
            <p class="list-item__meta">${escapeHtml(a.scheme)}</p>
          </div>
          <span class="list-item__chevron" style="transform:rotate(${expanded ? 90 : 0}deg);transition:transform .15s;">${icon("chevron", 15)}</span>
        </div>
        ${expanded ? `
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(11,18,32,0.08);">
            <p style="font-size:12.5px;color:var(--sw-ink-soft);margin:0 0 10px;line-height:1.5;">${escapeHtml(a.summary)}</p>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
              <span style="color:${eligible ? "#1a9c5c" : "var(--sw-ink-faint)"};display:flex;">${icon("check", 15)}</span>
              <span style="font-size:12px;color:var(--sw-ink-soft);">${escapeHtml(a.eligibilityNote)}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:13px;font-weight:700;">Notify me about updates</span>
              <button class="toggle ${subscribed ? "on" : ""}" data-action="toggle-subscribe" data-id="${a.id}"></button>
            </div>
          </div>
        ` : ""}
      </div>`;
  }

  function announcementsPage() {
    if (!S.singpass.loggedIn) {
      return `
        ${topbarHtml()}
        <h1 class="section-title">Announcements</h1>
        <div class="glass-blue card" style="text-align:center;padding:32px 20px;">
          <div class="singpass-mark">SP</div>
          <p style="font-weight:800;font-size:16px;margin:0 0 6px;color:#fff;">Login with Singpass</p>
          <p style="font-size:12.5px;color:rgba(255,255,255,0.85);margin:0 0 18px;line-height:1.5;">
            Verify it's you to subscribe to notifications about new government financial
            assistance schemes as soon as they're announced.
          </p>
          <button class="btn btn--block" style="background:#fff;color:var(--sw-blue-dark);" data-action="open-singpass">Login with Singpass</button>
        </div>
      `;
    }
    const announcements = mergedAnnouncements();
    return `
      ${topbarHtml()}
      <h1 class="section-title">Announcements</h1>
      <p class="section-subtitle">Subscribe to a scheme to get notified the moment SaveWiser sees an update.</p>
      ${announcements.map(announcementItemHtml).join("")}
    `;
  }

  function badgesRowHtml() {
    const cats = budgetCategoriesWithCap();
    if (!cats.length) return "";
    return `
      <div class="glass card">
        <p class="section-title" style="margin:0 0 10px;font-size:15px;">Your Badges</p>
        <div class="badge-strip">
          ${cats.map((cat) => {
            const earned = budgetBadgeEarned(cat);
            const meta = budgetBadgeMeta(cat);
            return `
              <div class="badge-chip ${earned ? "" : "locked"}" title="${escapeHtml(cat.name)} budget badge">
                <div class="badge-chip__mark">${earned ? meta.emoji : "🔒"}</div>
                <span class="badge-chip__name">${escapeHtml(meta.name)}</span>
              </div>`;
          }).join("")}
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------------
  // Budget Tracker
  //
  // Each category is a lightweight, user-set "don't spend more than $X"
  // challenge: instead of a savings goal you're trying to hit, it's a cap
  // you're trying to stay under. Status is computed live in
  // budgetBadgeEarned()/expenseSpentFor() above, from the same expenseLogs
  // list a Log Spending entry appends to -- no separate "completed" flag to
  // fall out of sync.
  // ---------------------------------------------------------------------
  function budgetCategoryCardHtml(cat) {
    const monthKey = todayISO().slice(0, 7);
    const spent = expenseSpentFor(cat.id, monthKey);
    const cap = cat.monthlyCap;
    const pct = cap ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
    const over = cap != null && spent > cap;
    const earned = budgetBadgeEarned(cat);
    return `
      <div class="glass budget-card">
        <div class="budget-card__head">
          <div class="budget-card__icon">${icon(cat.icon || "dots", 16)}</div>
          <div style="flex:1;min-width:0;">
            <p class="budget-card__name">${escapeHtml(cat.name)}</p>
            <p class="budget-card__cap">${cap != null ? `${fmtMoney(spent)} of ${fmtMoney(cap)} this month` : "No monthly limit set"}</p>
          </div>
          ${earned ? `<span title="${escapeHtml(budgetBadgeMeta(cat).name)} badge earned" style="font-size:17px;flex:none;">${budgetBadgeMeta(cat).emoji}</span>` : ""}
          <button class="btn btn--glass btn--sm" style="flex:none;" data-action="open-set-cap" data-id="${cat.id}">${cap != null ? "Edit" : "Set limit"}</button>
        </div>
        ${cap != null ? `
          <div class="progress-track"><div class="progress-fill ${over ? "over" : ""}" style="width:${pct}%"></div></div>
          <div class="progress-label">
            <span>${fmtMoney(spent)} spent</span>
            <span class="progress-pct" style="${over ? "color:#c0392b;" : ""}">${pct}%</span>
            <span>${over ? `Over by ${fmtMoney(spent - cap)}` : `${fmtMoney(cap - spent)} left`}</span>
          </div>
          ${over ? `<div class="budget-over-note">⚠️ Over budget this month</div>` : ""}
        ` : ""}
      </div>`;
  }

  function budgetPage() {
    const monthLbl = new Date().toLocaleString("en-SG", { month: "long", year: "numeric" });
    const badgeCount = S.budgetCategories.filter(budgetBadgeEarned).length;
    const months = monthlySpendTotals();
    return `
      ${topbarHtml()}
      <h1 class="section-title">Budget Tracker</h1>
      <p class="section-subtitle">Set a monthly limit per category. Stay under it for the whole month and you'll earn a badge -- go over, and you'll see it here right away.</p>
      <div style="display:flex;justify-content:space-between;align-items:center;margin:2px 0 12px;">
        <b style="font-size:13px;color:var(--sw-ink-soft);">${escapeHtml(monthLbl)}</b>
        <button class="btn btn--primary btn--sm" data-action="open-log-sheet">+ Log Spending</button>
      </div>
      ${S.budgetCategories.map(budgetCategoryCardHtml).join("")}
      <button class="btn btn--glass btn--block" style="margin-top:4px;" data-action="open-add-category">+ Add your own category</button>
      ${badgeCount ? `<p style="text-align:center;font-size:11.5px;color:var(--sw-ink-faint);margin-top:14px;">🏅 ${badgeCount} budget badge${badgeCount === 1 ? "" : "s"} earned so far</p>` : ""}
      <div class="glass card" style="margin-top:14px;">
        <p class="section-title" style="margin:0 0 4px;font-size:15px;">Monthly Spending</p>
        ${months.length ? chartHtml(months) : `<div class="empty-state">Log a spend to see your monthly totals.</div>`}
      </div>
    `;
  }

  function addCategorySheetHtml() {
    return `
      <div class="sheet-backdrop" data-action="close-add-category">
        <div class="sheet" data-action="noop">
          <div class="sheet__handle"></div>
          <p class="sheet__title">New budget category</p>
          <p class="sheet__subtitle">e.g. Pet Care, Subscriptions, Travel</p>
          <input id="sw-category-name" class="field" placeholder="Category name" autofocus />
          <button class="btn btn--primary btn--block" data-action="submit-add-category">Add Category</button>
        </div>
      </div>`;
  }

  function setCapSheetHtml(categoryId) {
    const cat = S.budgetCategories.find((c) => c.id === categoryId);
    if (!cat) return "";
    return `
      <div class="sheet-backdrop" data-action="close-set-cap">
        <div class="sheet" data-action="noop">
          <div class="sheet__handle"></div>
          <p class="sheet__title">${escapeHtml(cat.name)} monthly limit</p>
          <p class="sheet__subtitle">Stay under this all month to earn a badge.</p>
          <div style="display:flex;align-items:center;justify-content:center;">
            <span style="font-size:28px;font-weight:800;color:var(--sw-blue-dark);">$</span>
            <input id="sw-cap-amount" class="amount-input" type="number" min="0" step="1" inputmode="decimal" placeholder="0" style="width:auto;flex:1;" value="${cat.monthlyCap != null ? cat.monthlyCap : ""}" autofocus />
          </div>
          <button class="btn btn--primary btn--block" data-action="submit-set-cap" data-id="${cat.id}">Save Limit</button>
          ${cat.monthlyCap != null ? `<button class="btn btn--ghost btn--block" style="margin-top:8px;" data-action="clear-set-cap" data-id="${cat.id}">Remove limit</button>` : ""}
        </div>
      </div>`;
  }

  function profilePage() {
    const curated = M.CURATED_ANNOUNCEMENTS.slice(0, 4);
    return `
      ${topbarHtml()}
      <h1 class="section-title">Your Profile</h1>

      <div class="glass card">
        <div class="profile-row">
          <div class="avatar">${M.PERSONA.initials}</div>
          <div>
            <p class="profile-row__name">${escapeHtml(M.PERSONA.name.toUpperCase())}</p>
            ${S.singpass.loggedIn
              ? `<div class="profile-row__status">${icon("check", 13)} Singpass logged in.</div>`
              : `<div class="profile-row__status off">Not linked <a href="#" data-action="go" data-route="announcements" style="color:var(--sw-blue);font-weight:700;">Login</a></div>`}
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn--glass" data-action="toast" data-msg="Account settings coming soon">${icon("user", 14)} Your Account</button>
          <button class="btn btn--glass" data-action="toast" data-msg="Settings coming soon">Settings</button>
        </div>
      </div>

      ${badgesRowHtml()}

      <div class="glass card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <p class="section-title" style="margin:0;font-size:15px;">Announcements</p>
        </div>
        <div class="list">
          ${curated.map((a) => `
            <div class="list-item" data-action="go-announcement" data-id="${a.id}">
              <div class="list-item__body"><p class="list-item__title">${escapeHtml(a.title)}</p></div>
              <span class="list-item__chevron">${icon("chevron", 15)}</span>
            </div>`).join("")}
        </div>
      </div>

      <div class="glass card" data-action="go" data-route="budget" style="cursor:pointer;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <p class="section-title" style="margin:0;font-size:15px;">Budget Tracker</p>
          <span style="color:var(--sw-ink-faint);">${icon("chevron", 15)}</span>
        </div>
        <p class="section-subtitle" style="margin:6px 0 0;">${budgetCategoriesWithCap().length} categor${budgetCategoriesWithCap().length === 1 ? "y" : "ies"} with a limit set -- tap to view.</p>
      </div>

      <div class="glass card">
        <p class="section-title" style="margin:0 0 10px;font-size:15px;">Recently Used Deals</p>
        ${S.usedDeals.length ? `<div class="deal-strip">${S.usedDeals.map((d) => {
          const b = M.brandStyle(d.source);
          return `<div class="deal-chip"><div class="deal-chip__media" style="background:${b.bg}">${escapeHtml(b.mark)}</div><div class="deal-chip__label"><b>${escapeHtml(d.source)}</b><span>${escapeHtml(d.deal_text || d.title)}</span></div></div>`;
        }).join("")}</div>` : `<div class="empty-state" style="padding:20px 0;">Deals you use will show up here.</div>`}
      </div>
    `;
  }

  const PAGES = { home: homePage, deals: dealsPage, announcements: announcementsPage, budget: budgetPage, profile: profilePage };

  // ---------------------------------------------------------------------
  // Overlays: Singpass modal, Log Savings sheet, Search sheet
  // ---------------------------------------------------------------------
  function singpassBodyHtml() {
    if (S.singpassStage === "scanning") {
      return `
        <div class="singpass-mark">${brandMarkHtml()}</div>
        <p class="sheet__title">Scan with Singpass app</p>
        <div class="qr-box"></div>
        <p class="sheet__subtitle" style="display:flex;align-items:center;justify-content:center;gap:8px;">
          <span class="spinner" style="border-color:rgba(0,94,186,0.25);border-top-color:var(--sw-blue);"></span> Waiting for approval&hellip;
        </p>
        <button class="btn btn--ghost btn--block" data-action="dismiss-singpass">Cancel</button>`;
    }
    return `
      <div class="singpass-mark" style="background:linear-gradient(155deg,#3fbf72,#1a9c5c);">${icon("check", 26)}</div>
      <p class="sheet__title">Verified</p>
      <p class="sheet__subtitle">Logged in as <b>${escapeHtml(M.PERSONA.name)}</b><br/>NRIC ${escapeHtml(M.PERSONA.maskedNric)}</p>
      <button class="btn btn--primary btn--block" data-action="confirm-singpass">Continue</button>`;
  }

  function singpassShellHtml() {
    return `
      <div class="sheet-backdrop center" data-action="dismiss-singpass">
        <div class="sheet" data-action="noop" style="max-width:340px;">
          <div id="sw-singpass-body">${singpassBodyHtml()}</div>
        </div>
      </div>`;
  }

  function logSheetHtml() {
    const dateLabel = new Date().toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long" });
    return `
      <div class="sheet-backdrop" data-action="close-log-sheet">
        <div class="sheet" data-action="noop">
          <div class="sheet__handle"></div>
          <p class="sheet__title">Log today's spending</p>
          <p class="sheet__subtitle">${dateLabel}</p>
          <div style="display:flex;align-items:center;justify-content:center;">
            <span style="font-size:28px;font-weight:800;color:var(--sw-blue-dark);">$</span>
            <input id="sw-amount" class="amount-input" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" style="width:auto;flex:1;" autofocus />
          </div>
          <input id="sw-note" class="field" placeholder="Note (optional) -- e.g. skipped bubble tea" />
          ${logSheetBodyHtml()}
          <button class="btn btn--primary btn--block" data-action="submit-log">Save</button>
        </div>
      </div>`;
  }

  function logSheetBodyHtml() {
    if (!S.budgetCategories.length) {
      return `<p style="font-size:12px;color:var(--sw-ink-faint);margin:4px 0 16px;">Add a budget category on the Budget Tracker page first.</p>`;
    }
    return `
      <p style="font-size:12px;font-weight:700;color:var(--sw-ink-soft);margin:4px 0 8px;">Category:</p>
      <div class="tabs" style="margin-bottom:16px;">
        ${S.budgetCategories.map((c) => `
          <button class="tab ${S.expenseCategoryId === c.id ? "active" : ""}" data-action="pick-expense-category" data-id="${c.id}">${escapeHtml(c.name)}</button>
        `).join("")}
      </div>
    `;
  }

  function searchResultsFor(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return [
      ...allDeals().filter((d) => (d.title + " " + d.source).toLowerCase().includes(q)).map((d) => ({
        label: d.deal_text ? `${d.source} -- ${d.deal_text}` : d.title, route: "deals", tag: "Deal",
      })),
      ...mergedAnnouncements().filter((a) => a.title.toLowerCase().includes(q)).map((a) => ({
        label: a.title, route: "announcements", tag: "Announcement",
      })),
      ...S.budgetCategories.filter((c) => c.name.toLowerCase().includes(q)).map((c) => ({
        label: c.name, route: "budget", tag: "Budget Category",
      })),
    ].slice(0, 20);
  }

  function searchResultsHtml(query) {
    const results = searchResultsFor(query);
    if (query.trim() && !results.length) return `<div class="empty-state">No matches for "${escapeHtml(query)}"</div>`;
    return results.map((r) => `
      <div class="list-item" data-action="search-goto" data-route="${r.route}">
        <div class="list-item__body"><p class="list-item__title">${escapeHtml(r.label)}</p><p class="list-item__meta">${r.tag}</p></div>
        <span class="list-item__chevron">${icon("chevron", 15)}</span>
      </div>`).join("");
  }

  function searchOverlayHtml() {
    return `
      <div class="sheet-backdrop center" data-action="close-search">
        <div class="sheet" data-action="noop" style="max-height:70vh;display:flex;flex-direction:column;">
          <input id="sw-search" class="field" placeholder="Search deals, announcements, budgets&hellip;" value="${escapeHtml(S.searchQuery)}" autofocus />
          <div id="sw-search-results" style="overflow-y:auto;">${searchResultsHtml(S.searchQuery)}</div>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------------
  // DOM: build the persistent regions once, then only ever touch them
  // through the targeted helpers below.
  // ---------------------------------------------------------------------
  function buildStaticShell() {
    const root = document.getElementById("app");
    root.innerHTML = `
      <div class="app-shell">
        <div class="titlebar-spacer"></div>
        <div id="sw-shell" class="page"></div>
        ${bottomNavHtml()}
      </div>
      <div id="sw-overlay"></div>
      <div id="sw-toast" class="toast-root"></div>
    `;
  }

  let pageTransitionToken = 0;

  // mode: "nav" (route change -- slide+fade), "soft" (in-page refresh --
  // quick fade), "none" (instant, no transition at all).
  function renderPage(mode) {
    const el = document.getElementById("sw-shell");
    if (!el) return;
    const html = (PAGES[S.route] || homePage)();

    if (mode === "none" || !el.childNodes.length) {
      el.innerHTML = html;
      updateNavActiveState();
      return;
    }

    const token = ++pageTransitionToken;
    const outMs = mode === "nav" ? 130 : 90;
    const inMs = mode === "nav" ? 220 : 150;
    const restY = mode === "nav" ? "6px" : "0px";

    el.style.transition = `opacity ${outMs}ms ease, transform ${outMs}ms ease`;
    el.style.opacity = "0";
    el.style.transform = `translateY(${mode === "nav" ? "-4px" : "0px"})`;

    setTimeout(() => {
      if (token !== pageTransitionToken) return; // superseded by a newer update
      el.innerHTML = html;
      updateNavActiveState();
      if (mode === "nav") el.scrollTop = 0;
      el.style.transition = "none";
      el.style.transform = `translateY(${restY})`;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (token !== pageTransitionToken) return;
          el.style.transition = `opacity ${inMs}ms ease, transform ${inMs}ms ease`;
          el.style.opacity = "1";
          el.style.transform = "translateY(0)";
        });
      });
    }, outMs);
  }

  function updateNavActiveState() {
    document.querySelectorAll(".navbtn[data-route]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.route === S.route);
    });
  }

  function setOverlay(html) {
    document.getElementById("sw-overlay").innerHTML = html;
  }
  function closeOverlay() {
    const root = document.getElementById("sw-overlay");
    const el = root.firstElementChild;
    if (!el) return;
    el.classList.add("closing");
    setTimeout(() => { root.innerHTML = ""; }, 160);
  }
  function fadeSwap(el, html, ms) {
    if (!el) return;
    const duration = ms || 160;
    el.style.transition = `opacity ${duration}ms ease`;
    el.style.opacity = "0";
    setTimeout(() => {
      el.innerHTML = html;
      requestAnimationFrame(() => { el.style.opacity = "1"; });
    }, duration);
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("sw-toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  // ---------------------------------------------------------------------
  // Event delegation
  // ---------------------------------------------------------------------
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    switch (action) {
      case "noop": break; // clicked inside a sheet/modal card -- don't bubble to the backdrop's dismiss handler
      case "go": go(el.dataset.route); break;
      case "open-search":
        S.searchOpen = true;
        S.searchQuery = "";
        setOverlay(searchOverlayHtml());
        focusSoon("sw-search");
        break;
      case "close-search": S.searchOpen = false; closeOverlay(); break;
      case "search-goto": S.searchOpen = false; closeOverlay(); go(el.dataset.route); break;
      case "toast": showToast(el.dataset.msg); break;
      case "set-deals-tab": S.dealsTab = el.dataset.tab; renderPage("soft"); break;
      case "refresh-deals": loadDeals(false); break;
      case "use-deal": {
        const d = allDeals().find((x) => x.fingerprint === el.dataset.fingerprint);
        if (d) useDeal(d);
        break;
      }
      case "open-singpass": openSingpassModal(); break;
      case "dismiss-singpass": closeSingpassModal(); break;
      case "confirm-singpass": confirmSingpassLogin(); break;
      case "toggle-announcement":
        S.expandedAnnouncement = S.expandedAnnouncement === el.dataset.id ? null : el.dataset.id;
        renderPage("none");
        break;
      case "go-announcement":
        S.expandedAnnouncement = el.dataset.id;
        go("announcements");
        break;
      case "toggle-subscribe": {
        const a = mergedAnnouncements().find((x) => x.id === el.dataset.id);
        if (a) toggleSubscribe(a);
        break;
      }
      case "open-log-sheet": openLogSheet(); break;
      case "close-log-sheet": closeLogSheet(); break;
      case "pick-expense-category": pickExpenseCategory(el.dataset.id); break;
      case "submit-log": {
        const amount = parseFloat(document.getElementById("sw-amount")?.value || "0");
        const note = document.getElementById("sw-note")?.value || "";
        submitSpendingLog(amount, note, S.expenseCategoryId);
        break;
      }
      case "open-add-category":
        setOverlay(addCategorySheetHtml());
        focusSoon("sw-category-name");
        break;
      case "close-add-category": closeOverlay(); break;
      case "submit-add-category": {
        const name = (document.getElementById("sw-category-name")?.value || "").trim();
        if (name) addBudgetCategory(name);
        break;
      }
      case "open-set-cap":
        setOverlay(setCapSheetHtml(el.dataset.id));
        focusSoon("sw-cap-amount");
        break;
      case "close-set-cap": closeOverlay(); break;
      case "submit-set-cap": {
        const raw = document.getElementById("sw-cap-amount")?.value || "";
        const amt = parseFloat(raw);
        setCategoryCap(el.dataset.id, raw === "" || isNaN(amt) || amt <= 0 ? null : amt);
        break;
      }
      case "clear-set-cap": setCategoryCap(el.dataset.id, null); break;
    }
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "sw-search") {
      S.searchQuery = e.target.value;
      const results = document.getElementById("sw-search-results");
      if (results) results.innerHTML = searchResultsHtml(S.searchQuery);
    }
  });

  function focusSoon(id) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  boot();
})();
