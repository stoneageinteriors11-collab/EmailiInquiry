const state = {
  enquiries: [],
  selected: null,
  conversationTimer: null
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

  const response = await authFetch(
    "/api/enquiries/stats"
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ||
      "Unable to load enquiry statistics."
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

          <span>
            ${escapeHtml(statusLabel(status))}
          </span>

          <strong>
            ${count}
          </strong>

        </button>

      `)
      .join("");


  document.querySelectorAll(".stat")
    .forEach((button) => {

      button.addEventListener("click", () => {

        document.getElementById(
          "statusFilter"
        ).value = button.dataset.status;

        loadEnquiries();

      });

    });
}


/* =========================================================
   LOAD ENQUIRIES
========================================================= */

async function loadEnquiries() {

  const status =
    document.getElementById(
      "statusFilter"
    ).value;

  const search =
    document.getElementById(
      "search"
    ).value.trim();


  const params =
    new URLSearchParams();


  if (status) {
    params.set(
      "status",
      status
    );
  }


  if (search) {
    params.set(
      "search",
      search
    );
  }


  const response =
    await authFetch(
      `/api/enquiries?${params.toString()}`
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data.error ||
      "Unable to load enquiries."
    );

  }


  state.enquiries =
    data.enquiries || [];


  document.getElementById(
    "list"
  ).innerHTML =

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
                  ${escapeHtml(
                    enquiry.reference
                  )}
                </strong>


                <span
                  class="badge badge-${escapeHtml(
                    enquiry.status
                  )}"
                >
                  ${escapeHtml(
                    statusLabel(
                      enquiry.status
                    )
                  )}
                </span>

              </div>


              <div class="name">
                ${escapeHtml(
                  enquiry.name
                )}
              </div>


              <div class="company">
                ${escapeHtml(
                  enquiry.company ||
                  "No company"
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

      : `<div class="empty">
           No enquiries found.
         </div>`;


  document.querySelectorAll(
    ".enquiry-row"
  ).forEach((row) => {

    row.addEventListener(
      "click",
      () => {

        loadEnquiry(
          row.dataset.id
        );

      }
    );

  });
}


/* =========================================================
   LOAD SINGLE ENQUIRY
========================================================= */

async function loadEnquiry(id) {

  const response =
    await authFetch(
      `/api/enquiries/${id}`
    );


  const data =
    await response.json();


  if (!response.ok) {

    alert(
      data.error ||
      "Unable to load enquiry."
    );

    return;
  }


  state.selected =
    data.enquiry;


  /*
   * Render the complete enquiry
   */
  renderDetail(data);


  /*
   * Start automatic conversation
   * checking every 5 seconds.
   */
  startConversationPolling(id);


  /*
   * Refresh enquiry list
   */
  await loadEnquiries();
}


/* =========================================================
   AUTOMATIC CONVERSATION POLLING
========================================================= */

function startConversationPolling(enquiryId) {

  /*
   * Stop previous polling first.
   *
   * This prevents multiple timers running
   * when the admin changes enquiries.
   */

  if (state.conversationTimer) {

    clearInterval(
      state.conversationTimer
    );

    state.conversationTimer = null;
  }


  /*
   * Check every 5 seconds.
   */

  state.conversationTimer =
    setInterval(async () => {

      /*
       * Make sure the same enquiry
       * is still selected.
       */

      if (
        !state.selected ||
        String(state.selected.id) !==
          String(enquiryId)
      ) {
        return;
      }


      try {

        const response =
          await authFetch(
            `/api/enquiries/${enquiryId}`
          );


        if (!response.ok) {
          return;
        }


        const data =
          await response.json();


        /*
         * Update selected enquiry
         */

        state.selected =
          data.enquiry;


        /*
         * Only update the conversation.
         *
         * We intentionally DO NOT call
         * renderDetail() here.
         *
         * This prevents the reply textarea
         * from being destroyed while the admin
         * is typing.
         */

        renderConversation(
          data.messages
        );


      } catch (error) {

        console.error(
          "Conversation refresh failed:",
          error
        );

      }

    }, 5000);
}


/* =========================================================
   RENDER CONVERSATION
========================================================= */

function renderConversation(messages) {

  const conversation =
    document.getElementById(
      "conversation"
    );


  if (!conversation) {
    return;
  }


  conversation.innerHTML =

    messages.length

      ? messages

          .map(m => `

            <article
              class="message ${
                m.direction === "OUTBOUND"
                  ? "outbound"
                  : "inbound"
              }"
            >

              <div class="message-meta">

                <strong>

                  ${
                    m.direction === "OUTBOUND"

                      ? "Stoneage Interiors"

                      : escapeHtml(
                          m.from_email ||
                          "Customer"
                        )

                  }

                </strong>


                <span>
                  ${formatDate(
                    m.created_at
                  )}
                </span>

              </div>


              ${
                m.subject

                  ? `
                    <div class="message-subject">
                      ${escapeHtml(
                        m.subject
                      )}
                    </div>
                  `

                  : ""
              }


              <div class="message-body">
  ${escapeHtml(m.body)}
</div>

${
  Array.isArray(m.attachments) && m.attachments.length
    ? `
      <div class="message-attachments">
        <div class="attachment-title">
          📎 Attachment${m.attachments.length > 1 ? "s" : ""}
        </div>

        ${m.attachments.map(file => `
          <div class="attachment-item">
            <span class="attachment-icon">📄</span>

            <div class="attachment-info">
              <strong>
                ${escapeHtml(file.filename)}
              </strong>

              <span>
                ${formatFileSize(file.size)}
              </span>
            </div>
          </div>
        `).join("")}
      </div>
    `
    : ""
}

            </article>

          `)

          .join("")

      : `
        <p class="muted">
          No messages yet.
        </p>
      `;
}

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) {
    return "";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
/* =========================================================
   RENDER DETAIL
========================================================= */

function renderDetail(data) {

  const e =
    data.enquiry;


  document.getElementById(
    "detail"
  ).innerHTML = `

    <div class="detail-header">

      <div>

        <div class="eyebrow">
          ${escapeHtml(
            e.reference
          )}
        </div>


        <h2>
          ${escapeHtml(
            e.name
          )}
        </h2>


        <div class="muted">
          ${escapeHtml(
            e.company || ""
          )}
        </div>

      </div>


      <select id="detailStatus">

        ${
          [
            "NEW",
            "CONTACTED",
            "QUOTATION_SENT",
            "FOLLOW_UP",
            "WON",
            "LOST"
          ]

          .map(status => `

            <option
              value="${status}"
              ${
                e.status === status
                  ? "selected"
                  : ""
              }
            >
              ${escapeHtml(
                statusLabel(status)
              )}
            </option>

          `)

          .join("")
        }

      </select>

    </div>


    <div class="grid">

      <div>

        <label>
          Email
        </label>

        <a
          href="mailto:${escapeHtml(
            e.email
          )}"
        >
          ${escapeHtml(
            e.email
          )}
        </a>

      </div>


      <div>

        <label>
          Phone
        </label>

        <span>
          ${escapeHtml(
            e.phone || "—"
          )}
        </span>

      </div>


      <div>

        <label>
          Country
        </label>

        <span>
          ${escapeHtml(
            e.country || "—"
          )}
        </span>

      </div>


      <div>

        <label>
          Profession
        </label>

        <span>
          ${escapeHtml(
            e.profession || "—"
          )}
        </span>

      </div>


      <div>

        <label>
          Found us via
        </label>

        <span>
          ${escapeHtml(
            e.how_discovered ||
            "—"
          )}
        </span>

      </div>


      <div>

        <label>
          Assigned to
        </label>

        <span>
          ${escapeHtml(
            e.assigned_to ||
            "Unassigned"
          )}
        </span>

      </div>

    </div>


    <section class="panel">

      <h3>
        Interested in
      </h3>

      <p>
        ${escapeHtml(
          e.interested_in ||
          "General enquiry"
        )}
      </p>

    </section>


    <section class="panel">

      <h3>
        Project requirements
      </h3>

      <p class="pre">
        ${escapeHtml(
          e.project_details ||
          "No project details supplied."
        )}
      </p>

    </section>


    <section class="panel">

      <h3>
        Conversation
      </h3>


      <div id="conversation">

        ${
          data.messages.length

            ? data.messages

                .map(m => `

                  <article
                    class="message ${
                      m.direction === "OUTBOUND"
                        ? "outbound"
                        : "inbound"
                    }"
                  >

                    <div
                      class="message-meta"
                    >

                      <strong>

                        ${
                          m.direction ===
                          "OUTBOUND"

                            ? "Stoneage Interiors"

                            : escapeHtml(
                                m.from_email ||
                                "Customer"
                              )
                        }

                      </strong>


                      <span>
                        ${formatDate(
                          m.created_at
                        )}
                      </span>

                    </div>


                    ${
                      m.subject

                        ? `
                          <div
                            class="message-subject"
                          >
                            ${escapeHtml(
                              m.subject
                            )}
                          </div>
                        `

                        : ""
                    }


                    <div
                      class="message-body"
                    >
                      ${escapeHtml(
                        m.body
                      )}
                    </div>

                  </article>

                `)

                .join("")

            : `
              <p class="muted">
                No messages yet.
              </p>
            `
        }

      </div>


      <!-- REPLY BOX -->

      <div class="reply-box">

        <textarea
          id="replyBody"
          placeholder="Write your reply to ${escapeHtml(
            e.name
          )}..."
          rows="7"
        ></textarea>

 <div class="reply-attachments">

    <input
      type="file"
      id="replyAttachments"
      multiple
    />

    <div id="selectedFiles" class="selected-files"></div>

  </div>
        <button
          type="button"
          id="sendReply"
          class="send-reply"
        >
          Send Reply
        </button>


        <div
          id="replyStatus"
        ></div>

      </div>

    </section>


    <!-- INTERNAL NOTES -->

    <section class="panel">

      <h3>
        Internal notes
      </h3>


      ${
        data.notes.length

          ? data.notes

              .map(n => `

                <article class="note">

                  <div>

                    <strong>
                      ${escapeHtml(
                        n.author ||
                        "Admin"
                      )}
                    </strong>

                    ·

                    ${formatDate(
                      n.created_at
                    )}

                  </div>


                  <p>
                    ${escapeHtml(
                      n.body
                    )}
                  </p>

                </article>

              `)

              .join("")

          : `
            <p class="muted">
              No internal notes yet.
            </p>
          `
      }


      <div class="note-box">

        <input
          id="noteAuthor"
          placeholder="Your name"
        >


        <textarea
          id="noteBody"
          placeholder="Add an internal note..."
        ></textarea>


        <button
          id="saveNote"
          type="button"
        >
          Add Note
        </button>

      </div>

    </section>

  `;


  /* =======================================================
     STATUS CHANGE
  ======================================================= */

  document
    .getElementById(
      "detailStatus"
    )
    .addEventListener(
      "change",
      async (event) => {

        const response =
          await authFetch(
            `/api/enquiries/${e.id}/status`,
            {
              method: "PATCH",

              body: JSON.stringify({
                status:
                  event.target.value
              })
            }
          );


        if (!response.ok) {

          const result =
            await response
              .json()
              .catch(
                () => ({})
              );


          alert(
            result.error ||
            "Unable to update status."
          );

          return;
        }


        await loadStats();

        await loadEnquiries();

      }
    );


  /* =======================================================
     SEND REPLY
  ======================================================= */

 /*
 * SEND REPLY
 */
document
  .getElementById("sendReply")
  .addEventListener("click", async () => {

    const textarea =
      document.getElementById("replyBody");

    const fileInput =
      document.getElementById("replyAttachments");

    const status =
      document.getElementById("replyStatus");

    const button =
      document.getElementById("sendReply");


    const body =
      textarea.value.trim();


    if (!body && fileInput.files.length === 0) {

      status.textContent =
        "Please write a reply or attach a file.";

      return;
    }


    button.disabled = true;
    button.textContent = "Sending...";
    status.textContent = "";


    try {

      /*
       * IMPORTANT:
       * Use FormData because we are
       * sending files.
       */

      const formData = new FormData();

      formData.append("body", body);


      /*
       * Add every selected attachment
       */

      for (const file of fileInput.files) {

        formData.append(
          "attachments",
          file
        );

      }


      /*
       * Get Shopify authentication token
       */

      const token =
        await window.shopify.idToken();


      const response =
        await fetch(
          `/api/enquiries/${e.id}/reply`,
          {
            method: "POST",

            headers: {
              "Authorization":
                `Bearer ${token}`
            },

            body: formData
          }
        );


      const result =
        await response.json();


      if (!response.ok) {

        throw new Error(
          result.error ||
          "Unable to send reply."
        );

      }


      status.textContent =
        "Reply sent successfully.";


      /*
       * Clear reply box
       */

      textarea.value = "";

      fileInput.value = "";


      const selectedFiles =
        document.getElementById("selectedFiles");

      if (selectedFiles) {
        selectedFiles.innerHTML = "";
      }


      /*
       * Reload conversation
       */

      await loadEnquiry(e.id);

      await loadStats();


    } catch (error) {

      console.error(
        "Reply error:",
        error
      );


      status.textContent =
        error.message ||
        "Unable to send reply.";


    } finally {

      /*
       * The HTML gets rebuilt after
       * loadEnquiry(), so don't try
       * to modify the old button here.
       */

    }

  });

/*
 * SHOW SELECTED ATTACHMENTS
 */
document
  .getElementById("replyAttachments")
  .addEventListener("change", (event) => {

    const files = Array.from(
      event.target.files
    );

    const container =
      document.getElementById("selectedFiles");


    if (!container) {
      return;
    }


    if (!files.length) {

      container.innerHTML = "";

      return;
    }


    container.innerHTML =
      files
        .map(file => `
          <div class="selected-file">
            ${escapeHtml(file.name)}
            <span>
              ${(file.size / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>
        `)
        .join("");

  });
  /* =======================================================
     ADD INTERNAL NOTE
  ======================================================= */

  document
    .getElementById(
      "saveNote"
    )
    .addEventListener(
      "click",
      async () => {

        const body =
          document
            .getElementById(
              "noteBody"
            )
            .value
            .trim();


        const author =
          document
            .getElementById(
              "noteAuthor"
            )
            .value
            .trim() ||
          "Admin";


        if (!body) {
          return;
        }


        const response =
          await authFetch(
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
            await response
              .json()
              .catch(
                () => ({})
              );


          alert(
            result.error ||
            "Unable to save note."
          );

          return;
        }


        await loadEnquiry(
          e.id
        );

      }
    );
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
  .getElementById(
    "refresh"
  )
  .addEventListener(
    "click",
    refreshAll
  );


let searchTimer;


document
  .getElementById(
    "search"
  )
  .addEventListener(
    "input",
    () => {

      clearTimeout(
        searchTimer
      );


      searchTimer =
        setTimeout(
          loadEnquiries,
          250
        );

    }
  );


document
  .getElementById(
    "statusFilter"
  )
  .addEventListener(
    "change",
    loadEnquiries
  );


/* =========================================================
   INITIAL LOAD
========================================================= */

refreshAll()
  .catch(error => {

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