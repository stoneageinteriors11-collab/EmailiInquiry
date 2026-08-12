const state = {
  enquiries: [],
  selected: null
};


/* =========================================================
   AUTHENTICATED FETCH
========================================================= */

async function authFetch(url, options = {}) {
  const token = await window.shopify.idToken();

  const headers = new Headers(options.headers || {});

  headers.set("Authorization", `Bearer ${token}`);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, {
    ...options,
    headers
  });
}


/* =========================================================
   HELPERS
========================================================= */

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


/* =========================================================
   LOAD STATS
========================================================= */

async function loadStats() {
  const response = await authFetch("/api/enquiries/stats");

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Unable to load enquiry statistics."
    );
  }

  document.getElementById("stats").innerHTML =
    Object.entries(data.stats)
      .map(([status, count]) => `
        <button
          class="stat"
          data-status="${escapeHtml(status)}"
          type="button"
        >
          <span>${escapeHtml(statusLabel(status))}</span>
          <strong>${count}</strong>
        </button>
      `)
      .join("");


  document.querySelectorAll(".stat").forEach((button) => {
    button.addEventListener("click", () => {

      document.getElementById("statusFilter").value =
        button.dataset.status;

      loadEnquiries();
    });
  });
}


/* =========================================================
   LOAD ENQUIRIES
========================================================= */

