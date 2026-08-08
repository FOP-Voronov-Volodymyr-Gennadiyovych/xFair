const form = document.querySelector("#upload-form");
const input = document.querySelector("#upfile");
const dropZone = document.querySelector("#drop-zone");
const fileName = document.querySelector("#file-name");
const filePreview = document.querySelector("#file-preview");
const status = document.querySelector("#upload-status");
const submitButton = form.querySelector("button[type='submit']");
const result = document.querySelector("#result");
const responseStatus = document.querySelector("#response-status");
const resultName = document.querySelector("#result-name");
const resultType = document.querySelector("#result-type");
const resultSize = document.querySelector("#result-size");
const jsonOutput = document.querySelector("#json-output");

function formatBytes(value) {
  if (value < 1024) return `${value} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function showSelectedFile(file) {
  if (!file) {
    fileName.textContent = "Choose a file";
    filePreview.textContent = "or drop it here";
    dropZone.classList.remove("has-file");
    return;
  }
  fileName.textContent = file.name;
  filePreview.textContent = `${file.type || "Unknown type"} / ${formatBytes(file.size)}`;
  dropZone.classList.add("has-file");
}

function renderResponse(data, ok) {
  result.hidden = false;
  jsonOutput.textContent = JSON.stringify(data, null, 2);
  result.classList.toggle("is-error", !ok);
  responseStatus.textContent = ok ? "200 OK" : "Upload error";
  resultName.textContent = ok ? data.name : data.error;
  resultType.textContent = ok ? data.type : "-";
  resultSize.textContent = ok ? data.size.toLocaleString("en-US", { useGrouping: false }) : "-";
}

input.addEventListener("change", () => showSelectedFile(input.files[0]));

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  showSelectedFile(file);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!input.files.length) return;
  submitButton.disabled = true;
  status.textContent = "Reading file metadata";

  try {
    const response = await fetch(form.action, {
      method: "POST",
      body: new FormData(form),
    });
    const data = await response.json();
    renderResponse(data, response.ok);
    status.textContent = response.ok ? "Upload complete" : data.error;
  } catch (error) {
    renderResponse({ error: "Upload failed" }, false);
    status.textContent = "Service unavailable";
    console.error(error);
  } finally {
    submitButton.disabled = false;
  }
});
