/*
  This is the JavaScript patch for the EXISTING Stoneage enquiry form.

  Your existing Liquid can keep all its current fields and styling.
  Change the form submission behaviour so the form posts to:

      /apps/enquiries/submit

  The backend stores the enquiry in PostgreSQL.

  IMPORTANT:
  Do not put SHOPIFY_API_SECRET in this file.
*/

(function () {
  const form = document.getElementById("enquiry-form");
  if (!form) return;

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const interests = Array.from(
      document.querySelectorAll("[data-pill]:checked")
    ).map((el) => el.value);

    const hidden = document.getElementById("eq-interests-hidden");
    if (hidden) hidden.value = interests.join(", ");

    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      const response = await fetch("/apps/enquiries/submit", {
        method: "POST",
        body: new FormData(form),
        credentials: "same-origin"
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to submit your enquiry.");
      }

      // Use your existing success UI here instead of alert().
      alert(
        `${result.message}\n\nYour enquiry reference is ${result.reference}.`
      );

      form.reset();
    } catch (error) {
      console.error(error);
      alert(error.message || "Unable to submit your enquiry.");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
})();
