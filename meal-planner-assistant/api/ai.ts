export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = process.env.SILICONFLOW_API_KEY;
  const baseUrl = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';
  const model = process.env.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-14B-Instruct';

  if (!apiKey) {
    res.status(500).json({ error: 'SILICONFLOW_API_KEY is not set on the server.' });
    return;
  }

  const { action, ...payload } = req.body || {};
  if (!action) {
    res.status(400).json({ error: 'Missing action' });
    return;
  }

  try {
    const result = await routeAction({ action, payload, apiKey, baseUrl, model });
    res.status(200).json(result);
  } catch (err: any) {
    console.error('AI proxy error:', err?.message || err);
    res.status(500).send(err?.message || 'AI proxy failed');
  }
}

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

async function callSiliconflow(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: Msg[],
  options?: { temperature?: number; max_tokens?: number }
) {
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.6,
      max_tokens: options?.max_tokens ?? 1024,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`SiliconFlow error ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content from model');
  return content as string;
}

function extractJSON(text: string): any {
  try {
    return JSON.parse(text);
  } catch {}
  // Try to extract the first {...} or [...] block
  const objMatch = text.match(/[\[{][\s\S]*[\]}]/);
  if (objMatch) {
    const candidate = objMatch[0];
    try { return JSON.parse(candidate); } catch {}
  }
  throw new Error('Failed to parse JSON from model output');
}

async function routeAction({ action, payload, apiKey, baseUrl, model }: any) {
  switch (action) {
    case 'bulkPreferenceScores': {
      const { meals, profile } = payload as { meals: any[][], profile: any };
      const mealList = meals
        .map((meal: any[], i: number) => `Meal ${i + 1}: [${meal.map(d => d.name).join(', ')}]`)
        .join('\n');
      const system = 'You are a precise, careful scorer. Output JSON only.';
      const user = `A user has these preferences (likes/dislikes, allergies, spice level, cuisine tastes): "${profile?.preferences ?? ''}".
Consider ONLY the dish names; infer typical ingredients/preparation.
Score each meal (0-100 integer) for how much the user would enjoy it. 0=terrible match, 100=perfect.
Be consistent, avoid mode collapse, distinguish similar meals.

${mealList}

Return ONLY JSON: { "scores": [N1, N2, ...] } with exactly ${meals.length} integers in order.`;
      const content = await callSiliconflow(baseUrl, apiKey, model, [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]);
      const parsed = extractJSON(content);
      const scores = Array.isArray(parsed?.scores) ? parsed.scores : [];
      return { scores };
    }
    case 'recommendationText': {
      const { meal, profile } = payload as { meal: { dishes: any[], macros: any }, profile: any };
      const dishList = meal.dishes.map(d => `- ${d.name} from ${d.restaurant}`).join('\n');
      const user = `User goal: ${profile?.dietGoal}.
Recommended meal:\n${dishList}\n\nMacros: ${Math.round(meal.macros.protein)}g protein, ${Math.round(meal.macros.carbs)}g carbs, ${Math.round(meal.macros.fat)}g fat.
Write 2 short sentences, friendly and motivational. Mention why the meal fits the goal AND that automating meal choice saves time/mental energy (FIRE mindset). Avoid repeating dish names, no emojis.`;
      const content = await callSiliconflow(baseUrl, apiKey, model, [
        { role: 'system', content: 'You are a concise assistant.' },
        { role: 'user', content: user },
      ]);
      return { text: content.trim() };
    }
    case 'groupRecommendationText': {
      const { meal, participants } = payload as { meal: { dishes: any[] }, participants: any[] };
      const dishList = meal.dishes.map(d => d.name).join(', ');
      const participantPrefs = (participants || [])
        .map((p: any) => `- ${p?.user?.name ?? 'Unknown'} (weight: ${p?.weight ?? 1}): ${p?.user?.preferences ?? ''}`)
        .join('\n');
      const user = `Group planning with preferences:\n${participantPrefs}\n\nRecommended: ${dishList}.
Provide 2 short sentences explaining why this balances preferences (e.g., avoids X for A, offers spicy for B). Friendly, no emojis.`;
      const content = await callSiliconflow(baseUrl, apiKey, model, [
        { role: 'system', content: 'You explain compromises clearly, briefly.' },
        { role: 'user', content: user },
      ]);
      return { text: content.trim() };
    }
    case 'estimateMacros': {
      const { dishName, restaurantName } = payload as { dishName: string, restaurantName: string };
      const user = `Provide a realistic nutrition estimate for a standard single serving (grams, integers or one decimal).
Dish: "${dishName}"
Restaurant: "${restaurantName}"
Output ONLY JSON: { "protein": number, "carbs": number, "fat": number }`;
      const content = await callSiliconflow(baseUrl, apiKey, model, [
        { role: 'system', content: 'You output strict JSON only.' },
        { role: 'user', content: user },
      ]);
      const parsed = extractJSON(content);
      const macros = {
        protein: Math.max(0, Number(parsed?.protein ?? 0)),
        carbs: Math.max(0, Number(parsed?.carbs ?? 0)),
        fat: Math.max(0, Number(parsed?.fat ?? 0)),
      };
      return { macros };
    }
    case 'parseDishes': {
      const { text } = payload as { text: string };
      const user = `Parse the list of meals. Each line is one dish.
Extract: name, restaurant, price (CNY), estimate macros (protein, carbs, fat grams).
Category must be one of: '主食', '肉蛋', '蔬菜', '汤羹', '其他'.
If restaurant missing, infer or use "Local Eatery". Prices should be realistic for students in China.

Text:\n---\n${text}\n---

Return ONLY a JSON array of objects with keys: name, restaurant, price, protein, carbs, fat, category.`;
      const content = await callSiliconflow(baseUrl, apiKey, model, [
        { role: 'system', content: 'Output a strict JSON array only.' },
        { role: 'user', content: user },
      ]);
      const arr = extractJSON(content);
      if (!Array.isArray(arr)) throw new Error('Expected an array');
      // light normalization
      const items = arr.map((it: any) => ({
        name: String(it?.name ?? '').trim(),
        restaurant: String(it?.restaurant ?? 'Local Eatery').trim(),
        price: Number(it?.price ?? 0),
        protein: Number(it?.protein ?? 0),
        carbs: Number(it?.carbs ?? 0),
        fat: Number(it?.fat ?? 0),
        category: String(it?.category ?? '其他').trim(),
      }));
      return items;
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
