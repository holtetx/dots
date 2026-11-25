// Emojis for a Norwegian dish name, in the order the words come. No Herdr imports, so node can test it (emoji.test.mjs).

const WORDS = [
  [/kalkun/, "🦃"],
  [/fisk|laks|torsk|\bsei\b|hyse|ørret|makrell|sild/, "🐟"],
  [/reke|scampi|skalldyr/, "🦐"],
  [/sushi/, "🍣"],
  [/søtpotet/, "🍠"],
  [/(?<!søt)potet|\bmos\b|pommes/, "🥔"],
  [/smør/, "🧈"],
  [/burger/, "🍔"],
  [/pizza/, "🍕"],
  [/taco|tortilla|burrito|quesadilla/, "🌮"],
  [/kebab|pita/, "🥙"],
  [/falafel/, "🧆"],
  [/pølse/, "🌭"],
  [/kylling|høne/, "🍗"],
  [/bacon|ribbe|svin|skinke/, "🥓"],
  [/storfe|biff|okse|entrecote|\blam\b|lammekjøtt|kjøttkake|kjøttboller|karbonade/, "🥩"],
  [/penne|pasta|spaghetti|lasagne|bolognese|tagliatelle|fusilli/, "🍝"],
  [/nudler|\bwok\b|ramen/, "🍜"],
  [/curry|tikka|masala|dal\b/, "🍛"],
  [/suppe|gryte|lapskaus/, "🍲"],
  [/\bris\b|risotto/, "🍚"],
  [/\bost\b|ostesaus|parmesan|feta|mozzarella/, "🧀"],
  [/\begg\b|omelett/, "🥚"],
  [/gresskar/, "🎃"],
  [/ratato|aubergine/, "🍆"],
  [/tomat/, "🍅"],
  [/sopp/, "🍄"],
  [/brokkoli/, "🥦"],
  [/mais\b/, "🌽"],
  [/gulrot/, "🥕"],
  [/spinat|kål/, "🥬"],
  [/råkost|salat|grønnsak/, "🥗"],
  [/brød|toast|baguette/, "🥖"],
  [/pannekake/, "🥞"],
  [/vaffel/, "🧇"],
  [/vegetar|vegan/, "🌱"],
];

export function emojis(name, max = 4) {
  const text = name.toLowerCase();
  const hits = WORDS.map(([re, emoji]) => [text.search(re), emoji]).filter(([at]) => at >= 0);
  const list = [...new Set(hits.sort((a, b) => a[0] - b[0]).map(([, emoji]) => emoji))].slice(0, max);
  return list.length ? list : ["🍽️"];
}
