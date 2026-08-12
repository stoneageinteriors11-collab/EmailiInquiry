const state = {
  enquiries: [],
  selected: null
};

async function authFetch(url, options = {}) {
  const token = await window.shopify.idToken();

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, { ...options, headers });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusLabel(status) {
  return ({
    NEW: "New",
    CONTACTED: "Contacted",
    QUOTATION_SENT: "Quotation Sent",
    FOLLOW_UP: "Follow-up",
    WON: "Won",
    LOST: "Lost"
  })[status] || status;
}

function formatDate(value) {
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

async function loadStats() {
  const response = await authFetch("/api/enquiries/stats");
  const data = await response.json();

  document.getElementById("stats").innerHTML = Object.entries(data.stats)
    .map(([status, count]) => `
      <button class="stat" data-status="${status}">
        <span>${escapeHtml(statusLabel(status))}</span>
        <strong>${count}</strong>
      </button>
    `)
    .join("");

  document.querySelectorAll(".stat").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("statusFilter").value = button.dataset.status;
      loadEnquiries();
    });
  });
}

async function loadEnquiries() {
  const status = document.getElementById("statusFilter").value;
  const search = document.getElementById("search").value.trim();

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (search) params.set("search", search);

  const response = await authFetch(`/api/enquiries?${params.toString()}`);
  const data = await response.json();

  state.enquiries = data.enquiries || [];

  document.getElementById("list").innerHTML = state.enquiries.length
    ? state.enquiries.map(enquiry => `
      <button class="enquiry-row ${state.selected?.id === enquiry.id ? "active" : ""}"
              data-id="${enquiry.id}">
        <div class="row-top">
          <strong>${escapeHtml(enquiry.reference)}</strong>
          <span class="badge badge-${escapeHtml(enquiry.status)}">${escapeHtml(statusLabel(enquiry.status))}</span>
        </div>
        <div class="name">${escapeHtml(enquiry.name)}</div>
        <div class="company">${escapeHtml(enquiry.company || "No company")}</div>
        <div class="interest">${escapeHtml(enquiry.interested_in || "General enquiry")}</div>
      </button>
    `).join("")
    : `<div class="empty">No enquiries found.</div>`;

  document.querySelectorAll(".enquiry-row").forEach((row) => {
    row.addEventListener("click", () => loadEnquiry(row.dataset.id));
  });
}

async function loadEnquiry(id) {
  const response = await authFetch(`/api/enquiries/${id}`);
  const data = await response.json();

  if (!response.ok) {
    alert(data.error || "Unable to load enquiry.");
    return;
  }

  state.selected = data.enquiry;
  renderDetail(data);
  loadEnquiries();
}

function renderDetail(data) {
  const e = data.enquiry;

  document.getElementById("detail").innerHTML = `
    <div class="detail-header">
      <div>
        <div class="eyebrow">${escapeHtml(e.reference)}</div>
        <h2>${escapeHtml(e.name)}</h2>
        <div class="muted">${escapeHtml(e.company || "")}</div>
      </div>

      <select id="detailStatus">
        ${["NEW","CONTACTED","QUOTATION_SENT","FOLLOW_UP","WON","LOST"].map(status =>
          `<option value="${status}" ${e.status === status ? "selected" : ""}>${escapeHtml(statusLabel(status))}</option>`
        ).join("")}
      </select>
    </div>

    <div class="grid">
      <div><label>Email</label><a href="mailto:${escapeHtml(e.email)}">${escapeHtml(e.email)}</a></div>
      <div><label>Phone</label><span>${escapeHtml(e.phone || "—")}</span></div>
      <div><label>Country</label><span>${escapeHtml(e.country || "—")}</span></div>
      <div><label>Profession</label><span>${escapeHtml(e.profession || "—")}</span></div>
      <div><label>Found us via</label><span>${escapeHtml(e.how_discovered || "—")}</span></div>
      <div><label>Assigned to</label><span>${escapeHtml(e.assigned_to || "Unassigned")}</span></div>
    </div>

    <section class="panel">
      <h3>Interested in</h3>
      <p>${escapeHtml(e.interested_in || "General enquiry")}</p>
    </section>

    <section class="panel">
      <h3>Project requirements</h3>
      <p class="pre">${escapeHtml(e.project_details || "No project details supplied.")}</p>
    </section>

    <section class="panel">
      <h3>Conversation</h3>
      ${data.messages.map(m => `
        <article class="message ${m.direction === "OUTBOUND" ? "outbound" : "inbound"}">
          <div class="message-meta">
            <strong>${m.direction === "OUTBOUND" ? "Stoneage Interiors" : escapeHtml(m.from_email || "Customer")}</strong>
            <span>${formatDate(m.created_at)}</span>
          </div>
          <div class="message-body">${escapeHtml(m.body)}</div>
        </article>
      `).join("")}
      <div class="reply-box">
        <textarea disabled placeholder="Reply from Admin is the next build stage."></textarea>
        <button disabled>Send Reply</button>
      </div>
    </section>

    <section class="panel">
      <h3>Internal notes</h3>
      ${data.notes.length ? data.notes.map(n => `
        <article class="note">
          <div><strong>${escapeHtml(n.author || "Admin")}</strong> · ${formatDate(n.created_at)}</div>
          <p>${escapeHtml(n.body)}</p>
        </article>
      `).join("") : `<p class="muted">No internal notes yet.</p>`}
      <div class="note-box">
        <input id="noteAuthor" placeholder="Your name">
        <textarea id="noteBody" placeholder="Add an internal note..."></textarea>
        <button id="saveNote">Add Note</button>
      </div>
    </section>
  `;

  document.getElementById("detailStatus").addEventListener("change", async (event) => {
    const response = await authFetch(`/api/enquiries/${e.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: event.target.value })
    });

    if (!response.ok) alert("Unable to update status.");
    else {
      await loadStats();
      await loadEnquiries();
    }
  });

  document.getElementById("saveNote").addEventListener("click", async () => {
    const body = document.getElementById("noteBody").value.trim();
    const author = document.getElementById("noteAuthor").value.trim() || "Admin";

    if (!body) return;

    const response = await authFetch(`/api/enquiries/${e.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body, author })
    });

    if (!response.ok) {
      const result = await response.json();
      alert(result.error || "Unable to save note.");
      return;
    }

    await loadEnquiry(e.id);
  });
}

async function refreshAll() {
  await loadStats();
  await loadEnquiries();
}

document.getElementById("refresh").addEventListener("click", refreshAll);

let searchTimer;
document.getElementById("search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadEnquiries, 250);
});

document.getElementById("statusFilter").addEventListener("change", loadEnquiries);

refreshAll().catch(error => {
  console.error(error);
  document.getElementById("detail").innerHTML =
    `<div class="empty">Unable to connect to the enquiry API.</div>`;
});
