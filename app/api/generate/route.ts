import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const runtime = 'nodejs';

const STYLE_PROMPTS: Record<string, string> = {
  general:
    'An authentic 18th century British royal military oil portrait painting of the pet. The pet is wearing an ornate red velvet military general tunic with heavy gold bullion epaulettes, brass buttons, and royal sash. Highly detailed pet fur and likeness, dramatic chiaroscuro Rembrandt studio lighting, authentic oil paint craquelure and thick canvas impasto brushwork, masterpiece, museum painting.',
  baroque:
    'A moody 17th century Baroque Dutch master oil painting of the pet. The pet is dressed in high aristocratic Dutch court attire with an elaborate white lace ruff collar and dark embroidered doublet. Sfumato background, dramatic directional warm candle lighting, deep rich shadows, fine Renaissance portraiture, authentic museum quality.',
  classic:
    'A soft impressionist fine-art oil portrait of the pet, classical 19th century painterly style. Thick textured visible palette knife strokes, elegant muted gold and sepia background tones, luminous expressive eyes maintaining exact pet facial structure, timeless regal poise, framed archival museum gallery piece.',
};

export async function POST(req: Request) {
  try {
    const { imageBase64, styleId, petType } = await req.json();

    if (!imageBase64 || !styleId) {
      return NextResponse.json({ error: 'Missing image or style selection' }, { status: 400 });
    }

    const basePrompt = STYLE_PROMPTS[styleId] || STYLE_PROMPTS.general;
    const finalPrompt = `${basePrompt} Subject is a ${petType || 'pet'}, preserving facial markings and distinctive eye color.`;

    // 1. Upload base64 image to Fal's temporary storage
    const binaryData = Buffer.from(imageBase64.split(',')[1], 'base64');
    const blob = new Blob([binaryData], { type: 'image/jpeg' });
    const uploadedUrl = await fal.storage.upload(blob);

    // 2. Call Image-to-Image model (FLUX/SDXL via Fal.ai)
    const result: any = await fal.subscribe('fal-ai/lora/image-to-image', {
      input: {
        model_name: 'stabilityai/stable-diffusion-xl-base-1.0',
        prompt: finalPrompt,
        negative_prompt: 'blurry, cartoon, 3d render, anime, lowres, distorted anatomy, text, watermark, human hands',
        image_url: uploadedUrl,
        noise_strength: 0.62, // Keeps the pet's skull, snout & eyes intact while repainting the clothes & backdrop
        num_inference_steps: 30,
        guidance_scale: 7.5,
      },
    });

    const outputUrl = result?.data?.images?.[0]?.url || result?.images?.[0]?.url;

    if (!outputUrl) {
      throw new Error('No image was returned from the generator.');
    }

    return NextResponse.json({ resultUrl: outputUrl });
  } catch (error: any) {
    console.error('Generation Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to craft portrait' }, { status: 500 });
  }
}
