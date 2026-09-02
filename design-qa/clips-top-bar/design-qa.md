# Clips top bar design QA

## Comparison input

- Reference: the supplied capture-library screenshot with a recorder rail above a single library command row.
- Implementation: native Electron Capture route at 1420 x 900.
- Combined review: `reference-vs-implementation.png`.

## Iteration findings

1. The prior header split library identity, replay controls, and commands across two visually divided rows. Replaced it with a full-width recorder rail and one library row.
2. The prior search field consumed most available space. Bounded it to 340 px and anchored Create Montage beside the Clips identity.
3. Repeated full-width rules appeared below the header and across every date group. Removed those separators and used spacing, type, and restrained tonal surfaces for hierarchy.
4. At 1080 px, secondary labels collapse while all primary controls remain reachable. No toolbar or page-level horizontal overflow was measured.

## Native verification

| Viewport | Columns | Header height | Search width | Toolbar overflow | Page overflow |
| --- | ---: | ---: | ---: | --- | --- |
| 1080 x 720 | 5 | 92 px | 320 px | No | No |
| 1420 x 900 | 5 | 92 px | 340 px | No | No |
| 1920 x 1080 | 5 | 92 px | 340 px | No | No |

- Verified the disabled recorder state and empty library state in native Electron.
- Exercised search, favorites, game/date filters, sort, grid/list switching, clip actions, montage selection/composer, replay settings, source picker, keyboard focus restoration, and editor opening.
- Confirmed 15 of 15 images remain lazy-loaded and the five-column grid remains stable at every required review size.
- Existing focus and reduced-motion behavior remains attached to the reused controls and popovers.

final result: passed
