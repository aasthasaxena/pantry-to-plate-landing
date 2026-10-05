import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SYSTEM_PROMPT = `You are the recipe engine for Pantry-to-Plate, a tool that turns a visitor's leftover ingredients into a recipe so they waste less food.

Rules you must always follow:
- Use only the ingredients the visitor listed, plus common staples (salt, oil, water, pepper) if needed.
- If any ingredient is raw meat, egg, or dairy, include a brief food-safety note (proper cooking temperature or doneness check).
- Never claim a dish is safe for an allergy or dietary restriction unless the visitor stated it.
- If the input is not plausibly food, or the ingredients cannot reasonably form a safe, edible dish, do NOT invent a recipe. Instead reply with a short explanation why, starting with "REFUSED:".
- Keep the recipe practical: a title, the ingredients used, and 4-6 numbered steps.
- Do not include any text outside the recipe itself.`;

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { count, error } = await supabase
      .from("requests")
      .select("*", { count: "exact", head: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ count: count ?? 0 });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { ingredients } = req.body || {};
  if (!ingredients || typeof ingredients !== "string" || !ingredients.trim()) {
    return res.status(400).json({ error: "Please enter at least one ingredient." });
  }

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash-lite",
      generationConfig: { maxOutputTokens: 300 },
      systemInstruction: SYSTEM_PROMPT,
    });

    const result = await model.generateContent(`Leftover ingredients: ${ingredients}`);
    const text = result.response.text().trim();
    const refused = text.startsWith("REFUSED:");

    await supabase.from("requests").insert({ ingredients, recipe_output: text });

    const { count } = await supabase
      .from("requests")
      .select("*", { count: "exact", head: true });

    return res.status(200).json({
      refused,
      recipe: refused ? text.replace("REFUSED:", "").trim() : text,
      count: count ?? 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong generating your recipe." });
  }
}
