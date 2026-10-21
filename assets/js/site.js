(function () {
  var header = document.querySelector(".site-header");
  var root = document.documentElement;
  var body = document.body;
  if (!header) return;

  function setHeaderHeight() {
    if (header.classList.contains("shrink")) return;
    root.style.setProperty("--header-h", header.getBoundingClientRect().height + "px");
  }
  setHeaderHeight();
  window.addEventListener("resize", setHeaderHeight);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(setHeaderHeight);

  // Hide on scroll down, show after scrolling up 200px within 500ms.
  var lastY = window.scrollY;
  var upDistance = 0;
  var lastTime = 0;
  var shrinkTimer;
  function onScroll() {
    var y = window.scrollY;
    if (body.classList.contains("menu-open")) return;
    var scrolled = y > 10;
    if (scrolled) {
      clearTimeout(shrinkTimer);
      header.classList.add("shrink");
    } else {
      shrinkTimer = setTimeout(function () {
        header.classList.remove("shrink");
      }, 300);
    }
    if (!scrolled || header.matches(":focus-within")) {
      header.style.transform = "";
    } else if (y > lastY) {
      header.style.transform = "translateY(-100%)";
    } else if (y < lastY) {
      var now = Date.now();
      upDistance += lastY - y;
      if (now - lastTime > 500) upDistance = 0;
      if (upDistance > 200) header.style.transform = "";
      lastTime = now;
    }
    lastY = y;
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // Mobile menu
  var burger = header.querySelector(".burger");
  var menu = document.getElementById("menu");
  if (!burger || !menu) return;
  function setMenu(open) {
    body.classList.toggle("menu-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Close Menu" : "Open Menu");
    menu.hidden = !open;
  }
  burger.addEventListener("click", function () {
    setMenu(!body.classList.contains("menu-open"));
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && body.classList.contains("menu-open")) setMenu(false);
  });
  window.addEventListener("resize", function () {
    if (window.innerWidth > 799 && body.classList.contains("menu-open")) setMenu(false);
  });
})();
