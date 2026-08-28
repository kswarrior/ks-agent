/* ─── Mock docs data ─────────────────────────────────────────── */
const DOCS = [
  { id: 1,  title: "Getting Started", category: "Guides", tags: ["getting-started"], status: "published", author: "Alex Rivera", initials: "AR", views: 41200, date: "2024-01-18", version: "3.1.0" },
  { id: 2,  title: "API Authentication", category: "Reference", tags: ["api", "security"], status: "published", author: "Maya Chen",   initials: "MC", views: 28700, date: "2024-03-22", version: "3.4.0" },
  { id: 3,  title: "User Roles & Permissions", category: "Guides", tags: ["security"], status: "published", author: "Alex Rivera", initials: "AR", views: 19400, date: "2024-02-10", version: "3.2.0" },
  { id: 4,  title: "Dashboard Walkthrough", category: "Tutorials", tags: ["tutorial", "dashboard"], status: "review", author: "Jordan Lee", initials: "JL", views: 9200, date: "2024-04-05", version: "3.4.0" },
  { id: 5,  title: "Webhooks & Events", category: "Reference", tags: ["api"], status: "review", author: "Sam Okafor",  initials: "SO", views: 7400, date: "2024-04-01", version: "3.5.0-beta" },
  { id: 6,  title: "Rate Limits & Billing", category: "Reference", tags: ["api", "billing"], status: "published", author: "Maya Chen", initials: "MC", views: 12300, date: "2024-03-14", version: "3.4.0" },
  { id: 7,  title: "SDK: Python", category: "SDKs", tags: ["sdk", "python", "api"], status: "draft", author: "Pat Nguyen", initials: "PN", views: 2100, date: "2024-04-12", version: "draft" },
  { id: 8,  title: "SDK: Node.js", category: "SDKs", tags: ["sdk", "node", "api"], status: "draft", author: "Pat Nguyen", initials: "PN", views: 1800, date: "2024-04-12", version: "draft" },
  { id: 9,  title: "Migration Guide v3→v4", category: "Migration", tags: ["migration", "breaking"], status: "draft", author: "Jordan Lee", initials: "JL", views: 3200, date: "2024-04-08", version: "draft" },
  { id: 10, title: "Changelog", category: "Changelog", tags: ["changelog"], status: "published", author: "Alex Rivera", initials: "AR", views: 63000, date: "2024-04-15", version: "4.0.0" },
  { id: 11, title: "Slack Integration", category: "Integrations", tags: ["integrations", "slack"], status: "published", author: "Sam Okafor", initials: "SO", views: 11500, date: "2024-03-19", version: "3.3.0" },
  { id: 12, title: "Troubleshooting Guide", category: "Guides", tags: ["guides", "troubleshooting"], status: "published", author: "Pat Nguyen", initials: "PN", views: 23800, date: "2024-02-27", version: "3.2.0" },
  { id: 13, title: "Security Best Practices", category: "Guides", tags: ["security", "best-practices"], status: "published", author: "Maya Chen", initials: "MC", views: 19500, date: "2024-03-01", version: "3.3.0" },
  { id: 14, title: "CLI Reference", category: "Reference", tags: ["cli", "reference"], status: "review", author: "Jordan Lee", initials: "JL", views: 8900, date: "2024-04-02", version: "3.5.0-beta" },
  { id: 15, title: "Analytics Dashboard Setup", category: "Tutorials", tags: ["tutorial", "dashboard", "analytics"], status: "published", author: "Alex Rivera", initials: "AR", views: 15700, date: "2024-03-25", version: "3.4.0" },
  { id: 16, title: "Contributing Guidelines", category: "Meta", tags: ["meta", "contributing"], status: "published", author: "Pat Nguyen", initials: "PN", views: 8900, date: "2024-01-05", version: "3.0.0" },
  { id: 17, title: "Quick Start (5 min)", category: "Tutorials", tags: ["tutorial", "getting-started"], status: "published", author: "Sam Okafor", initials: "SO", views: 52100, date: "2024-01-20", version: "3.1.0" },
  { id: 18, title: "Concepts: Tenants vs. Orgs", category: "Guides", tags: ["concepts", "organizations"], status: "review", author: "Maya Chen", initials: "MC", views: 4200, date: "2024-04-10", version: "3.5.0-beta" },
  { id: 19, title: "OAuth2 Flows", category: "Reference", tags: ["api", "oauth", "security"], status: "published", author: "Jordan Lee", initials: "JL", views: 16600, date: "2024-02-14", version: "3.2.0" },
  { id: 20, title: "Notifications & Alerts", category: "Integrations", tags: ["integrations", "notifications"], status: "draft", author: "Alex Rivera", initials: "AR", views: 300, date: "2024-04-14", version: "draft" }
];

