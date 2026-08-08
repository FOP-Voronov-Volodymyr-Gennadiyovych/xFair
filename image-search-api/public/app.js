const state = {
  query: "",
  page: 1,
  images: [],
  loading: false,
  controller: null,
};

const elements = {
  form: document.querySelector("#search-form"),
  input: document.querySelector("#search-input"),
  grid: document.querySelector("#image-grid"),
  status: document.querySelector("#results-status"),
  empty: document.querySelector("#empty-state"),
  previous: document.querySelector("#previous-page"),
  next: document.querySelector("#next-page"),
  pageIndicator: document.querySelector("#page-indicator"),
  endpoint: document.querySelector("#endpoint-preview"),
  copyEndpoint: document.querySelector("#copy-endpoint"),
  recentList: document.querySelector("#recent-list"),
};

function endpointPath(query = state.query, page = state.page) {
  return `/query/${encodeURIComponent(query)}?page=${page}`;
}

function updateLocation() {
  const url = new URL(window.location.href);
  url.searchParams.set("q", state.query);
  url.searchParams.set("page", state.page);
  history.replaceState({}, "", url);
}

function showSkeletons() {
  elements.grid.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 6; index += 1) {
    const skeleton = document.createElement("div");
    skeleton.className = "image-skeleton";
    skeleton.setAttribute("aria-hidden", "true");
    fragment.appendChild(skeleton);
  }
  elements.grid.appendChild(fragment);
}

function setLoading(isLoading) {
  state.loading = isLoading;
  elements.form.setAttribute("aria-busy", String(isLoading));
  elements.form.querySelector("button").disabled = isLoading;
  elements.input.disabled = isLoading;
  elements.previous.disabled = isLoading || state.page <= 1;
  elements.next.disabled = isLoading || state.images.length < 10;
  if (isLoading) {
    elements.empty.hidden = true;
    elements.status.textContent = "Searching open media...";
    showSkeletons();
  }
}

function createImageCard(image, index) {
  const article = document.createElement("article");
  article.className = "image-card";

  const imageLink = document.createElement("a");
  imageLink.className = "image-link";
  imageLink.href = image.url;
  imageLink.target = "_blank";
  imageLink.rel = "noreferrer";
  imageLink.setAttribute("aria-label", `Open original image: ${image.description}`);

  const imageElement = document.createElement("img");
  imageElement.src = image.thumbnail?.url || image.url;
  imageElement.alt = image.description;
  imageElement.loading = "lazy";

  const position = document.createElement("span");
  position.className = "image-index";
  position.textContent = String((state.page - 1) * 10 + index + 1).padStart(2, "0");
  imageLink.append(imageElement, position);

  const copy = document.createElement("div");
  copy.className = "image-copy";
  const description = document.createElement("p");
  description.className = "image-description";
  description.textContent = image.description;
  const source = document.createElement("a");
  source.className = "source-link";
  source.href = image.parentPage;
  source.target = "_blank";
  source.rel = "noreferrer";
  source.title = "Open source page";
  source.setAttribute("aria-label", `Open source page for ${image.description}`);
  source.innerHTML = '<i data-lucide="arrow-up-right"></i>';
  copy.append(description, source);

  article.append(imageLink, copy);
  return article;
}

function renderImages() {
  elements.grid.replaceChildren();
  elements.grid.hidden = state.images.length === 0;
  elements.empty.hidden = state.images.length > 0;

  const fragment = document.createDocumentFragment();
  state.images.forEach((image, index) => fragment.appendChild(createImageCard(image, index)));
  elements.grid.appendChild(fragment);

  elements.status.textContent = state.images.length
    ? `${state.images.length} images for "${state.query}"`
    : `No images for "${state.query}"`;
  elements.pageIndicator.textContent = `Page ${state.page}`;
  elements.endpoint.textContent = endpointPath();
  elements.previous.disabled = state.page <= 1;
  elements.next.disabled = state.images.length < 10;
  if (window.lucide) window.lucide.createIcons();
}

function formatSearchTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

async function loadRecentSearches() {
  try {
    const response = await fetch("/recent/");
    if (!response.ok) throw new Error(`Recent searches returned ${response.status}`);
    const searches = await response.json();
    elements.recentList.replaceChildren();

    if (!searches.length) {
      const placeholder = document.createElement("li");
      placeholder.className = "recent-placeholder";
      placeholder.textContent = "No searches yet.";
      elements.recentList.appendChild(placeholder);
      return;
    }

    const fragment = document.createDocumentFragment();
    searches.slice(0, 10).forEach((search) => {
      const item = document.createElement("li");
      item.className = "recent-item";
      const button = document.createElement("button");
      button.className = "recent-query";
      button.type = "button";
      button.textContent = search.searchQuery;
      button.addEventListener("click", () => {
        elements.input.value = search.searchQuery;
        searchForImages(search.searchQuery, 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      const time = document.createElement("time");
      time.className = "recent-time";
      time.dateTime = search.timeSearched;
      time.textContent = formatSearchTime(search.timeSearched);
      item.append(button, time);
      fragment.appendChild(item);
    });
    elements.recentList.appendChild(fragment);
  } catch (error) {
    console.warn(error);
  }
}

async function searchForImages(query, page = 1) {
  const cleanQuery = query.trim();
  if (!cleanQuery || state.loading) return;

  state.query = cleanQuery;
  state.page = Math.max(1, page);
  state.controller?.abort();
  state.controller = new AbortController();
  setLoading(true);
  updateLocation();
  elements.endpoint.textContent = endpointPath();

  try {
    const response = await fetch(endpointPath(), { signal: state.controller.signal });
    if (!response.ok) throw new Error(`Search returned ${response.status}`);
    const data = await response.json();
    state.images = data.images || [];
    renderImages();
    await loadRecentSearches();
  } catch (error) {
    if (error.name !== "AbortError") {
      console.warn(error);
      state.images = [];
      elements.grid.replaceChildren();
      elements.empty.hidden = false;
      elements.status.textContent = "Image search is temporarily unavailable.";
    }
  } finally {
    setLoading(false);
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  searchForImages(elements.input.value, 1);
});

elements.previous.addEventListener("click", () => {
  searchForImages(state.query, state.page - 1);
});

elements.next.addEventListener("click", () => {
  searchForImages(state.query, state.page + 1);
});

elements.copyEndpoint.addEventListener("click", async () => {
  const endpoint = new URL(endpointPath(), window.location.origin).href;
  await navigator.clipboard.writeText(endpoint);
  elements.copyEndpoint.title = "Copied";
  setTimeout(() => {
    elements.copyEndpoint.title = "Copy API endpoint";
  }, 1200);
});

window.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) window.lucide.createIcons();
  const url = new URL(window.location.href);
  const initialQuery = url.searchParams.get("q") || "aurora";
  const initialPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
  elements.input.value = initialQuery;
  searchForImages(initialQuery, Number.isFinite(initialPage) ? initialPage : 1);
});
