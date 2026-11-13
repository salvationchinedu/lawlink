// The built-in text of the About page. The admin can replace it in Settings, then About page.
window.ABOUT_DEFAULT = [
  '## What Lex-Tabulā is',
  'Lex-Tabulā is a study space for law students in Nigerian universities. It gives every student the same course list and the same topic notes, so you can study from one source whatever school you attend.',
  '',
  '## How the notes are written',
  'Course and topic notes are written by Lex-Tabulā and shared with everyone. Students cannot edit them. Your own notes are private and only you can see them. When a note mentions a case, tap its name to open the case page.',
  '',
  '## Where the courses come from',
  'Courses and topics follow the National Universities Commission\'s Core Curriculum and Minimum Academic Standards for Law, together with faculty curricula. Courses marked ★ are required by the Council of Legal Education for a qualifying degree.',
  '',
  '## Verified notes',
  'A note marked "Verified" has been checked for completeness. Notes without the mark may still be improved.',
  '',
  '## Please read',
  'Lex-Tabulā notes are study aids. They are not legal advice and do not replace your lecturer, the law reports or the statutes. Before you cite a case or section in an assignment or exam, check it in the original source.',
  '',
  '## Found a mistake?',
  'Open the note and tap Report an error at the bottom. We read every report.',
  '',
  '## Install the app',
  'In your phone\'s browser menu, choose Add to Home Screen. Lex-Tabulā then opens like an app, and pages you have already visited load without data.',
  '',
  '## Notifications',
  'Lex-Tabulā can send a notification to your phone, even when the app is closed. In Settings, then Notifications, you choose which ones you want:',
  '- An answer to a question you asked in Community.',
  '- An announcement from Lex-Tabulā, such as exam dates or new topics.',
  '- A reminder before your pass ends, once passes are in use.',
  '- A daily study reminder, at a time you choose.',
  'You can turn any of them off, or all of them, at any time. On an iPhone or iPad, add Lex-Tabulā to your Home Screen first, then turn notifications on from there.'
].join('\n');

// Turns the simple text format into safe HTML for the About page.
//   "## " starts a section with a heading, "- " is a bullet, a plain line is a paragraph,
//   **two stars** make bold, and web addresses (https://…) and email addresses become links.
window.aboutHtml = function (t) {
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var inl = function (s) {
    var re = /\*\*(.+?)\*\*|(https?:\/\/[^\s<>"']+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;
    var out = '', last = 0, m;
    while ((m = re.exec(s))) {
      out += esc(s.slice(last, m.index));
      if (m[1] !== undefined) out += '<b>' + esc(m[1]) + '</b>';
      else if (m[2]) {
        var u = m[2], tail = '';
        while (/[.,;:!?)\]]$/.test(u)) { tail = u.slice(-1) + tail; u = u.slice(0, -1); }
        out += '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u) + '</a>' + esc(tail);
      } else out += '<a href="mailto:' + esc(m[3]) + '">' + esc(m[3]) + '</a>';
      last = re.lastIndex;
    }
    return out + esc(s.slice(last));
  };
  var out = [], list = false, open = false;
  var section = function (h) {
    if (list) { out.push('</ul>'); list = false; }
    if (open) out.push('</section>');
    out.push('<section class="sset">'); open = true;
    if (h) out.push('<h2>' + inl(h) + '</h2>');
  };
  String(t || '').split('\n').forEach(function (ln) {
    ln = ln.replace(/\s+$/, '');
    var h = /^##\s+(.*)$/.exec(ln), li = /^\s*[-*] +(.*)$/.exec(ln);
    if (h) { section(h[1]); return; }
    if (!ln.trim()) { if (list) { out.push('</ul>'); list = false; } return; }
    if (!open) section('');
    if (li) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inl(li[1]) + '</li>'); return; }
    if (list) { out.push('</ul>'); list = false; }
    out.push('<p class="d">' + inl(ln.trim()) + '</p>');
  });
  if (list) out.push('</ul>');
  if (open) out.push('</section>');
  return out.join('');
};
