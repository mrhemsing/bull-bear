import type { GenerationPreview, PromptBundle } from './types';

const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1';

export async function generateMarketBeastPreview(prompts: PromptBundle): Promise<GenerationPreview> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      provider: 'openai',
      status: 'not-configured',
      model: OPENAI_IMAGE_MODEL,
      note: 'OPENAI_API_KEY is not set yet. Returning generation preview only.'
    };
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt: prompts.finalPrompt,
      size: '1536x1024'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI image generation failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
  };

  const image = data.data?.[0];

  return {
    provider: 'openai',
    status: 'configured',
    model: OPENAI_IMAGE_MODEL,
    imageUrl: image?.url,
    note: image?.url
      ? 'Image URL returned from OpenAI image generation.'
      : 'Provider call succeeded, but no image URL was returned. Base64 handling may be needed next.'
  };
}
