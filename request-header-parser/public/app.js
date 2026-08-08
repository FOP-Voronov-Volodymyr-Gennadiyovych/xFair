const API_ENDPOINT = "/api/whoami";

const elements = {
  ipaddress: document.querySelector("#ipaddress"),
  language: document.querySelector("#language"),
  software: document.querySelector("#software"),
  output: document.querySelector("#json-output"),
  status: document.querySelector("#request-status"),
  refresh: document.querySelector("#refresh-button"),
  copy: document.querySelector("#copy-button"),
};

let latestResponse = null;

async function loadHeaders() {
  elements.refresh.disabled = true;
  elements.status.textContent = "Reading headers";

  try {
    const response = await fetch(API_ENDPOINT, { cache: "no-store" });
    if (!response.ok) throw new Error(`Request failed with ${response.status}`);

    latestResponse = await response.json();
    elements.ipaddress.textContent = latestResponse.ipaddress || "Unavailable";
    elements.language.textContent = latestResponse.language || "Not supplied";
    elements.software.textContent = latestResponse.software || "Not supplied";
    elements.output.textContent = JSON.stringify(latestResponse, null, 2);
    elements.status.textContent = "Live response";
  } catch (error) {
    latestResponse = null;
    elements.ipaddress.textContent = "Request failed";
    elements.language.textContent = "Request failed";
    elements.software.textContent = "Request failed";
    elements.output.textContent = JSON.stringify({ error: "Unable to read request headers" }, null, 2);
    elements.status.textContent = "Service unavailable";
    console.error(error);
  } finally {
    elements.refresh.disabled = false;
  }
}

elements.refresh.addEventListener("click", loadHeaders);

elements.copy.addEventListener("click", async () => {
  if (!latestResponse) return;
  try {
    if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(JSON.stringify(latestResponse, null, 2));
    elements.copy.textContent = "Copied";
    setTimeout(() => { elements.copy.textContent = "Copy"; }, 1400);
  } catch {
    elements.copy.textContent = "Unavailable";
  }
});

loadHeaders();
