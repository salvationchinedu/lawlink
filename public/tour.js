// Lex-Tabulā first-time welcome: four short cards, shown once per student, reopened from the menu ("How Lex-Tabulā works").
(function () {
  var root = null, idx = 0, opener = null, onKey = null, startX = null;
  var NS = 'lawlink-tour';

  var CARDS = [
    {
      t: 'Read your courses',
      p: 'Open a course and read it topic by topic. Cases and statutes in the notes are linked, so you can check them yourself.',
      v: '<div class="tr-mini"><span class="tr-ring"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100"/><circle class="v" cx="18" cy="18" r="15.9" pathLength="100" stroke-dasharray="40 100" transform="rotate(-90 18 18)"/></svg></span><span class="tr-line"><b>Law of Contract</b><i>Topic 3: Offer and acceptance</i></span></div>'
    },
    {
      t: 'Test yourself',
      p: 'Finish a topic, then tap Take quiz. You get 10 questions. Score 80% or more and the topic is marked learnt.',
      v: '<div class="tr-mini tr-row"><span class="tr-pill">Take quiz</span><svg class="tr-arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg><span class="tr-pill ok">✓ Learnt</span></div>'
    },
    {
      t: 'Find the law fast',
      p: 'Use the search box on Home for courses, topics and notes. Open Statutes in the menu for the Constitution, Acts and the Maxims of Equity.',
      v: '<div class="tr-mini"><span class="tr-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>Search courses, topics and notes</span><span class="tr-chips"><i>Statutes</i><i>Maxims of Equity</i></span></div>'
    },
    {
      t: 'Keep your streak going',
      p: 'Home shows your streak, quizzes done today and the topics to revisit. The rings show how much of each course you have learnt.',
      v: '<div class="tr-mini tr-row"><span class="tr-stat"><b>5</b><i>day streak</i></span><span class="tr-stat"><b>2/3</b><i>quizzes today</i></span><span class="tr-ring sm"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" pathLength="100"/><circle class="v" cx="18" cy="18" r="15.9" pathLength="100" stroke-dasharray="65 100" transform="rotate(-90 18 18)"/></svg></span></div>'
    }
  ];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mark() { try { localStorage.setItem(NS, '1'); } catch (e) {} }
  function tell() { try { if (window.LawLink && LawLink.loggedIn && LawLink.loggedIn() && LawLink.tourSeen) LawLink.tourSeen().catch(function () {}); } catch (e) {} }

  function focusables() { return root ? [].slice.call(root.querySelectorAll('button:not([disabled]):not([hidden])')) : []; }

  function draw() {
    var c = CARDS[idx], last = idx === CARDS.length - 1;
    var dots = '';
    for (var i = 0; i < CARDS.length; i++) dots += '<i' + (i === idx ? ' class="on"' : '') + '></i>';
    root.querySelector('.tr-body').innerHTML =
      '<div class="tr-vis">' + c.v + '</div>' +
      '<h2 class="tr-t" id="tr-t">' + esc(c.t) + '</h2>' +
      '<p class="tr-p">' + esc(c.p) + '</p>';
    root.querySelector('.tr-dots').innerHTML = dots;
    root.querySelector('.tr-count').textContent = 'Step ' + (idx + 1) + ' of ' + CARDS.length;
    var back = root.querySelector('.tr-back'), next = root.querySelector('.tr-next'), skip = root.querySelector('.tr-skip');
    back.hidden = idx === 0;
    next.textContent = last ? 'Start learning' : 'Next';
    skip.hidden = last;
  }

  function go(n) {
    if (n < 0 || n >= CARDS.length) return;
    idx = n; draw();
    var f = root.querySelector('.tr-next'); if (f) f.focus();
  }

  function close() {
    if (!root) return;
    mark(); tell();
    document.removeEventListener('keydown', onKey, true);
    document.documentElement.style.overflow = '';
    var r = root; root = null;
    if (r.parentNode) r.parentNode.removeChild(r);
    try { if (opener && opener.focus && document.body.contains(opener)) opener.focus(); } catch (e) {}
    opener = null;
  }

  function open(from) {
    if (root) return;
    opener = from || document.activeElement; idx = 0;
    root = document.createElement('div');
    root.className = 'tr-ov';
    root.innerHTML =
      '<div class="tr-card" role="dialog" aria-modal="true" aria-labelledby="tr-t">' +
        '<div class="tr-top"><span class="tr-count" aria-live="polite"></span><button class="tr-skip" type="button">Skip</button></div>' +
        '<div class="tr-body"></div>' +
        '<div class="tr-dots" aria-hidden="true"></div>' +
        '<div class="tr-btns"><button class="tr-back" type="button">Back</button><button class="tr-next" type="button">Next</button></div>' +
      '</div>';
    document.body.appendChild(root);
    document.documentElement.style.overflow = 'hidden';
    root.querySelector('.tr-skip').addEventListener('click', close);
    root.querySelector('.tr-back').addEventListener('click', function () { go(idx - 1); });
    root.querySelector('.tr-next').addEventListener('click', function () { if (idx === CARDS.length - 1) close(); else go(idx + 1); });
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    var card = root.querySelector('.tr-card');
    card.addEventListener('touchstart', function (e) { startX = e.touches && e.touches[0] ? e.touches[0].clientX : null; }, { passive: true });
    card.addEventListener('touchend', function (e) {
      if (startX === null) return;
      var x = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : startX, d = x - startX; startX = null;
      if (d < -50) { if (idx < CARDS.length - 1) go(idx + 1); } else if (d > 50) go(idx - 1);
    }, { passive: true });
    onKey = function (e) {
      if (!root) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'ArrowRight') { if (idx < CARDS.length - 1) go(idx + 1); return; }
      if (e.key === 'ArrowLeft') { go(idx - 1); return; }
      if (e.key === 'Tab') {
        var f = focusables(); if (!f.length) return;
        var a = document.activeElement, i = f.indexOf(a);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    draw();
    root.querySelector('.tr-next').focus();
  }

  // On Home: show it once to a signed-in student who has finished profile setup and has not seen it on any phone.
  function auto() {
    try {
      if (!window.LawLink || !LawLink.loggedIn || !LawLink.loggedIn()) return;
      if (localStorage.getItem(NS)) return;
      // Automated browsers skip it unless asked, so test runs are not covered by a pop-up.
      if (/[?&]notour\b/.test(location.search) || (navigator.webdriver && !/[?&]tour=1\b/.test(location.search))) return;
      LawLink.getProfile().then(function (d) {
        var p = d && d.profile;
        if (!p || !p.done) return;
        if (p.tour) { mark(); return; }
        open(null);
      }).catch(function () {});
    } catch (e) {}
  }

  window.LTTour = { open: open, auto: auto, close: close };
})();
