# Case Study: Counting Polkadots on an ASCII Dress

> A small puzzle where the trick is not the algorithm — it is identifying
> which characters in a dense ASCII art are *actually* the features the
> spec refers to. Three of them are red herrings.

## The problem

Given an ASCII portrait of a character wearing a polka-dot dress, compute:

```
score = polkadots_outside_lips_range
      + polkadots_inside_lips_range  *  chars_used_for_both_pupils
```

The lips define an inclusive x-coordinate range `[lipsStartX, lipsEndX]`.
A polkadot is counted "inside" if its x-coordinate falls in that range.
The multiplier is the total number of characters used to draw both pupils.

The spec adds one constraint: lips and pupils contain no `'`, `` ` ``, `,`,
or `-`.

## Why this is not as trivial as it looks

The whole puzzle reduces to three sub-problems, each with a trap:

### 1. Which character is the polkadot?

Answer: literal `O`. There are 42 of them, all on the dress, on seven rows.
Nothing in the title (`ÅÑGË£ÏÇÄ`) or the signature contains a plain `O`.

### 2. Which characters are the pupils?

The face has a single row containing `• ; •`. There are exactly two `•`
(bullet, U+2022) — one per eye. The `;` between them is the nose.

The trap: there are also `•` glyphs in the artist's signature on the
lower right (`•Å(V)åö•`, `•97•`, `•••`). A naive "find all `•`" picks
those up too and inflates the multiplier.

Robust rule: pick the *topmost* row that contains exactly two `•`. The
signature rows contain one, two-adjacent, or three bullets — never the
balanced "one bullet per side of a face" pattern, so they're filtered
out by row index.

Result: `numPupilChars = 2`.

### 3. Which characters are the lips?

This is the deepest trap. The art contains *three* candidate runs of `~`:

| Location | Run | What it actually is |
|---|---|---|
| Above the eyes | `~~~~~~` (6 tildes) | Eyebrow |
| Below the eyes | `~~~~~~` (6 tildes) | **Lips** |
| Bottom of dress | `~~~~~~~~~` (9 tildes) | Hem stitching |

If you grep for the longest run, you get the hem. If you grep for the
first run, you get the eyebrow. Both give the wrong answer.

Robust rule: pick the first contiguous run of `~` with length >= 2 that
sits on a row *below* the pupil row. That's geometrically the only place
a mouth can be.

There is also a single lone `~` on the lips row, separated by twelve
spaces from the contiguous run. It is decoration — not part of the lips,
because the lips are by definition a single contiguous shape.

Result: lips occupy x-coordinates **[32, 37]**.

## The numbers

- Total polkadots: **42**
- Inside `[32, 37]`: **10**
- Outside: **32**
- `numPupilChars`: **2**
- Score: `32 + 10 * 2 = `**`52`**

## Implementation notes

Two small things worth being explicit about:

**Unicode-aware iteration.** The art is full of non-ASCII characters
(`Å`, `–`, `„`, `¬`, `¸`, etc.). Iterating a JavaScript string with a
`for (let i = 0; i < s.length; i++)` walks UTF-16 code units, which
shifts column indices for any glyph above U+FFFF. Iterating with
`Array.from(line)` (or a `for...of` loop) walks code points, which
matches the visual column of the art. Doesn't matter for this specific
art (no astral plane characters), but it's the difference between
"code that works" and "code that works because we got lucky."

**Inclusive bounds.** The spec says `>=` and `<=`, not `<`. Off-by-one
on the boundary moves polkadots between buckets and changes the score.

## Files

- [`polkadot-score.js`](polkadot-score.js) — implementation. Exports
  `computePolkadotScore(art: string): number`. Running it directly
  (`node polkadot-score.js`) reads `angelica.txt` from the same folder
  and prints `52`.
- [`angelica.txt`](angelica.txt) — the ASCII art used as input.

## Run

```
node case-studies/polkadot-score/polkadot-score.js
# 52
```
