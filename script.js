const header = document.querySelector("[data-header]");
const heroImage = document.querySelector(".hero-image");
const reveals = document.querySelectorAll(".reveal");
const menuToggle = document.querySelector("[data-menu-toggle]");
const mobileMenu = document.querySelector("[data-mobile-menu]");
const contactForm = document.querySelector("[data-contact-form]");
const formStatus = document.querySelector("[data-form-status]");

const setHeaderState = () => {
  header.classList.toggle("is-scrolled", window.scrollY > 18);
};

const setMenuState = (isOpen) => {
  if (!menuToggle || !mobileMenu) return;
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  mobileMenu.classList.toggle("is-open", isOpen);
  document.body.classList.toggle("menu-open", isOpen);
};

const setHeroMotion = () => {
  if (!heroImage || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const offset = Math.min(window.scrollY * 0.08, 42);
  heroImage.style.transform = `translateY(${offset}px) scale(1.02)`;
};

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  {
    rootMargin: "0px 0px -12% 0px",
    threshold: 0.12,
  }
);

reveals.forEach((item) => observer.observe(item));
setHeaderState();
setHeroMotion();

if (menuToggle && mobileMenu) {
  menuToggle.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") !== "true";
    setMenuState(isOpen);
  });

  mobileMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenuState(false));
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenuState(false);
  });
}

if (contactForm) {
  const submitButton = contactForm.querySelector("button[type='submit']");
  const requiredFields = [...contactForm.querySelectorAll("[required]")];

  const setFormStatus = (message, type = "") => {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.classList.toggle("is-success", type === "success");
    formStatus.classList.toggle("is-error", type === "error");
    formStatus.classList.toggle("is-warning", type === "warning");
  };

  const updateFieldState = (field) => {
    field.setAttribute("aria-invalid", String(!field.validity.valid));
  };

  requiredFields.forEach((field) => {
    field.addEventListener("blur", () => updateFieldState(field));
    field.addEventListener("input", () => {
      if (field.getAttribute("aria-invalid") === "true") updateFieldState(field);
    });
  });

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    requiredFields.forEach(updateFieldState);

    if (!contactForm.checkValidity()) {
      setFormStatus("Complete all required fields before submitting.", "error");
      contactForm.querySelector(":invalid")?.focus();
      return;
    }

    const formData = new FormData(contactForm);

    setFormStatus("Sending your enquiry...");
    if (submitButton) submitButton.disabled = true;

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
        },
        body: formData,
      });
      const result = await response.json().catch(() => ({
        ok: false,
        message: "Unexpected server response.",
      }));

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Unable to send the enquiry.");
      }

      contactForm.reset();
      requiredFields.forEach((field) => field.removeAttribute("aria-invalid"));
      setFormStatus(
        result.message || "Thank you. Your enquiry has been received.",
        result.delivered === false ? "warning" : "success"
      );
    } catch (error) {
      setFormStatus(error.message || "Unable to send the enquiry. Please try again.", "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

window.addEventListener("scroll", () => {
  setHeaderState();
  setHeroMotion();
}, { passive: true });

window.addEventListener("resize", () => {
  if (window.innerWidth > 980) setMenuState(false);
});
