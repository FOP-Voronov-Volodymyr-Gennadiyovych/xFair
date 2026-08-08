const form = document.querySelector("#timestamp-form");
const input = document.querySelector("#date-input");
const unixResult = document.querySelector("#unix-result");
const utcResult = document.querySelector("#utc-result");
const resultGrid = document.querySelector("#result-grid");
const status = document.querySelector("#status");
const requestPath = document.querySelector("#request-path");
const openRequest = document.querySelector("#open-request");
const quickActions = [...document.querySelectorAll("[data-value]")];

function endpointFor(value) {
  return value ? `/api/${encodeURIComponent(value)}` : "/api/";
}

async function convert(value) {
  const endpoint = endpointFor(value.trim());
  requestPath.textContent = endpoint;
  openRequest.href = endpoint;
  status.textContent = "Loading";
  resultGrid.classList.remove("is-error");

  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Request failed with ${response.status}`);
    const data = await response.json();

    if (data.error) {
      unixResult.textContent = "Invalid Date";
      utcResult.textContent = "Check the supplied value";
      status.textContent = "Invalid";
      resultGrid.classList.add("is-error");
      return;
    }

    unixResult.textContent = data.unix.toLocaleString("en-US", { useGrouping: false });
    utcResult.textContent = data.utc;
    status.textContent = "200 OK";
  } catch (error) {
    unixResult.textContent = "Request failed";
    utcResult.textContent = "Try again shortly";
    status.textContent = "Offline";
    resultGrid.classList.add("is-error");
    console.error(error);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  convert(input.value);
});

quickActions.forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.value;
    convert(input.value);
  });
});

convert("");