async function loadEnquiries() {
  const status =
    document.getElementById("statusFilter").value;

  const search =
    document.getElementById("search").value.trim();


  const params = new URLSearchParams();

  if (status) {
    params.set("status", status);
  }

  if (search) {
    params.set("search", search);
  }


  const response = await authFetch(
    `/api/enquiries?${params.toString()}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Unable to load enquiries."
    );
  }


  state.enquiries = data.enquiries || [];


  document.getElementById("list").innerHTML =
    state.enquiries.length

      ? state.enquiries
          .map(enquiry => `
            <button
              class="enquiry-row ${
                state.selected?.id === enquiry.id
                  ? "active"
                  : ""
              }"
              data-id="${enquiry.id}"
              type="button"
            >

              <div class="row-top">

                <strong>
                  ${escapeHtml(enquiry.reference)}
                </strong>

                <span
                  class="badge badge-${escapeHtml(
                    enquiry.status
                  )}"
                >
                  ${escapeHtml(
                    statusLabel(enquiry.status)
                  )}
                </span>

              </div>

              <div class="name">
                ${escapeHtml(enquiry.name)}
              </div>

              <div class="company">
                ${escapeHtml(
                  enquiry.company || "No company"
                )}
              </div>

              <div class="interest">
                ${escapeHtml(
                  enquiry.interested_in ||
                  "General enquiry"
                )}
              </div>

            </button>
          `)
          .join("")

      : `<div class="empty">No enquiries found.</div>`;


  document.querySelectorAll(".enquiry-row")
    .forEach((row) => {

      row.addEventListener("click", () => {
        loadEnquiry(row.dataset.id);
      });

    });
}


/* =========================================================
   LOAD SINGLE ENQUIRY
========================================================= */

async function loadEnquiry(id) {
  const response = await authFetch(
    `/api/enquiries/${id}`
  );

  const data = await response.json();


  if (!response.ok) {
    alert(
      data.error ||
      "Unable to load enquiry."
    );

    return;
  }


  state.selected = data.enquiry;

  renderDetail(data);

  await loadEnquiries();
}


/* =========================================================
   RENDER DETAIL
========================================================= */

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
        ${["NEW", "CONTACTED", "QUOTATION_SENT", "FOLLOW_UP", "WON", "LOST"]
          .map(status =>
            `<option value="${status}" ${e.status === status ? "selected" : ""}>
              ${escapeHtml(statusLabel(status))}
            </option>`
          )
          .join("")}
      </select>
    </div>

    <div class="grid">
      <div>
        <label>Email</label>
        <a href="mailto:${escapeHtml(e.email)}">
          ${escapeHtml(e.email)}
        </a>
      </div>

      <div>
        <label>Phone</label>
        <span>${escapeHtml(e.phone || "—")}</span>
      </div>

      <div>
        <label>Country</label>
        <span>${escapeHtml(e.country || "—")}</span>
      </div>

      <div>
        <label>Profession</label>
        <span>${escapeHtml(e.profession || "—")}</span>
      </div>

      <div>
        <label>Found us via</label>
        <span>${escapeHtml(e.how_discovered || "—")}</span>
      </div>

      <div>
        <label>Assigned to</label>
        <span>${escapeHtml(e.assigned_to || "Unassigned")}</span>
      </div>
    </div>

    <section class="panel">
      <h3>Interested in</h3>
      <p>${escapeHtml(e.interested_in || "General enquiry")}</p>
    </section>

    <section class="panel">
      <h3>Project requirements</h3>
      <p class="pre">
        ${escapeHtml(e.project_details || "No project details supplied.")}
      </p>
    </section>

    <section class="panel">
      <h3>Conversation</h3>

      <div id="conversation">
        ${
          data.messages.length
            ? data.messages.map(m => `
              <article class="message ${m.direction === "OUTBOUND" ? "outbound" : "inbound"}">
                <div class="message-meta">
                  <strong>
                    ${
                      m.direction === "OUTBOUND"
                        ? "Stoneage Interiors"
                        : escapeHtml(m.from_email || "Customer")
                    }
                  </strong>

                  <span>${formatDate(m.created_at)}</span>
                </div>

                ${
                  m.subject
                    ? `<div class="message-subject">
                        ${escapeHtml(m.subject)}
                       </div>`
                    : ""
                }

                <div class="message-body">
                  ${escapeHtml(m.body)}
                </div>
              </article>
            `).join("")
            : `<p class="muted">No messages yet.</p>`
        }
      </div>

      <div class="reply-box">

        <textarea
          id="replyBody"
          placeholder="Write your reply to ${escapeHtml(e.name)}..."
          rows="7"
        ></textarea>

        <button
          type="button"
          id="sendReply"
          class="send-reply"
        >
          Send Reply
        </button>

        <div id="replyStatus"></div>

      </div>
    </section>

    <section class="panel">
      <h3>Internal notes</h3>

      ${
        data.notes.length
          ? data.notes.map(n => `
              <article class="note">
                <div>
                  <strong>${escapeHtml(n.author || "Admin")}</strong>
                  ·
                  ${formatDate(n.created_at)}
                </div>

                <p>${escapeHtml(n.body)}</p>
              </article>
            `).join("")
          : `<p class="muted">No internal notes yet.</p>`
      }

      <div class="note-box">
        <input id="noteAuthor" placeholder="Your name">

        <textarea
          id="noteBody"
          placeholder="Add an internal note..."
        ></textarea>

        <button id="saveNote">
          Add Note
        </button>
      </div>
    </section>
  `;


  /*
   * STATUS CHANGE
   */
  document
    .getElementById("detailStatus")
    .addEventListener("change", async (event) => {

      const response = await authFetch(
        `/api/enquiries/${e.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: event.target.value
          })
        }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));

        alert(
          result.error ||
          "Unable to update status."
        );

        return;
      }

      await loadStats();
      await loadEnquiries();
    });


  /*
   * SEND REPLY
   */
  document
    .getElementById("sendReply")
    .addEventListener("click", async () => {

      const textarea = document.getElementById("replyBody");
      const button = document.getElementById("sendReply");
      const status = document.getElementById("replyStatus");

      const body = textarea.value.trim();

      if (!body) {
        status.textContent = "Please write a reply first.";
        status.className = "reply-error";
        textarea.focus();
        return;
      }

      /*
       * Prevent double-clicking / duplicate emails
       */
      button.disabled = true;
      button.textContent = "Sending...";
      status.textContent = "";
      status.className = "";


      try {

        const response = await authFetch(
          `/api/enquiries/${e.id}/reply`,
          {
            method: "POST",
            body: JSON.stringify({
              body
            })
          }
        );


        const result = await response.json().catch(() => ({}));


        if (!response.ok) {

          throw new Error(
            result.error ||
            "Unable to send reply."
          );

        }


        /*
         * Success
         */
        textarea.value = "";

        status.textContent =
          "Reply sent successfully.";

        status.className =
          "reply-success";


        /*
         * Reload conversation so the OUTBOUND
         * message appears immediately.
         */
        await loadEnquiry(e.id);


      } catch (error) {

        console.error(
          "Reply sending error:",
          error
        );

        status.textContent =
          error.message ||
          "Unable to send reply.";

        status.className =
          "reply-error";

        button.disabled = false;
        button.textContent = "Send Reply";
      }

    });


  /*
   * ADD INTERNAL NOTE
   */
  document
    .getElementById("saveNote")
    .addEventListener("click", async () => {

      const body =
        document.getElementById("noteBody").value.trim();

      const author =
        document.getElementById("noteAuthor").value.trim() ||
        "Admin";


      if (!body) {
        return;
      }


      const response = await authFetch(
        `/api/enquiries/${e.id}/notes`,
        {
          method: "POST",
          body: JSON.stringify({
            body,
            author
          })
        }
      );


      if (!response.ok) {

        const result =
          await response.json().catch(() => ({}));

        alert(
          result.error ||
          "Unable to save note."
        );

        return;
      }


      await loadEnquiry(e.id);
    });
}


/* =========================================================
   REFRESH EVERYTHING
========================================================= */

async function refreshAll() {

  await loadStats();

  await loadEnquiries();

}


/* =========================================================
   EVENT LISTENERS
========================================================= */

document
  .getElementById("refresh")
  .addEventListener(
    "click",
    refreshAll
  );


let searchTimer;


document
  .getElementById("search")
  .addEventListener(
    "input",
    () => {

      clearTimeout(searchTimer);

      searchTimer =
        setTimeout(
          loadEnquiries,
          250
        );

    }
  );


document
  .getElementById("statusFilter")
  .addEventListener(
    "change",
    loadEnquiries
  );


/* =========================================================
   INITIAL LOAD
========================================================= */

refreshAll().catch(error => {

  console.error(
    "Admin application failed:",
    error
  );


  document.getElementById(
    "detail"
  ).innerHTML = `

    <div class="empty">

      Unable to connect
      to the enquiry API.

    </div>

  `;

});