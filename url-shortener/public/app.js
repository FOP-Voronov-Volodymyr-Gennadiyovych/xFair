const form = document.querySelector("#shorten-form");
const input = document.querySelector("#url-input");
const formStatus = document.querySelector("#form-status");
const result = document.querySelector("#result");
const responseStatus = document.querySelector("#response-status");
const shortLink = document.querySelector("#short-link");
const originalUrl = document.querySelector("#original-url");
const shortCode = document.querySelector("#short-code");
const jsonOutput = document.querySelector("#json-output");
const copyButton = document.querySelector("#copy-button");
const submitButton = form.querySelector("button[type='submit']");

let latestShortUrl = "";

function renderResponse(data) {
  result.hidden = false;
  jsonOutput.textContent = JSON.stringify(data, null, 2);

  if (data.error) {
    result.classList.add("is-error");
    responseStatus.textContent = "Invalid URL";
    shortLink.textContent = "The destination could not be verified";
    shortLink.removeAttribute("href");
    originalUrl.textContent = input.value;
    shortCode.textContent = "-";
    latestShortUrl = "";
    return;
  }

  result.classList.remove("is-error");
  responseStatus.textContent = "200 OK";
  latestShortUrl = `${window.location.origin}/api/shorturl/${data.short_url}`;
  shortLink.href = latestShortUrl;
  shortLink.textContent = latestShortUrl;
  originalUrl.textContent = data.original_url;
  shortCode.textContent = data.short_url;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  formStatus.textContent = "Verifying destination";

  try {
    const response = await fetch("/api/shorturl", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ url: input.value }),
    });
    const data = await response.json();
    renderResponse(data);
    formStatus.textContent = data.error ? "DNS verification failed" : "Short link created";
  } catch (error) {
    renderResponse({ error: "Service unavailable" });
    formStatus.textContent = "Request failed";
    console.error(error);
  } finally {
    submitButton.disabled = false;
  }
});

copyButton.addEventListener("click", async () => {
  if (!latestShortUrl || !navigator.clipboard) return;
  try {
    await navigator.clipboard.writeText(latestShortUrl);
    copyButton.textContent = "Copied";
    setTimeout(() => { copyButton.textContent = "Copy"; }, 1400);
  } catch {
    copyButton.textContent = "Unavailable";
  }
});