const PAGE_SIZE = 12;

/* ─── State ──────────────────────────────────────────────────── */
const state = {
  data: [...DOCS],
  filter: "all",
  tag: "all",
  sort: "date-desc",
  page: 0,
  search: ""
};

/* ─── Category detection ─────────────────────────────────────── */
// Determine current category from page title or URL
const categoryMap = {
  "All Documentation": "all",
  "Guides": "Guides",
  "API Reference": "Reference",
  "Tutorials": "Tutorials",
  "SDKs": "SDKs"
};

const currentCategory = (() => {
  const h1 = document.querySelector(".topbar h1")?.textContent;
  if (h1) return categoryMap[h1] || "all";
  return "all";
})();

/* ─── Helpers ────────────────────────────────────────────────── */
const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const fmtViews = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : n.toString());

const initials = (name) =>
  name.split(" ").map(p => p[0]).join("").slice(0,2).toUpperCase();

const highlight = (text, query) => {
  if (!query) return text;
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${q})`, 'ig');
  return text.replace(re, '<mark>$1</mark>');
};

const debounce = (fn, wait=180) => {
  let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); };
};

/* ─── Filters / Sort ─────────────────────────────────────────── */
function applyFilters() {
  const s = state.search.toLowerCase();
  const isAllDocs = currentCategory === "all";
  state.data = DOCS.filter(d => {
    const matchSearch = !s || d.title.toLowerCase().includes(s) || d.author.toLowerCase().includes(s);
    const matchStatus = state.filter === "all" || d.status === state.filter;
    const matchTag = state.tag === "all" || d.tags.includes(state.tag);
    const matchCategory = isAllDocs || d.category === currentCategory;
    return matchSearch && matchStatus && matchTag && matchCategory;
  });
  const [key, dir] = state.sort.split("-");
  state.data.sort((a,b) => {
    let av = a[key]; let bv = b[key];
    if (key === "date") { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
    if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
  state.page = 0;
}

/* ─── Render ─────────────────────────────────────────────────── */
function render() {
  applyFilters();

  const start = state.page * PAGE_SIZE;
  const page = state.data.slice(start, start + PAGE_SIZE);
  const tbody = document.getElementById("tableBody");
  const empty = document.getElementById("emptyState");

  tbody.innerHTML = "";

  if (state.data.length === 0) {
    empty.style.display = "flex";
    document.querySelector(".table-wrap").style.display = "none";
    document.getElementById("pager").style.display = "none";
    return;
  }

  empty.style.display = "none";
  document.querySelector(".table-wrap").style.display = "block";
  document.getElementById("pager").style.display = "flex";

  page.forEach((d, i) => {
    const tr = document.createElement("tr");
    tr.style.animationDelay = `${i * 25}ms`;
    tr.innerHTML = `
      <td class="checkbox-cell"><input type="checkbox" /></td>
      <td>
        <span class="cell-title" title="Open ${d.title}">${highlight(d.title, state.search)}</span>
      </td>
      <td><span class="badge ${d.status}">${d.status}</span></td>
      <td><span class="cell-category">${d.category}</span></td>
      <td>
        <div class="tags-cell">
          ${d.tags.map(t => `<span class="mini-tag" data-tag="${t}">${t}</span>`).join("")}
        </div>
      </td>
      <td>
        <div class="author-cell">
          <div class="avatar-sm">${d.initials || initials(d.author)}</div>
          <span>${d.author}</span>
        </div>
      </td>
      <td><span class="date-cell">${fmtDate(d.date)}</span></td>
      <td class="views-cell">${fmtViews(d.views)}</td>
    `;
    tbody.appendChild(tr);
  });

  const total = state.data.length;
  const from = start + 1;
  const to = Math.min(start + PAGE_SIZE, total);
  document.querySelector(".pager-info").textContent = `${from}–${to} of ${total}`;

  const pager = document.getElementById("pager");
  pager.querySelector(".pager-buttons").innerHTML = `
    <button id="prevBtn" ${state.page === 0 ? "disabled" : ""}>← Prev</button>
    <button id="nextBtn" ${to >= total ? "disabled" : ""}>Next →</button>
  `;

  document.getElementById("prevBtn")?.addEventListener("click", () => { if (state.page > 0){ state.page--; render(); }});
  document.getElementById("nextBtn")?.addEventListener("click", () => { if ((state.page+1)*PAGE_SIZE < total){ state.page++; render(); }});

  document.getElementById("resultCount").textContent = `${total} page${total!==1?"s":""}`;
}

/* Populate tag dropdown */
function populateTagFilter() {
  const tags = Array.from(new Set(DOCS.flatMap(d => d.tags))).sort();
  const sel = document.getElementById("tagFilter");
  tags.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t[0].toUpperCase() + t.slice(1);
    sel.appendChild(opt);
  });
}

/* Init */
function init() {
  populateTagFilter();
  render();

  const searchInput = document.getElementById("searchInput");
  searchInput.addEventListener("input", debounce(e => { state.search = e.target.value.trim(); render(); }, 180));

  document.getElementById("statusFilter").addEventListener("change", e => { state.filter = e.target.value; render(); });
  document.getElementById("tagFilter").addEventListener("change", e => { state.tag = e.target.value; render(); });
  document.getElementById("sortSelect").addEventListener("change", e => { state.sort = e.target.value; render(); });

  document.getElementById("selectAll").addEventListener("change", e => {
    document.querySelectorAll("#tableBody input[type=checkbox]").forEach(cb => cb.checked = e.target.checked);
  });

  // Sidebar tag cloud click
  document.querySelectorAll(".tags-cloud .tag").forEach(el => {
    el.addEventListener("click", () => {
      const tag = el.textContent.trim().toLowerCase();
      state.tag = state.tag === tag ? "all" : tag;
      document.getElementById("tagFilter").value = state.tag;
      render();
      document.querySelectorAll(".tags-cloud .tag").forEach(t => t.classList.toggle("active", t.textContent.trim().toLowerCase() === state.tag));
    });
  });

  // Mini tag click
  document.addEventListener("click", e => {
    if (e.target.classList.contains("mini-tag")) {
      const tag = e.target.dataset.tag;
      state.tag = tag;
      document.getElementById("tagFilter").value = tag;
      render();
    }
  });

  // Ripple for buttons
  document.addEventListener("click", e => {
    const btn = e.target.closest(".btn");
    if (!btn) return;
    const ripple = document.createElement("span");
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = (e.clientX - rect.left - size/2) + "px";
    ripple.style.top = (e.clientY - rect.top - size/2) + "px";
    ripple.style.position = "absolute";
    ripple.style.borderRadius = "50%";
    ripple.style.background = "rgba(255,255,255,0.35)";
    ripple.style.transform = "scale(0)";
    ripple.style.pointerEvents = "none";
    ripple.style.animation = "ripple .6s ease-out";
    btn.style.position = "relative"; btn.style.overflow = "hidden";
    btn.appendChild(ripple);
    setTimeout(()=> ripple.remove(), 600);
  });
}

init();

/* CSS for mark and ripple added via style tag */
const extraCss = document.createElement("style");
extraCss.textContent = `
mark { background: #fef08a; color: #1f2937; padding: 0 .15em; border-radius: 3px; }
.tags-cloud .tag.active { background: var(--primary-100); color: var(--primary-600); border-color: var(--primary-200); }
@keyframes ripple { to { transform: scale(2.5); opacity: 0; } }
`;
document.head.appendChild(extraCss);
