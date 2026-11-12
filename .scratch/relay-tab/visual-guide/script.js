const editor = document.querySelector("#editor");
for (const id of ["add", "empty-add"])
  document
    .getElementById(id)
    .addEventListener("click", () => editor.showModal());
document.querySelector("#kind").addEventListener("change", (event) => {
  const explicit = event.target.selectedIndex === 1;
  document.querySelector("#peer-label").hidden = !explicit;
  document.querySelector("#endpoint-label").textContent = explicit
    ? "Complete multiaddrs, one per line"
    : "HTTPS discovery URL";
});
document.querySelector("#toggle-state").addEventListener("click", (event) => {
  const empty = document.querySelector("#empty");
  empty.hidden = !empty.hidden;
  document.querySelector("#relay-list").hidden = !empty.hidden;
  event.target.textContent = empty.hidden
    ? "Show empty state"
    : "Show example relays";
  document.querySelector("#summary-title").textContent = empty.hidden
    ? "1 relay ready"
    : "No relays configured";
  document.querySelector("#summary-detail").textContent = empty.hidden
    ? "1 needs attention"
    : "Add a relay to get started";
});
document.querySelector(".menu").addEventListener("click", (event) => {
  const sidebar = document.querySelector(".sidebar");
  sidebar.classList.toggle("menu-panel");
  event.currentTarget.setAttribute(
    "aria-expanded",
    sidebar.classList.contains("menu-panel")
  );
});
document.querySelector("#login").addEventListener("click", (event) => {
  event.currentTarget.textContent = "Preview only";
});
