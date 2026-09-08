# Browser inspect: http://localhost:5199/
- load: 200 OK — final url: http://localhost:5199/#…
- viewport: 1420x900 css px (dpr 1), scrollWidth 1420
- title: Switchboard
- page text length: 198 chars
- screenshot: C:\Users\User\Desktop\Development\Applications\switchboard\.opencode\vision\browser-inspect-2026-09-04T06-26-43-moezdq-1420x900.png

## Coordinate text map (DOM-OCR, y-sorted, 14 runs)
- y=63.5 x=118.4 "Clips" <h2> 17px/700
- y=65.9 x=1016.9 "Automatic game" <span> 11px/500
- y=66.4 x=1171.3 "1 min" <span> 10.5px/400
- y=66.9 x=934.1 "Off" <span> 10px/650
- y=66.9 x=1230.2 "Replay" <span> 10px/400
- y=71.5 x=173.6 "0 clips" <p> 10.5px/400
- y=110 x=893.8 "Filter" <span> 16px/400
- y=110 x=963.2 "Newest" <span> 16px/400
- y=110 x=1232.7 "Montage" <span> 16px/400
- y=111 x=1232.7 "Create" <span> 16px/400
- y=125.3 x=24.9 "Devices" <span> 9.5px/560
- y=195.3 x=23.4 "Capture" <span> 9.5px/650
- y=320.4 x=677.9 "Capture unavailable" <h3> 14px/600
- y=354.1 x=614.2 "Windows capture is not available for this system configuration." <p> 11px/400

## Region outline (2 blocks, y-sorted)
- aside "DevicesCapture" @ (0,0) 90x900
- section "Capture[data-radix-scroll-area-viewport]" @ (90,47.5) 1330x852.5

## Interactive controls (12)
- button "Devices" @ (10,82.5) 80x65
- button "Capture" @ (10,152.5) 80x65
- button "Settings" @ (22.5,840) 45x45
- button "Capture source: Automatic game" @ (980.9,58.8) 175.5x35
- [role=switch] "Instant Replay" @ (1276.6,61.3) 52.5x30
- button "Open replay settings. Replay Off. Instant Replay is turned o" @ (1351.6,56.3) 40x40
- input "Search clips" @ (149.4,106) 618x38
- button "Filter clips" @ (855.3,105) 95.7x40
- [role=combobox] "Sort clips" @ (949.7,105) 140x40
- [role=radio] "Grid view" @ (1100.7,106) 38.8x40
- [role=radio] "List view" @ (1139.5,106) 38.8x40
- button "Create Montage" @ (1191.7,105) 199.9x40 [disabled]

## Headings (3)
- h1 "Capture" 16px @ (88.8,46.3) 1.3x1.3
- h2 "Clips" 17px @ (118.4,63.5) 45.2x25.5
- h3 "Capture unavailable" 14px @ (677.9,320.4) 154.2x26.3

## Canvas/image regions (pixel content — use Qwen-MM Core only when pixel evidence is material)
- img (empty alt, decorative?) @ (20,13.8)

## Accessibility summary
- headings: h1×1, h2×1, h3×1
- landmarks: 3

## Viewport 1420x900 (ok)
- horizontal overflow: none (scrollWidth 1420 <= 1420)

## Action/step issues
- action click "Settings": locator.click: Timeout 15000ms exceeded.