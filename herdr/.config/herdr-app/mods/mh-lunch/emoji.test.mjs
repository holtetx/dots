// Run: node mods/mh-lunch/emoji.test.mjs
import assert from "node:assert";
import { emojis } from "./emoji.js";

const E = (name) => emojis(name).join("");

assert.equal(E("Fiskekake med poteter ,smør og råkost"), "🐟🥔🧈🥗");
assert.equal(E("Kalkunbryst med søtpotetmos og sjy"), "🦃🍠");
assert.equal(E("Penne Bolognese med revet ost"), "🍝🧀");
assert.equal(E("Hamburger (storfe) med tilbehør"), "🍔🥩");
assert.equal(E("Ratatoullie med ris og spinatsalat"), "🍆🍚🥬🥗");
assert.equal(E("Thanksgiving: Gresskarsuppe"), "🎃🍲");
assert.equal(E("Dagens overraskelse"), "🍽️");
console.log("ok");
