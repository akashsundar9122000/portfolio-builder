/**
 * Professional looks a friend can be dressed in.
 *
 * Every option is workplace-appropriate by construction: the prompt is
 * fixed here, the person only picks an option and a colour, so nothing
 * they type ever reaches the image model as clothing instructions.
 */

export interface Outfit {
  id: string;
  label: string;
  /** Short hint shown under the label. */
  hint: string;
  /** Colours offered; the first is the default. */
  colors: readonly string[];
  /** Goes into the image prompt, with {color} substituted. */
  prompt: string;
}

export const OUTFITS: readonly Outfit[] = [
  { id: "suit-tie", label: "Suit & tie", hint: "Classic boardroom", colors: ["charcoal", "navy", "black"], prompt: "a well-tailored {color} two-piece business suit, crisp white dress shirt and a dark silk tie" },
  { id: "suit-open", label: "Suit, open collar", hint: "Sharp, relaxed", colors: ["navy", "charcoal", "beige"], prompt: "a tailored {color} suit jacket over a white shirt with an open collar, no tie" },
  { id: "blazer-tee", label: "Blazer + tee", hint: "Tech-founder", colors: ["black", "navy", "grey"], prompt: "a fitted {color} blazer over a plain crew-neck t-shirt" },
  { id: "oxford", label: "Oxford shirt", hint: "Smart casual", colors: ["light blue", "white", "pale pink"], prompt: "a neatly pressed {color} oxford button-down shirt" },
  { id: "turtleneck", label: "Turtleneck", hint: "Minimal, studio", colors: ["black", "charcoal", "camel"], prompt: "a fine-knit {color} turtleneck sweater" },
  { id: "nehru", label: "Nehru jacket + kurta", hint: "Indian formal", colors: ["navy", "maroon", "ivory"], prompt: "an elegant {color} Nehru jacket over a plain kurta" },
  { id: "pantsuit", label: "Tailored pantsuit", hint: "Executive", colors: ["black", "navy", "ivory"], prompt: "a tailored {color} pantsuit with a simple blouse" },
  { id: "blazer-blouse", label: "Blazer + blouse", hint: "Polished", colors: ["navy", "black", "beige"], prompt: "a structured {color} blazer over a silk blouse" },
  { id: "saree", label: "Formal saree", hint: "Graceful formal", colors: ["deep blue", "maroon", "cream"], prompt: "an elegant, formal {color} silk saree suitable for a professional event" },
  { id: "salwar", label: "Formal salwar suit", hint: "Refined traditional", colors: ["teal", "navy", "ivory"], prompt: "a refined, formal {color} salwar kameez with a matching dupatta" },
  { id: "sweater-shirt", label: "Sweater + collar", hint: "Academic", colors: ["navy", "grey", "olive"], prompt: "a {color} crew-neck sweater layered over a collared shirt" },
  { id: "keep", label: "Keep my outfit", hint: "No change", colors: [""], prompt: "" },
];

export function outfitById(id: string): Outfit {
  return OUTFITS.find((o) => o.id === id) ?? OUTFITS[OUTFITS.length - 1];
}

/**
 * The single, fixed instruction sent to the image model. The person's
 * face, hair, skin tone and build must be preserved exactly: this edits
 * clothes and light, never identity.
 */
export function outfitPrompt(outfit: Outfit, color: string): string {
  const clothes = outfit.prompt.replace("{color}", color || outfit.colors[0]);
  return [
    `Edit this photo so the person is wearing ${clothes}.`,
    "Keep the person's face, identity, facial features, hairstyle, facial hair, glasses, skin tone, expression and body shape exactly the same.",
    "Professional head-and-shoulders portrait, facing the camera, soft studio lighting, clean plain dark background.",
    "Photorealistic, natural fabric, no text, no logos, no accessories added.",
  ].join(" ");
}
