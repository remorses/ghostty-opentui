---
"ghostty-opentui": patch
---

Native-paint rounded box-drawing corners (`╭ ╮ ╯ ╰`) as SVG arcs.

Previously these characters fell back to font text while the adjacent `─`/`│` lines were drawn natively (centered in the cell), so the corners never connected to the lines — leaving visible gaps and stubs that got worse as line height increased. They are now rendered as quadratic arcs whose endpoints land on the cell edge midpoints, matching where the straight box lines connect, so rounded boxes render as clean, continuous shapes at any line height.
