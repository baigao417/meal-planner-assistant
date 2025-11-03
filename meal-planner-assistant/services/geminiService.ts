import { UserProfile, Dish, Macros } from '../types';

// Frontend now calls our Vercel proxy at /api/ai. No API key in browser.
async function postAI<T>(action: string, payload: any): Promise<T> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI proxy error (${res.status}): ${text}`);
  }
  return res.json();
}

class GeminiService {
  async getPreferenceScore(dishes: Dish[], profile: UserProfile): Promise<number> {
    const scores = await this.getBulkPreferenceScores([dishes], profile);
    return scores[0] || 70;
  }

  async getBulkPreferenceScores(meals: Dish[][], profile: UserProfile): Promise<number[]> {
    if (meals.length === 0) return [];
    try {
      const { scores } = await postAI<{ scores: number[] }>('bulkPreferenceScores', { meals, profile });
      if (Array.isArray(scores) && scores.length === meals.length) {
        return scores.map(s => Math.max(0, Math.min(100, s)));
      }
      console.error('AI returned mismatched scores; using default 75s.');
      return meals.map(() => 75);
    } catch (error) {
      console.error('Error getting bulk preference scores:', error);
      return meals.map(() => 70);
    }
  }

  async generateRecommendationText(meal: { dishes: Dish[], macros: Macros }, profile: UserProfile): Promise<string> {
    try {
      const { text } = await postAI<{ text: string }>('recommendationText', { meal, profile });
      return text;
    } catch (error) {
      console.error('Error generating recommendation text:', error);
      return 'This meal is a great choice to help you meet your daily nutritional goals and stay on track!';
    }
  }

  async generateGroupRecommendationText(meal: { dishes: Dish[] }, participants: { user: UserProfile, weight: number }[]): Promise<string> {
    try {
      const { text } = await postAI<{ text: string }>('groupRecommendationText', { meal, participants });
      return text;
    } catch (error) {
      console.error('Error generating group recommendation text:', error);
      return 'This meal selection balances the preferences of the group, offering something for everyone.';
    }
  }

  async estimateDishMacros(dishName: string, restaurantName: string): Promise<Macros> {
    try {
      const { macros } = await postAI<{ macros: Macros }>('estimateMacros', { dishName, restaurantName });
      if (macros && macros.protein !== undefined && macros.carbs !== undefined && macros.fat !== undefined) {
        return macros;
      }
      throw new Error('Invalid macros from AI');
    } catch (error) {
      console.error('Error estimating dish macros:', error);
      throw new Error('AI estimation failed. Please enter macros manually.');
    }
  }

  async parseDishesFromText(text: string): Promise<Partial<Dish>[]> {
    try {
      const items = await postAI<Partial<Dish>[]>('parseDishes', { text });
      if (Array.isArray(items)) {
        return items;
      }
      throw new Error('AI returned non-array');
    } catch (error) {
      console.error('Error parsing dishes from text:', error);
      return [];
    }
  }
}

export const geminiService = new GeminiService();
