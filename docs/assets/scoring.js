/* How the standings are computed.

   Every problem is worth the same.
   Rank    = more problems solved first; on a tie, less penalty first.
   Penalty = for each solved problem: the minute it was solved
             + penaltyPerFail minutes for every rejected try before it.
             Tries on a problem that was never solved cost nothing.

   A problem marked "speed" counts only for the first team that solves it.
   Every other team that solves it later sees "Accepted, not first" and gets nothing. */

function buildBoard(data) {
  const perFail = data.contest.penaltyPerFail ?? 20;

  // an empty cell for every team and problem
  const cells = {};
  data.teams.forEach(t => {
    cells[t.id] = {};
    data.problems.forEach(p => {
      cells[t.id][p.id] = { state: "none", fails: 0, minute: null, lastBad: null, order: null, first: false };
    });
  });

  // attempts in time order; attempts in the same minute keep the order they were recorded in
  const subs = data.submissions
    .map((s, i) => Object.assign({ order: i }, s))
    .sort((a, b) => a.minute - b.minute || a.order - b.order);

  subs.forEach(s => {
    const c = cells[s.team] && cells[s.team][s.problem];
    if (!c) return;                       // attempt for a team or problem that was removed
    if (c.state === "ac") return;         // nothing counts after the solve

    if (s.verdict === "AC") {
      c.state = "ac";
      c.minute = s.minute;
      c.order = s.order;
    } else if (s.verdict === "PENDING") {
      if (c.state === "none") c.state = "pending";
    } else {                              // WA or TLE
      c.fails++;
      c.lastBad = s.verdict;
      c.state = "fail";
    }
  });

  // speed problems: keep the earliest solve, turn every later one into "late"
  data.problems.filter(p => p.speed).forEach(p => {
    let best = null;
    data.teams.forEach(t => {
      const c = cells[t.id][p.id];
      if (c.state !== "ac") return;
      if (!best || c.minute < best.minute || (c.minute === best.minute && c.order < best.order)) best = c;
    });
    data.teams.forEach(t => {
      const c = cells[t.id][p.id];
      if (c.state !== "ac") return;
      if (c === best) c.first = true;
      else c.state = "late";
    });
  });

  const rows = data.teams.map(t => {
    let solved = 0, penalty = 0;
    data.problems.forEach(p => {
      const c = cells[t.id][p.id];
      if (c.state === "ac") {
        solved++;
        penalty += c.minute + perFail * c.fails;
      }
    });
    return { team: t, solved, score: solved, penalty };
  });

  rows.sort((a, b) =>
    b.solved - a.solved ||
    a.penalty - b.penalty ||
    a.team.name.localeCompare(b.team.name));

  // equal solved and penalty share a rank
  let rank = 0, prevKey = null;
  rows.forEach((r, i) => {
    const key = r.solved + "/" + r.penalty;
    if (key !== prevKey) { rank = i + 1; prevKey = key; }
    r.rank = rank;
  });

  return { cells, rows };
}
