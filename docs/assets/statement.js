/* Turns the light markup typed in the judge panel into statement HTML.
   Used by the admin preview and by problem.html, so both always look the same.

     **n**          bold
     a_i  a_{i+1}   subscript
     10^5 10^{18}   superscript
     <=  >=  !=     ≤  ≥  ≠
     2*10^5         2·10⁵
     `code`         inline code
     ...            …
     blank line     new paragraph
     single newline line break                                              */

function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g,
    m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
}

function inlineMarkup(src) {
  const codes = [];
  let s = escHtml(src).replace(/`([^`]+)`/g, (m, c) => {
    codes.push(c);
    return "\u0000" + (codes.length - 1) + "\u0000";
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/(\d)\s*\*\s*(?=\d)/g, "$1·");
  s = s.replace(/\^\{([^}]+)\}/g, "<sup>$1</sup>")
       .replace(/\^([A-Za-z0-9]+)/g, "<sup>$1</sup>");
  s = s.replace(/([A-Za-z0-9)\]])_\{([^}]+)\}/g, "$1<sub>$2</sub>")
       .replace(/([A-Za-z0-9)\]])_([A-Za-z0-9]+)/g, "$1<sub>$2</sub>");
  s = s.replace(/&lt;=/g, "≤")
       .replace(/&gt;=/g, "≥")
       .replace(/!=/g, "≠")
       .replace(/\.\.\./g, "…")
       .replace(/ -- /g, " — ");

  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => "<code>" + codes[+i] + "</code>");
}

function blockMarkup(src, figures) {
  return String(src || "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      // a paragraph that is only "[figure N]" becomes that image
      const m = p.match(/^\[figure\s+(\d+)\]$/i);
      if (m) return figureHtml((figures || [])[+m[1] - 1], +m[1]);
      return "<p>" + inlineMarkup(p).replace(/\n/g, "<br>") + "</p>";
    })
    .join("");
}

function figureHtml(fig, n) {
  if (!fig || !fig.src) return '<p class="figure-missing">[figure ' + n + " is missing]</p>";
  if (!/^data:image\/(png|jpeg|gif|webp|svg\+xml);/.test(fig.src)) return "";
  return '<figure class="st-figure"><img src="' + fig.src + '" alt="' + escHtml(fig.caption || "Figure " + n) + '">' +
         (fig.caption ? "<figcaption>" + inlineMarkup(fig.caption) + "</figcaption>" : "") + "</figure>";
}

function renderStatement(p) {
  const lim = (label, value) => "<div><dt>" + label + "</dt><dd>" + value + "</dd></div>";

  let h = '<h1><span class="pid">' + escHtml(p.id) + "</span> " +
          escHtml(p.name || "Untitled problem") + "</h1>";

  h += '<dl class="limits">' +
       lim("Time limit", (p.timeLimit ?? 1) + " s") +
       lim("Memory limit", (p.memoryLimit ?? 256) + " MB") +
       "</dl>";

  if (p.speed) h += '<p class="speed-note"><span class="speed-tag">⚡ Speed problem</span>' +
                    "Only the first team to solve this problem gets it.</p>";

  const figs = p.figures || [];
  if (p.legend) h += "<section>" + blockMarkup(p.legend, figs) + "</section>";
  if (p.input)  h += "<h2>Input</h2><section>"  + blockMarkup(p.input, figs)  + "</section>";
  if (p.output) h += "<h2>Output</h2><section>" + blockMarkup(p.output, figs) + "</section>";

  const samples = (p.samples || []).filter(s =>
    String(s.input || "").trim() || String(s.output || "").trim());
  if (samples.length) {
    h += "<h2>" + (samples.length > 1 ? "Examples" : "Example") + "</h2>";
    h += samples.map(s =>
      '<div class="sample">' +
        '<div class="sample-col"><h3>Input</h3><pre>'  + escHtml(s.input  || "") + "</pre></div>" +
        '<div class="sample-col"><h3>Output</h3><pre>' + escHtml(s.output || "") + "</pre></div>" +
      "</div>").join("");
  }

  if (p.notes) h += "<h2>Notes</h2><section>" + blockMarkup(p.notes, figs) + "</section>";
  return h;
}

function hasStatement(p) {
  return Boolean(String(p.legend || "").trim() && String(p.input || "").trim() && String(p.output || "").trim());
}

/* Where the contest is right now. Submissions are accepted only while "running".
     locked   statements still hidden by the judge
     before   statements visible, but the start time has not come yet
     running  open for submissions
     over     the time is up                                              */
function contestPhase(c, now) {
  now = now || Date.now();
  const t0 = c.start ? new Date(c.start).getTime() : null;
  const t1 = t0 != null ? t0 + (c.durationMinutes || 0) * 60000 : null;
  if (t1 != null && now >= t1) return "over";
  if (!c.revealed) return "locked";
  if (t0 != null && now < t0) return "before";
  return "running";
}

/* The verdict box shared by the scoreboard and the judge panel. */
function verdictBox(c, emptyText) {
  const tries = n => n + (n === 1 ? " try" : " tries");
  if (c.state === "ac")
    return '<span class="box ac' + (c.first ? " first" : "") + '"><b>' + (c.first ? "⚡ First" : "Accepted") +
           "</b><small>minute " + c.minute + " · " + (c.fails ? tries(c.fails + 1) : "first try") + "</small></span>";
  if (c.state === "late")
    return '<span class="box late"><b>Accepted</b><small>not first · minute ' + c.minute + "</small></span>";
  if (c.state === "fail") {
    const tle = c.lastBad === "TLE";
    return '<span class="box ' + (tle ? "tle" : "wa") + '"><b>' +
           (tle ? "Time limit exceeded" : "Wrong answer") + "</b><small>" + tries(c.fails) + "</small></span>";
  }
  if (c.state === "pending")
    return '<span class="box pending"><b>Judging…</b></span>';
  return emptyText ? '<span class="box empty">' + emptyText + "</span>" : "";
}
