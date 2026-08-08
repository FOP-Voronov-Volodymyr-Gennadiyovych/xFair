const elements = {
  userForm: document.querySelector("#user-form"),
  username: document.querySelector("#username"),
  userStatus: document.querySelector("#user-status"),
  userSelect: document.querySelector("#user-select"),
  exerciseForm: document.querySelector("#exercise-form"),
  exerciseStatus: document.querySelector("#exercise-status"),
  filterForm: document.querySelector("#filter-form"),
  logUser: document.querySelector("#log-user"),
  logCount: document.querySelector("#log-count"),
  logList: document.querySelector("#log-list"),
};

function activeUserId() {
  return elements.userSelect.value;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed with ${response.status}`);
  return data;
}

function formRequest(form) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(new FormData(form)),
  };
}

async function loadUsers(selectedId = activeUserId()) {
  const users = await requestJson("/api/users");
  elements.userSelect.replaceChildren();

  if (!users.length) {
    const option = new Option("No users yet", "");
    elements.userSelect.add(option);
  } else {
    users.forEach((user) => elements.userSelect.add(new Option(user.username, user._id)));
    elements.userSelect.value = users.some((user) => user._id === selectedId)
      ? selectedId
      : users.at(-1)._id;
  }
  updateControls();
}

function updateControls() {
  const enabled = Boolean(activeUserId());
  elements.exerciseForm.querySelector("button").disabled = !enabled;
  elements.filterForm.querySelector("button").disabled = !enabled;
  if (enabled) loadLog();
}

function renderLog(data) {
  elements.logUser.textContent = `${data.username} / ${data._id}`;
  elements.logCount.textContent = `${data.count} ${data.count === 1 ? "session" : "sessions"}`;
  elements.logList.replaceChildren();

  if (!data.log.length) {
    const empty = document.createElement("p");
    empty.className = "empty-message";
    empty.textContent = "No exercises match this view.";
    elements.logList.appendChild(empty);
    return;
  }

  data.log.forEach((exercise, index) => {
    const row = document.createElement("article");
    row.className = "log-row";
    const number = document.createElement("span");
    number.className = "log-index";
    number.textContent = String(index + 1).padStart(2, "0");
    const description = document.createElement("strong");
    description.textContent = exercise.description;
    const duration = document.createElement("span");
    duration.textContent = `${exercise.duration} min`;
    const date = document.createElement("time");
    date.textContent = exercise.date;
    row.append(number, description, duration, date);
    elements.logList.appendChild(row);
  });
}

async function loadLog() {
  if (!activeUserId()) return;
  const query = new URLSearchParams(new FormData(elements.filterForm));
  [...query].forEach(([key, value]) => { if (!value) query.delete(key); });
  const suffix = query.size ? `?${query}` : "";
  try {
    renderLog(await requestJson(`/api/users/${activeUserId()}/logs${suffix}`));
  } catch (error) {
    elements.exerciseStatus.textContent = error.message;
  }
}

elements.userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = elements.userForm.querySelector("button");
  button.disabled = true;
  elements.userStatus.textContent = "Creating user";
  try {
    const user = await requestJson("/api/users", formRequest(elements.userForm));
    elements.userStatus.textContent = `Created ${user.username}`;
    elements.userForm.reset();
    await loadUsers(user._id);
  } catch (error) {
    elements.userStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

elements.exerciseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = elements.exerciseForm.querySelector("button");
  button.disabled = true;
  elements.exerciseStatus.textContent = "Recording exercise";
  try {
    const exercise = await requestJson(
      `/api/users/${activeUserId()}/exercises`,
      formRequest(elements.exerciseForm),
    );
    elements.exerciseStatus.textContent = `${exercise.description} added for ${exercise.date}`;
    elements.exerciseForm.reset();
    await loadLog();
  } catch (error) {
    elements.exerciseStatus.textContent = error.message;
  } finally {
    button.disabled = !activeUserId();
  }
});

elements.filterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadLog();
});

elements.userSelect.addEventListener("change", updateControls);

loadUsers().catch((error) => {
  elements.userStatus.textContent = error.message;
});
