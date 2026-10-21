(function () {
  var section = document.querySelector(".photos");
  var gallery = document.getElementById("gallery");
  if (!section || !gallery) return;

  var BASE = "/assets/photos/";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var header = document.querySelector(".site-header");
  var bar = section.querySelector(".photos-bar");
  var chapterNav = section.querySelector(".photos-chapters");
  var tabs = section.querySelectorAll(".photos-toggle [data-view]");

  var photos = []; // {id, w, h, n (global index), by}
  var byId = {};
  var chapters = []; // {start, title, slug}
  var lists = {}; // view -> [photo]
  var view = null;
  var tiles = {}; // view -> {id: element}
  var layoutWidth = 0;
  // Full-resolution originals on Cloudflare R2, uploaded by tools/upload_originals.py as <id>.jpg.
  var ORIGINALS_URL = "https://pub-c5b1dc166354438cb6fdbfea271bcef3.r2.dev/";
  var SLIDE_MS = 4500;
  var FADE_MS = 1000;

  function thumb(p) {
    return BASE + "thumb/" + p.id + ".webp";
  }
  function full(p) {
    return BASE + "full/" + p.id + ".webp";
  }
  function original(p) {
    return ORIGINALS_URL + p.id + ".jpg";
  }
  function downloadName(p) {
    return "Hannah-and-Graham-" + p.id + ".jpg";
  }
  function chapterOf(p) {
    var c = null;
    for (var i = 0; i < chapters.length && chapters[i].start <= p.n; i++) c = chapters[i];
    return c;
  }

  /* ---------- URL state: "" | "#all" | "#favourites/<id>" | "#all/<id>" ---------- */

  function parseHash() {
    var parts = location.hash.replace(/^#/, "").split("/");
    var v = parts[0] === "all" ? "all" : "favourites";
    var id = parts[1] && byId[parts[1]] ? parts[1] : null;
    if (id && v === "favourites" && lists.favourites.indexOf(byId[id]) < 0) v = "all";
    return { view: v, id: id };
  }
  function hashFor(v, id) {
    if (id) return "#" + v + "/" + id;
    return v === "all" ? "#all" : location.pathname;
  }

  /* ---------- Justified layout ---------- */

  function targetHeight(v, width) {
    if (width < 600) return v === "favourites" ? 210 : 120;
    if (v === "favourites") return Math.max(260, Math.min(440, width * 0.26));
    return Math.max(190, Math.min(300, width * 0.18));
  }

  function justify(items, width, target, gap) {
    var rows = [];
    var row = [];
    var aspect = 0;
    items.forEach(function (p) {
      row.push(p);
      aspect += p.w / p.h;
      if (aspect * target + gap * (row.length - 1) >= width) {
        rows.push({ items: row, height: (width - gap * (row.length - 1)) / aspect });
        row = [];
        aspect = 0;
      }
    });
    if (row.length) rows.push({ items: row, height: Math.min(target, (width - gap * (row.length - 1)) / aspect), partial: true });
    return rows;
  }

  function tileFor(v, p, index) {
    var cache = tiles[v] || (tiles[v] = {});
    if (cache[p.id]) return cache[p.id];
    var b = document.createElement("button");
    b.type = "button";
    b.className = "photos-tile";
    b.dataset.id = p.id;
    b.setAttribute("aria-label", "Open photo " + (index + 1));
    var img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.addEventListener("load", function () {
      b.classList.add("is-loaded");
    });
    b.appendChild(img);
    b._photo = p;
    b._view = v;
    cache[p.id] = b;
    return b;
  }

  // Tiles load in page order as they approach the viewport; on-screen tiles load first.
  // Only the larger favourites tiles offer the 2048px copy to high-density screens.
  function loadTile(t, urgent) {
    if (t._requested) return;
    t._requested = true;
    loader.unobserve(t);
    var img = t.firstChild;
    if (urgent) img.fetchPriority = "high";
    if (t._view === "favourites") img.srcset = thumb(t._photo) + " 800w, " + full(t._photo) + " 2048w";
    img.src = thumb(t._photo);
    if (img.complete && img.naturalWidth) t.classList.add("is-loaded");
  }
  var loader = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) loadTile(e.target);
      });
    },
    { rootMargin: "150% 0px" }
  );

  var prefetched = false;
  function prefetchAll() {
    if (prefetched || !photos.length) return;
    prefetched = true;
    photos.slice(0, 60).forEach(function (p) {
      new Image().src = thumb(p);
    });
  }

  function groupsFor(v) {
    if (v === "favourites") return [{ title: null, items: lists.favourites }];
    return chapters.map(function (c, i) {
      var end = i + 1 < chapters.length ? chapters[i + 1].start : photos.length;
      return { chapter: c, items: photos.slice(c.start, end) };
    });
  }

  function render() {
    var width = gallery.clientWidth;
    var gap = parseFloat(getComputedStyle(section).getPropertyValue("--gap")) || 8;
    var target = targetHeight(view, width);
    var frag = document.createDocumentFragment();
    groupsFor(view).forEach(function (g) {
      if (!g.items.length) return;
      if (g.chapter) {
        var h = document.createElement("h3");
        h.className = "photos-chapter-title";
        h.id = g.chapter.slug;
        h.textContent = g.chapter.title;
        frag.appendChild(h);
      }
      justify(g.items, width, target, gap).forEach(function (r) {
        var rowEl = document.createElement("div");
        rowEl.className = r.partial ? "photos-row is-partial" : "photos-row";
        r.items.forEach(function (p) {
          var t = tileFor(view, p, view === "all" ? p.n : lists.favourites.indexOf(p));
          var w = (r.height * p.w) / p.h;
          t.style.width = w.toFixed(2) + "px";
          t.style.height = r.height.toFixed(2) + "px";
          t.firstChild.sizes = Math.ceil(w) + "px";
          markTile(t);
          rowEl.appendChild(t);
        });
        frag.appendChild(rowEl);
      });
    });
    gallery.replaceChildren(frag);
    layoutWidth = width;
    var vh = window.innerHeight;
    gallery.querySelectorAll(".photos-tile").forEach(function (t) {
      if (t._requested) return;
      var r = t.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) loadTile(t, true);
      else loader.observe(t);
    });
    updateCurrentChapter();
  }

  /* ---------- View switching ---------- */

  function galleryTop() {
    return gallery.getBoundingClientRect().top + window.scrollY - bar.offsetHeight - (parseFloat(bar.style.getPropertyValue("--bar-top")) || 0);
  }

  function setView(v, opts) {
    opts = opts || {};
    if (v === view && !opts.force) return;
    var first = view === null;
    var scrollBack = !first && window.scrollY > galleryTop();
    view = v;
    section.dataset.view = v;
    tabs.forEach(function (t) {
      var on = t.dataset.view === v && t.getAttribute("role") === "tab";
      if (t.getAttribute("role") === "tab") {
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        if (on) gallery.setAttribute("aria-labelledby", t.id);
      }
    });
    if (!opts.keepHash) history.replaceState(history.state, "", hashFor(v));

    function update() {
      render();
      if (scrollBack || opts.scroll) window.scrollTo({ top: Math.max(0, galleryTop() + 1), behavior: "instant" });
    }
    if (first || reduceMotion.matches) return update();
    clearTimeout(leaveTimer);
    gallery.classList.add("is-leaving");
    leaveTimer = setTimeout(function () {
      update();
      gallery.classList.remove("is-leaving");
      cascade();
    }, 180);
  }

  var leaveTimer;
  function cascade() {
    var vh = window.innerHeight;
    var n = 0;
    gallery.querySelectorAll(".photos-tile, .photos-chapter-title").forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      el.style.animationDelay = Math.min(n++, 24) * 28 + "ms";
      el.classList.add("is-entering");
      el.addEventListener(
        "animationend",
        function () {
          el.classList.remove("is-entering");
          el.style.animationDelay = "";
        },
        { once: true }
      );
    });
  }

  section.addEventListener("click", function (e) {
    var b = e.target.closest("[data-view]");
    if (b) setView(b.dataset.view, { scroll: !b.closest(".photos-toggle") });
  });
  section.querySelector(".photos-toggle").addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    var next = view === "all" ? "favourites" : "all";
    setView(next);
    section.querySelector('.photos-toggle [data-view="' + next + '"]').focus();
  });

  /* ---------- Sticky bar offset and current chapter ---------- */

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var shown = header && header.classList.contains("shrink") && !header.style.transform;
      bar.style.setProperty("--bar-top", shown ? header.offsetHeight + "px" : "0px");
      updateCurrentChapter();
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  function updateCurrentChapter() {
    if (view !== "all") return;
    var line = bar.getBoundingClientRect().bottom + 40;
    var current = chapters[0];
    chapters.forEach(function (c) {
      var h = document.getElementById(c.slug);
      if (h && h.getBoundingClientRect().top <= line) current = c;
    });
    chapterNav.querySelectorAll("a").forEach(function (a) {
      a.classList.toggle("is-current", a.hash === "#" + current.slug);
    });
  }

  chapterNav.addEventListener("click", function (e) {
    var a = e.target.closest("a");
    if (!a) return;
    e.preventDefault();
    var h = document.getElementById(a.hash.slice(1));
    if (!h) return;
    var y = h.getBoundingClientRect().top + window.scrollY - bar.offsetHeight - 16;
    window.scrollTo({ top: y, behavior: reduceMotion.matches ? "auto" : "smooth" });
  });

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (gallery.clientWidth !== layoutWidth) render();
      if (lb.open) lb.layout();
    }, 120);
  });

  /* ---------- Lightbox ---------- */

  var lbEl = document.getElementById("lightbox");
  var track = lbEl.querySelector(".lightbox-track");
  var counter = lbEl.querySelector(".lightbox-counter");
  var caption = lbEl.querySelector(".lightbox-caption");
  var prevBtn = lbEl.querySelector(".lightbox-prev");
  var nextBtn = lbEl.querySelector(".lightbox-next");
  var playBtn = lbEl.querySelector(".lightbox-play");
  var downloadLink = lbEl.querySelector(".lightbox-download");
  var EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

  var lb = {
    open: false,
    list: [],
    index: 0,
    slides: [],
    pushed: false,
    busy: null,
    returnFocus: null,
    playTimer: null,
    playing: false,
  };

  function makeSlide() {
    var s = document.createElement("div");
    s.className = "lightbox-slide";
    var img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    s.appendChild(img);
    track.appendChild(s);
    return s;
  }

  function fitSize(p, slide) {
    var cs = getComputedStyle(slide);
    var aw = slide.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var ah = slide.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var s = Math.min(aw / p.w, ah / p.h);
    return { w: p.w * s, h: p.h * s };
  }

  function fillSlide(slide, p) {
    var img = slide.firstChild;
    slide.dataset.id = p ? p.id : "";
    slide.style.visibility = p ? "" : "hidden";
    if (!p) {
      img.removeAttribute("src");
      return;
    }
    var size = fitSize(p, slide);
    img.style.width = size.w + "px";
    img.style.height = size.h + "px";
    if (img.dataset.id !== p.id) {
      img.dataset.id = p.id;
      img.style.backgroundImage = "url(" + thumb(p) + ")";
      img.src = full(p);
    }
  }

  function placeSlides(dx, animate) {
    lb.slides.forEach(function (s, i) {
      s.style.transition = animate ? "transform 0.45s " + EASE : "none";
      s.style.transform = "translateX(calc(" + (i - 1) * 100 + "% + " + (i - 1) * 24 + "px + " + (dx || 0) + "px))";
    });
  }

  lb.layout = function () {
    lb.slides.forEach(function (s, i) {
      fillSlide(s, lb.list[lb.index + i - 1]);
    });
    placeSlides(0, false);
  };

  function updateChrome() {
    var p = lb.list[lb.index];
    counter.textContent = lb.index + 1 + " / " + lb.list.length;
    var c = chapterOf(p);
    caption.textContent = (c ? c.title + " · " : "") + "Photo by " + p.by;
    prevBtn.disabled = lb.index === 0;
    nextBtn.disabled = lb.index === lb.list.length - 1;
    downloadLink.href = original(p);
    [2, -2].forEach(function (d) {
      var q = lb.list[lb.index + d];
      if (q) new Image().src = full(q);
    });
  }

  function tileRect(p) {
    var t = tiles[view] && tiles[view][p.id];
    if (!t || !t.isConnected) return null;
    var r = t.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return null;
    return r;
  }

  function flip(img, from, to, reverse, done) {
    var sx = from.width / to.width;
    var sy = from.height / to.height;
    var tr = "translate(" + (from.left - to.left) + "px," + (from.top - to.top) + "px) scale(" + sx + "," + sy + ")";
    img.style.transformOrigin = "0 0";
    img.style.transition = "none";
    img.style.transform = reverse ? "none" : tr;
    img.getBoundingClientRect();
    img.style.transition = "transform 0.5s " + EASE;
    img.style.transform = reverse ? tr : "none";
    setTimeout(done, 520);
  }

  function openLightbox(list, index, opts) {
    opts = opts || {};
    lb.list = list;
    lb.index = index;
    lb.open = true;
    lb.returnFocus = document.activeElement;
    var sbw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = sbw ? sbw + "px" : "";
    document.body.classList.add("lightbox-open");
    lbEl.hidden = false;
    if (!lb.slides.length) lb.slides = [makeSlide(), makeSlide(), makeSlide()];
    lb.layout();
    updateChrome();
    var p = list[index];
    if (opts.push !== false) {
      history.pushState({ lightbox: true }, "", hashFor(view, p.id));
      lb.pushed = true;
    }
    var img = lb.slides[1].firstChild;
    var from = !reduceMotion.matches && tileRect(p);
    requestAnimationFrame(function () {
      lbEl.classList.add("is-open");
      if (from) flip(img, from, img.getBoundingClientRect(), false, function () {});
    });
    lbEl.querySelector(".lightbox-close").focus({ preventScroll: true });
  }

  function closeLightbox() {
    if (!lb.open) return;
    lb.open = false;
    stopShow();
    finishMove();
    var p = lb.list[lb.index];
    var img = lb.slides[1].firstChild;
    var cur = tiles[view] && tiles[view][p.id];
    if (cur && !tileRect(p)) cur.scrollIntoView({ block: "center", behavior: "instant" });
    var to = !reduceMotion.matches && tileRect(p);
    lbEl.classList.remove("is-open");
    function done() {
      lbEl.hidden = true;
      img.style.transition = img.style.transform = "";
      lb.slides[1].style.opacity = "";
      document.body.classList.remove("lightbox-open");
      document.body.style.paddingRight = "";
      var focusEl = cur && cur.isConnected ? cur : lb.returnFocus;
      if (focusEl) focusEl.focus({ preventScroll: true });
    }
    if (to) {
      flip(img, to, img.getBoundingClientRect(), true, done);
    } else {
      lb.slides[1].style.transition = "opacity 0.3s ease";
      lb.slides[1].style.opacity = "0";
      setTimeout(done, 320);
    }
  }

  function requestClose() {
    if (lb.pushed) {
      lb.pushed = false;
      history.back();
    } else {
      history.replaceState(null, "", hashFor(view));
      closeLightbox();
    }
  }

  function finishMove() {
    if (lb.busy) {
      clearTimeout(lb.busy.timer);
      lb.busy.end();
    }
  }

  function go(delta) {
    stopShow();
    finishMove();
    var next = lb.index + delta;
    if (next < 0 || next >= lb.list.length) {
      placeSlides(-delta * 40, true);
      setTimeout(function () {
        placeSlides(0, true);
      }, 160);
      return;
    }
    placeSlides(-delta * (track.clientWidth + 24), !reduceMotion.matches);
    var end = function () {
      lb.busy = null;
      if (delta > 0) lb.slides.push(lb.slides.shift());
      else lb.slides.unshift(lb.slides.pop());
      lb.index = next;
      lb.layout();
      updateChrome();
      history.replaceState(history.state, "", hashFor(view, lb.list[lb.index].id));
    };
    lb.busy = { end: end, timer: setTimeout(end, reduceMotion.matches ? 0 : 450) };
  }

  /* Slideshow: crossfade to the next photo every few seconds. */

  function scheduleShow() {
    clearTimeout(lb.playTimer);
    lb.playTimer = setTimeout(advanceShow, SLIDE_MS);
  }

  function startShow() {
    if (lb.index >= lb.list.length - 1) return;
    lb.playing = true;
    playBtn.setAttribute("aria-pressed", "true");
    playBtn.setAttribute("aria-label", "Pause slideshow");
    lbEl.classList.add("is-playing");
    scheduleShow();
  }

  function stopShow() {
    clearTimeout(lb.playTimer);
    lb.playTimer = null;
    lb.playing = false;
    playBtn.setAttribute("aria-pressed", "false");
    playBtn.setAttribute("aria-label", "Play slideshow");
    lbEl.classList.remove("is-playing");
  }

  function advanceShow() {
    if (!lb.open) return;
    finishMove();
    var next = lb.index + 1;
    if (next >= lb.list.length) return stopShow();
    var cur = lb.slides[1];
    var incoming = lb.slides[2];
    var img = incoming.firstChild;
    var ready = img.complete && img.naturalWidth ? Promise.resolve() : img.decode().catch(function () {});
    ready.then(function () {
      if (!lb.open || !lb.playing) return;
      var end = function () {
        lb.busy = null;
        [cur, incoming].forEach(function (s) {
          s.style.transition = "none";
          s.classList.remove("is-fading");
          s.style.opacity = "";
          s.style.zIndex = "";
        });
        lb.slides.push(lb.slides.shift());
        lb.index = next;
        lb.layout();
        updateChrome();
        history.replaceState(history.state, "", hashFor(view, lb.list[lb.index].id));
        if (!lb.playing) return;
        if (lb.index < lb.list.length - 1) scheduleShow();
        else stopShow();
      };
      if (reduceMotion.matches) return end();
      incoming.style.transition = "none";
      incoming.style.transform = "translateX(0px)";
      incoming.style.zIndex = "1";
      incoming.style.opacity = "0";
      incoming.getBoundingClientRect();
      incoming.classList.add("is-fading");
      cur.classList.add("is-fading");
      incoming.style.opacity = "1";
      cur.style.opacity = "0";
      lb.busy = { end: end, timer: setTimeout(end, FADE_MS) };
    });
  }

  playBtn.addEventListener("click", function () {
    if (lb.playing) stopShow();
    else startShow();
  });

  prevBtn.addEventListener("click", function () {
    go(-1);
  });
  nextBtn.addEventListener("click", function () {
    go(1);
  });
  lbEl.querySelector(".lightbox-close").addEventListener("click", requestClose);

  document.addEventListener("keydown", function (e) {
    if (!lb.open) return;
    if (e.key === "Escape") requestClose();
    else if (e.key === " " && document.activeElement.tagName !== "BUTTON") {
      e.preventDefault();
      playBtn.click();
    }
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "Tab") {
      var f = Array.prototype.filter.call(lbEl.querySelectorAll("button, a[href]"), function (b) {
        return !b.disabled && b.offsetParent;
      });
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });

  // Swipe to navigate, drag down to close, tap outside the photo to close.
  var drag = null;
  track.addEventListener("pointerdown", function (e) {
    if (e.button) return;
    stopShow();
    finishMove();
    drag = { x: e.clientX, y: e.clientY, t: Date.now(), dx: 0, dy: 0, axis: null, target: e.target };
    track.setPointerCapture(e.pointerId);
  });
  track.addEventListener("pointermove", function (e) {
    if (!drag) return;
    drag.dx = e.clientX - drag.x;
    drag.dy = e.clientY - drag.y;
    if (!drag.axis && Math.abs(drag.dx) + Math.abs(drag.dy) > 8) drag.axis = Math.abs(drag.dx) > Math.abs(drag.dy) ? "x" : "y";
    if (drag.axis === "x") {
      var edge = (lb.index === 0 && drag.dx > 0) || (lb.index === lb.list.length - 1 && drag.dx < 0);
      placeSlides(edge ? drag.dx / 3 : drag.dx, false);
    } else if (drag.axis === "y" && drag.dy > 0) {
      lb.slides[1].style.transition = "none";
      lb.slides[1].style.transform = "translateY(" + drag.dy + "px) scale(" + (1 - Math.min(drag.dy / 2000, 0.15)) + ")";
      lbEl.querySelector(".lightbox-backdrop").style.opacity = String(0.97 * (1 - Math.min(drag.dy / 400, 0.7)));
    }
  });
  function endDrag(e) {
    if (!drag) return;
    var d = drag;
    drag = null;
    var v = Math.abs(d.dx) / Math.max(1, Date.now() - d.t);
    var backdrop = lbEl.querySelector(".lightbox-backdrop");
    if (d.axis === "x") {
      if (Math.abs(d.dx) > 80 || v > 0.4) go(d.dx < 0 ? 1 : -1);
      else placeSlides(0, true);
    } else if (d.axis === "y") {
      backdrop.style.opacity = "";
      if (d.dy > 120) {
        lb.slides[1].style.transform = "";
        requestClose();
      } else {
        lb.slides[1].style.transition = "transform 0.3s " + EASE;
        lb.slides[1].style.transform = "translateX(0)";
      }
    } else if (e.type === "pointerup" && d.target === lb.slides[1]) {
      requestClose();
    }
  }
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);

  gallery.addEventListener("click", function (e) {
    var t = e.target.closest(".photos-tile");
    if (!t) return;
    if (sel.on) return toggleSelected(t);
    var list = lists[view];
    openLightbox(list, list.indexOf(byId[t.dataset.id]));
  });

  window.addEventListener("popstate", function () {
    var s = parseHash();
    if (lb.open && !s.id) {
      lb.pushed = false;
      closeLightbox();
    } else if (!lb.open && s.id) {
      if (s.view !== view) setView(s.view, { keepHash: true });
      openLightbox(lists[view], lists[view].indexOf(byId[s.id]), { push: false });
    }
  });

  /* ---------- Select mode ---------- */

  var selectBtn = section.querySelector(".photos-select-btn");
  var selectBar = document.querySelector(".photos-selectbar");
  var selCount = selectBar.querySelector(".photos-selectbar-count");
  var selDownload = selectBar.querySelector(".photos-sel-download");
  var selClear = selectBar.querySelector(".photos-sel-clear");
  var selNote = selectBar.querySelector(".photos-selectbar-note");
  var sel = { on: false, ids: new Set(), queue: null };

  function markTile(t) {
    var id = t.dataset.id;
    t.classList.toggle("is-selected", sel.ids.has(id));
    if (sel.on) t.setAttribute("aria-pressed", String(sel.ids.has(id)));
    else t.removeAttribute("aria-pressed");
  }
  function markAllTiles() {
    Object.keys(tiles).forEach(function (v) {
      Object.keys(tiles[v]).forEach(function (id) {
        markTile(tiles[v][id]);
      });
    });
  }

  function setNote(html) {
    selNote.innerHTML = html || "";
    selNote.hidden = !html;
  }

  function updateSelectBar() {
    var n = sel.ids.size;
    selCount.textContent = n ? n + (n === 1 ? " photo" : " photos") + " selected" : "Tap photos to select them";
    selClear.disabled = !n;
    if (!sel.queue) selDownload.disabled = !n;
    if (!sel.queue) setNote("");
  }

  function setSelectMode(on) {
    if (sel.on === on) return;
    sel.on = on;
    section.classList.toggle("is-selecting", on);
    selectBtn.setAttribute("aria-pressed", String(on));
    if (on) {
      selectBar.hidden = false;
      requestAnimationFrame(function () {
        selectBar.classList.add("is-open");
      });
    } else {
      stopDownloads();
      sel.ids.clear();
      selectBar.classList.remove("is-open");
      setTimeout(function () {
        if (!sel.on) selectBar.hidden = true;
      }, 450);
    }
    markAllTiles();
    updateSelectBar();
  }

  function toggleSelected(t) {
    var id = t.dataset.id;
    if (sel.ids.has(id)) sel.ids.delete(id);
    else sel.ids.add(id);
    markAllTiles();
    updateSelectBar();
  }

  function selectedPhotos() {
    return Array.from(sel.ids)
      .map(function (id) {
        return byId[id];
      })
      .sort(function (a, b) {
        return a.n - b.n;
      });
  }

  /* Downloads: one photo saves directly; several are fetched and saved as one zip. */

  var ZIP_PART_LIMIT = 3.9e9; // plain zip offsets must stay under 4 GiB
  var FETCH_CONCURRENCY = 4;
  var originalsInfo = null; // id -> [size, crc32], from tools/build_photos.py

  function loadOriginalsInfo() {
    return (originalsInfo ||= fetch(BASE + "originals.json").then(function (r) {
      if (!r.ok) throw new Error("originals.json " + r.status);
      return r.json();
    }));
  }

  function saveBlob(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 60000);
  }

  function fetchOriginal(p, signal) {
    var attempt = 0;
    function tryOnce() {
      return fetch(original(p), { signal: signal, mode: "cors" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.blob();
        })
        .catch(function (err) {
          if (signal.aborted || ++attempt >= 6) throw err;
          return new Promise(function (res) {
            setTimeout(res, 1000 * Math.pow(2, attempt - 1));
          }).then(tryOnce);
        });
    }
    return tryOnce();
  }

  // Uncompressed ("stored") zip; JPEGs do not compress further.
  function zipBlob(entries) {
    var DOS_TIME = 12 << 11;
    var DOS_DATE = ((2026 - 1980) << 9) | (9 << 5) | 19;
    var enc = new TextEncoder();
    var parts = [];
    var central = [];
    var offset = 0;
    entries.forEach(function (e) {
      var name = enc.encode(e.name);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(6, 0x0800, true);
      h.setUint16(10, DOS_TIME, true);
      h.setUint16(12, DOS_DATE, true);
      h.setUint32(14, e.crc >>> 0, true);
      h.setUint32(18, e.size, true);
      h.setUint32(22, e.size, true);
      h.setUint16(26, name.length, true);
      parts.push(h.buffer, name, e.blob);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true);
      c.setUint16(12, DOS_TIME, true);
      c.setUint16(14, DOS_DATE, true);
      c.setUint32(16, e.crc >>> 0, true);
      c.setUint32(20, e.size, true);
      c.setUint32(24, e.size, true);
      c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.push(c.buffer, name);
      offset += 30 + name.length + e.size;
    });
    var cdSize = central.reduce(function (n, b) {
      return n + b.byteLength;
    }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end.buffer]), { type: "application/zip" });
  }

  function megabytes(n) {
    return n >= 1e9 ? (n / 1e9).toFixed(1) + " GB" : Math.round(n / 1e6) + " MB";
  }

  function startDownloads() {
    var items = selectedPhotos();
    if (!items.length) return;
    if (items.length === 1) {
      var a = document.createElement("a");
      a.href = original(items[0]);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setNote("Downloading 1 photo\u2026");
      return;
    }
    stopDownloads();
    var ctrl = new AbortController();
    sel.queue = ctrl;
    selDownload.disabled = true;
    setNote("Preparing download\u2026");
    loadOriginalsInfo()
      .then(function (info) {
        // Split into parts that each stay under the plain-zip size limit.
        var groups = [[]];
        var acc = 0;
        items.forEach(function (p) {
          var size = info[p.id][0];
          if (acc + size > ZIP_PART_LIMIT && groups[groups.length - 1].length) {
            groups.push([]);
            acc = 0;
          }
          groups[groups.length - 1].push(p);
          acc += size;
        });
        var total = items.reduce(function (n, p) {
          return n + info[p.id][0];
        }, 0);
        var got = 0;
        var count = 0;
        function progress() {
          setNote("Preparing " + count + " of " + items.length + " photos (" + megabytes(got) + " of " + megabytes(total) + ")\u2026");
        }
        progress();
        return groups.reduce(function (chain, group, gi) {
          return chain.then(function () {
            var entries = new Array(group.length);
            var next = 0;
            function worker() {
              if (next >= group.length) return Promise.resolve();
              var i = next++;
              var p = group[i];
              return fetchOriginal(p, ctrl.signal).then(function (blob) {
                var meta = info[p.id];
                if (blob.size !== meta[0]) throw new Error(p.id + ": expected " + meta[0] + " bytes, got " + blob.size);
                entries[i] = { name: downloadName(p), size: meta[0], crc: meta[1], blob: blob };
                got += meta[0];
                count++;
                if (!ctrl.signal.aborted) progress();
                return worker();
              });
            }
            var workers = [];
            for (var w = 0; w < FETCH_CONCURRENCY; w++) workers.push(worker());
            return Promise.all(workers).then(function () {
              if (ctrl.signal.aborted) throw new DOMException("Aborted", "AbortError");
              var suffix = groups.length > 1 ? "-part-" + (gi + 1) + "-of-" + groups.length : "";
              saveBlob(zipBlob(entries), "Hannah-and-Graham-photos" + suffix + ".zip");
            });
          });
        }, Promise.resolve()).then(function () {
          return groups.length;
        });
      })
      .then(function (nParts) {
        if (sel.queue !== ctrl) return;
        sel.queue = null;
        selDownload.disabled = !sel.ids.size;
        setNote("Saved " + items.length + " photos" + (nParts > 1 ? " in " + nParts + " zip files." : " as a zip file."));
      })
      .catch(function (err) {
        if (sel.queue !== ctrl || err.name === "AbortError") return;
        ctrl.abort();
        sel.queue = null;
        selDownload.disabled = !sel.ids.size;
        setNote("Sorry, the download didn\u2019t finish. Please check your connection and try again.");
        if (window.console) console.warn("photo download failed", err);
      });
  }
  function stopDownloads() {
    if (sel.queue) sel.queue.abort();
    sel.queue = null;
  }

  selectBtn.addEventListener("click", function () {
    setSelectMode(true);
  });
  selectBar.querySelector(".photos-sel-done").addEventListener("click", function () {
    setSelectMode(false);
  });
  selClear.addEventListener("click", function () {
    sel.ids.clear();
    markAllTiles();
    updateSelectBar();
  });
  selDownload.addEventListener("click", startDownloads);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && sel.on && !lb.open) setSelectMode(false);
  });

  /* ---------- Load ---------- */

  fetch(BASE + "photos.json")
    .then(function (r) {
      return r.json();
    })
    .then(function (m) {
      photos = m.photos.map(function (a, n) {
        var p = { id: a[0], w: a[1], h: a[2], n: n, by: a[0].charAt(0) === "d" ? "Davide" : "Carlotta" };
        byId[p.id] = p;
        return p;
      });
      chapters = m.chapters.map(function (c) {
        return { start: c[0], title: c[1], slug: "section-" + c[1].toLowerCase().replace(/[^a-z0-9]+/g, "-") };
      });
      lists.all = photos;
      lists.favourites = m.favourites.map(function (id) {
        return byId[id];
      });
      section.querySelector(".photos-count").textContent = "(" + photos.length.toLocaleString("en-US") + ")";
      chapterNav.innerHTML = chapters
        .map(function (c) {
          return '<a href="#' + c.slug + '">' + c.title + "</a>";
        })
        .join("");
      var s = parseHash();
      setView(s.view, { keepHash: true });
      var idle = window.requestIdleCallback || function (f) { setTimeout(f, 1500); };
      if (document.readyState === "complete") idle(prefetchAll, { timeout: 3000 });
      else window.addEventListener("load", function () { idle(prefetchAll, { timeout: 3000 }); });
      section.querySelector('#tab-all').addEventListener("pointerenter", prefetchAll);
      if (s.id) openLightbox(lists[view], lists[view].indexOf(byId[s.id]), { push: false });
    })
    .catch(function () {
      gallery.innerHTML = '<p class="photos-note">The photos could not be loaded. Please refresh the page.</p>';
    });
})();
