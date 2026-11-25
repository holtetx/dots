// Run: node mods/mh-lunch/emoji.test.mjs
import assert from "node:assert";
import { emojis } from "./emoji.js";

assert.equal(emojis("Fiskekake med poteter ,smør og råkost"), "🐟🥔🧈🥗");
assert.equal(emojis("Kalkunbryst med søtpotetmos og sjy"), "🦃🍠");
assert.equal(emojis("Penne Bolognese med revet ost"), "🍝🧀");
assert.equal(emojis("Hamburger (storfe) med tilbehør"), "🍔🥩");
assert.equal(emojis("Ratatoullie med ris og spinatsalat"), "🍆🍚🥬🥗");
assert.equal(emojis("Thanksgiving: Gresskarsuppe"), "🦃🎃🍲");
assert.equal(emojis("Dagens overraskelse"), "🍽️");
console.log("ok");
