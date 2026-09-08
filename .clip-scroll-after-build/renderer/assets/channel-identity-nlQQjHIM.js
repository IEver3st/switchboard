import { N as createLucideIcon } from "./demo-api-Ce3WgRJZ.js";
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Music2 = createLucideIcon("music-2", [["circle", {
	cx: "8",
	cy: "18",
	r: "4",
	key: "1fc0mg"
}], ["path", {
	d: "M12 18V2l7 4",
	key: "g04rme"
}]]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Save = createLucideIcon("save", [
	["path", {
		d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
		key: "1c8476"
	}],
	["path", {
		d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7",
		key: "1ydtos"
	}],
	["path", {
		d: "M7 3v4a1 1 0 0 0 1 1h7",
		key: "t51u73"
	}]
]);
//#endregion
//#region src/renderer/src/components/audio/channel-identity.ts
var mixerChannelOrder = [
	"game",
	"chat",
	"media",
	"aux",
	"mic"
];
var channelColors = {
	game: "var(--channel-game)",
	chat: "var(--channel-chat)",
	media: "var(--channel-media)",
	mic: "var(--channel-microphone)",
	microphone: "var(--channel-microphone)",
	aux: "var(--text-muted)"
};
function channelColor(channel) {
	return channelColors[channel];
}
//#endregion
export { Music2 as i, mixerChannelOrder as n, Save as r, channelColor as t };
