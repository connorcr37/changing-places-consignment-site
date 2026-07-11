document.querySelectorAll("[data-current-year]").forEach((year) => {
  year.textContent = String(new Date().getFullYear());
});

const desktop = window.matchMedia("(min-width: 48.01rem)");
const toggle = document.getElementById("menu-toggle");
const menu = document.getElementById("primary-navigation");

const closeMenu = () => {
  menu?.classList.remove("show");
  toggle?.setAttribute("aria-expanded", "false");
};

if (toggle && menu) {
  toggle.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("show");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("show")) {
      closeMenu();
      toggle.focus();
    }
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });
}

document.querySelectorAll(".faq-question").forEach((button) => {
  const answer = document.getElementById(button.getAttribute("aria-controls"));

  button.addEventListener("click", () => {
    const isOpen = button.classList.toggle("active");
    button.setAttribute("aria-expanded", String(isOpen));
    if (answer) answer.hidden = !isOpen;
  });
});

const logo = document.querySelector(".logo-img");
const navLinks = [...document.querySelectorAll('nav a[href^="#"]')];
const sections = navLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

const updatePageState = () => {
  if (desktop.matches) closeMenu();

  logo?.classList.toggle(
    "logo-scrolled",
    desktop.matches && window.scrollY > 80,
  );

  if (!sections.length) return;

  let current = "";
  sections.forEach((section) => {
    if (window.scrollY >= section.offsetTop - 120) current = section.id;
  });

  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 10) {
    current = "contact";
  }

  navLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#${current}`;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "location");
    } else {
      link.removeAttribute("aria-current");
    }
  });
};

window.addEventListener("scroll", updatePageState, { passive: true });
window.addEventListener("resize", updatePageState);
window.addEventListener("load", updatePageState);
updatePageState();
