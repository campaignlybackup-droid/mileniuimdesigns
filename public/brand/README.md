# Brand assets — REQUIRED, and supplied by the client

The build fails if either file below is missing. That is deliberate (09 P14 criterion (c)):
the alternative is substituting a text logo, which ships a wordmark nobody designed and which
nobody notices until it is on a printed invoice.

| File | What it is |
| --- | --- |
| `wordmark.svg` | The MILLENNIUM DESIGNS wordmark, as supplied |
| `monogram.svg` | The **M** monogram with the crescent counter, as supplied |

## Why these are not in the repository yet

**NEEDS INPUT — outstanding since P01.** The client has supplied raster images of both marks.
What is needed is the original vector artwork (`.ai`, `.eps` or `.svg`). Raster logos are not
usable here: the wordmark appears at everything from 18px in a footer to a full-bleed hero, and
the monogram is the loading spinner, which must stay crisp while rotating.

## What must NOT happen

Do not trace, redraw, approximate or "clean up" the marks from the raster images. `01 §5.10`
and the brief are explicit: **use these logos, do not redesign them.** A traced approximation
is a redesign that looks like the original at the size you checked it at.

`src/components/ui/Logo.tsx` accepts `variant` and `tone` and nothing else — no colour,
transform, filter or size-distorting props — so the component cannot be used to alter a mark
even once the real files are here.
