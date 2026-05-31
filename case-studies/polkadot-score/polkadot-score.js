/**
 * computePolkadotScore
 *
 * Counts polkadots (the character 'O') on an ASCII-art dress.
 * Polkadots whose x-coordinate falls within the inclusive x-range of the
 * subject's lips are weighted by the total number of characters used to
 * draw both pupils.
 *
 *   score = polkadotsOutsideLipsRange
 *         + polkadotsInsideLipsRange * charsUsedForBothPupils
 *
 * Feature detection inside the art:
 *
 *   - Polkadots are the literal character 'O'.
 *
 *   - Pupils are '•' (U+2022). The face contains two of them on a single
 *     row, separated by a ';' (the nose, not a pupil). Several other '•'
 *     glyphs appear in the artist's signature on the lower right of the
 *     canvas — we ignore those by selecting the topmost row that contains
 *     exactly two '•'.
 *
 *   - Lips are a contiguous run of '~' (length >= 2) located below the
 *     pupil row. The art also contains a '~~~~~~' run above the eyes
 *     (the eyebrow) — easy to confuse with the lips if you only search
 *     for tildes. A stray single '~' on the lips row is decoration, not
 *     part of the contiguous lip shape.
 *
 * Notes:
 *   - We iterate by Unicode code points (Array.from) rather than UTF-16
 *     code units, so non-ASCII glyphs elsewhere in the art (Å, Ñ, –, „,
 *     etc.) do not shift column indices.
 *   - The spec states that lips and pupils contain no ', `, , or - chars.
 *     '~' and '•' satisfy that constraint.
 */
function computePolkadotScore(art) {
  const lines = art.split('\n');

  const dots = [];
  const bullets = [];
  const tildes = [];

  lines.forEach((line, y) => {
    Array.from(line).forEach((ch, x) => {
      if (ch === 'O') dots.push({ x, y });
      else if (ch === '•') bullets.push({ x, y });
      else if (ch === '~') tildes.push({ x, y });
    });
  });

  const bulletsPerRow = {};
  bullets.forEach(b => (bulletsPerRow[b.y] = (bulletsPerRow[b.y] || 0) + 1));
  const pupilRow = Object.keys(bulletsPerRow)
    .map(Number)
    .filter(y => bulletsPerRow[y] === 2)
    .sort((a, b) => a - b)[0];
  const numPupilChars = bullets.filter(b => b.y === pupilRow).length;

  const sorted = [...tildes].sort((a, b) => a.y - b.y || a.x - b.x);
  const runs = [];
  let cur = null;
  for (const t of sorted) {
    if (cur && t.y === cur.y && t.x === cur.endX + 1) {
      cur.endX = t.x;
      cur.length++;
    } else {
      if (cur && cur.length >= 2) runs.push(cur);
      cur = { y: t.y, startX: t.x, endX: t.x, length: 1 };
    }
  }
  if (cur && cur.length >= 2) runs.push(cur);

  const lips = runs.find(r => r.y > pupilRow);
  const { startX: lipsStartX, endX: lipsEndX } = lips;

  let inside = 0, outside = 0;
  for (const d of dots) {
    if (d.x >= lipsStartX && d.x <= lipsEndX) inside++;
    else outside++;
  }

  return outside + inside * numPupilChars;
}

module.exports = { computePolkadotScore };

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const art = fs.readFileSync(path.join(__dirname, 'angelica.txt'), 'utf8');
  console.log(computePolkadotScore(art));
}
