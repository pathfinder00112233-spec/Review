'use client';

import React, { useState, useRef } from 'react';
import { Upload, Sparkles, RefreshCw, ShieldCheck, Download, Award, Lock } from 'lucide-react';

const STYLES = [
  {
    id: 'general',
    name: 'The Royal General',
    subtitle: 'Red velvet tunic & gold bullion epaulets',
    tag: 'Most Popular',
    color: 'from-amber-900/40 to-stone-900',
  },
  {
    id: 'baroque',
    name: 'The Baroque Noble',
    subtitle: 'Dutch lace ruff & dark Rembrandt lighting',
    tag: 'Classic',
    color: 'from-stone-900 to-amber-950/30',
  },
  {
    id: 'classic',
    name: 'The Oil Impression',
    subtitle: 'Soft palette strokes & warm gold tones',
    tag: 'Fine Art',
    color: 'from-yellow-950/30 to-stone-900',
  },
];

export default function PetPortraitApp() {
  const [selectedStyle, setSelectedStyle] = useState('general');
  const [petType, setPetType] = useState<'dog' | 'cat'>('dog');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        setError('Image must be under 8MB');
        return;
      }
      setError(null);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!imagePreview) {
      setError('Please choose or drop a photo of your pet first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imagePreview,
          styleId: selectedStyle,
          petType,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate');
      setResultUrl(data.resultUrl);
    } catch (err: any) {
      setError(err.message || 'Something went wrong while painting your portrait.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between">
      {/* Top Navbar */}
      <header className="border-b border-[#2a241f] py-4 px-6 sm:px-12 flex justify-between items-center bg-[#13100d]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <span className="font-['Playfair_Display'] text-2xl font-bold tracking-tight text-[#f4eee6]">
            Atelier<span className="italic text-[#c89d66]">Paws</span>
          </span>
          <span className="text-[10px] tracking-widest text-[#a89582] uppercase border border-[#3b322a] px-2 py-0.5 rounded-full ml-2">
            18th-C Studio
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#a89582]">
          <ShieldCheck className="w-4 h-4 text-[#c89d66]" />
          <span>Likeness Preserved</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 py-10 w-full flex-1">
        {/* Hero Copy */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="text-xs uppercase tracking-[0.25em] text-[#c89d66] font-semibold mb-2">
            Museum-Grade Pet Commission
          </p>
          <h1 className="font-['Playfair_Display'] text-4xl sm:text-5xl font-bold leading-tight mb-4">
            Their Character, <em className="text-[#c89d66] font-normal">Immortalized.</em>
          </h1>
          <p className="text-[#a89582] text-sm sm:text-base leading-relaxed">
            Upload your companion&apos;s photo. Our historical fine-art engine paints them as an 18th-century aristocrat in seconds.
          </p>
        </div>

        {/* Pet Switcher */}
        <div className="flex justify-center mb-8">
          <div className="bg-[#1c1713] p-1 rounded-full border border-[#382e25] inline-flex gap-1">
            <button
              onClick={() => setPetType('dog')}
              className={`px-6 py-2 rounded-full text-xs font-semibold transition-all ${
                petType === 'dog' ? 'bg-[#c89d66] text-black shadow-md' : 'text-[#a89582] hover:text-[#f4eee6]'
              }`}
            >
              Dog Portrait
            </button>
            <button
              onClick={() => setPetType('cat')}
              className={`px-6 py-2 rounded-full text-xs font-semibold transition-all ${
                petType === 'cat' ? 'bg-[#c89d66] text-black shadow-md' : 'text-[#a89582] hover:text-[#f4eee6]'
              }`}
            >
              Cat Portrait
            </button>
          </div>
        </div>

        {/* Step 1: Upload Card */}
        <div className="bg-[#16120e] border border-[#2e261f] rounded-2xl p-6 sm:p-8 mb-8 shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs tracking-widest uppercase text-[#c89d66] font-bold">Step 1: The Muse</span>
            {imagePreview && (
              <button
                onClick={() => {
                  setImagePreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="text-xs text-[#a89582] hover:text-[#f4eee6] underline"
              >
                Change photo
              </button>
            )}
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />

          {!imagePreview ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#3d3329] hover:border-[#c89d66]/60 transition-colors rounded-xl p-8 sm:p-12 text-center cursor-pointer bg-[#100d0a]/50 group"
            >
              <div className="w-14 h-14 bg-[#231d17] border border-[#3f342a] rounded-full mx-auto flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <Upload className="w-6 h-6 text-[#c89d66]" />
              </div>
              <p className="text-base font-semibold text-[#f4eee6] mb-1">
                Drop your {petType}&apos;s photo here, or <span className="text-[#c89d66] underline">browse</span>
              </p>
              <p className="text-xs text-[#8c7a68]">
                Clear facial view, good daylight, and sharp snout details yield the highest likeness.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-5 bg-[#0f0c09] p-4 rounded-xl border border-[#2a221b]">
              <img
                src={imagePreview}
                alt="Selected Pet"
                className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg border border-[#3d3329]"
              />
              <div>
                <p className="text-sm font-semibold text-[#f4eee6] mb-1">Photo ready for commission</p>
                <p className="text-xs text-[#a89582] mb-2">Facial landmarks &amp; coat tone captured.</p>
                <span className="inline-flex items-center text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded">
                  ✓ High Resolution
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Style Selection */}
        <div className="mb-10">
          <span className="text-xs tracking-widest uppercase text-[#c89d66] font-bold block mb-4">
            Step 2: Choose Historical Regalia
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {STYLES.map((style) => (
              <div
                key={style.id}
                onClick={() => setSelectedStyle(style.id)}
                className={`cursor-pointer rounded-xl p-5 border text-left transition-all relative overflow-hidden bg-gradient-to-b ${
                  style.color
                } ${
                  selectedStyle === style.id
                    ? 'border-[#c89d66] ring-1 ring-[#c89d66] shadow-[0_0_20px_rgba(200,157,102,0.15)]'
                    : 'border-[#2d251d] hover:border-[#42372c]'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] tracking-wider uppercase font-semibold text-[#c89d66] bg-[#211a14] px-2 py-0.5 rounded border border-[#3b3024]">
                    {style.tag}
                  </span>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      selectedStyle === style.id ? 'border-[#c89d66] bg-[#c89d66]' : 'border-[#4e4033]'
                    }`}
                  >
                    {selectedStyle === style.id && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                  </div>
                </div>
                <h3 className="font-['Playfair_Display'] text-lg font-bold text-[#f4eee6] mt-2 mb-1">
                  {style.name}
                </h3>
                <p className="text-xs text-[#a89582] leading-relaxed">{style.subtitle}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Action Button */}
        {error && (
          <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-red-200 text-xs mb-4 text-center">
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading || !imagePreview}
          className="w-full py-4 bg-gradient-to-r from-[#d8ab74] via-[#c89d66] to-[#b88c55] text-black font-semibold text-base rounded-full shadow-lg hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin text-black" />
              <span>Blending Oils &amp; Applying Brushstrokes (~10s)...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 text-black" />
              <span>Commission Free Preview</span>
            </>
          )}
        </button>

        {/* Result Presentation Modal */}
        {resultUrl && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-[#14100c] border border-[#3d3226] max-w-lg w-full rounded-2xl p-6 sm:p-8 text-center relative shadow-2xl">
              <button
                onClick={() => setResultUrl(null)}
                className="absolute top-4 right-4 text-[#8a7969] hover:text-[#f4eee6] text-xl font-bold w-8 h-8 flex items-center justify-center"
              >
                ✕
              </button>

              <span className="text-[11px] uppercase tracking-widest text-[#c89d66] font-bold block mb-1">
                Your Commission Is Ready
              </span>
              <h2 className="font-['Playfair_Display'] text-2xl font-bold text-[#f4eee6] mb-4">
                The Masterpiece
              </h2>

              {/* Watermarked Preview Canvas */}
              <div className="relative mx-auto rounded-xl overflow-hidden border-4 border-[#332a21] shadow-inner mb-6 max-h-[380px] bg-black">
                <img src={resultUrl} alt="Oil Painting Portrait" className="w-full h-auto object-contain mx-auto" />
                
                {/* Diagonal Repeating Watermark Overlays */}
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-around select-none rotate-[-25deg] scale-125 opacity-25">
                  <p className="text-xl font-black tracking-widest text-white text-center">PREVIEW • ATELIER PAWS • PREVIEW</p>
                  <p className="text-xl font-black tracking-widest text-white text-center">WATERMARKED • PROOF COPY • PREVIEW</p>
                  <p className="text-xl font-black tracking-widest text-white text-center">PREVIEW • ATELIER PAWS • PREVIEW</p>
                </div>
              </div>

              {/* Purchase Card */}
              <div className="bg-[#1b1510] border border-[#3b2f23] rounded-xl p-4 mb-4 text-left flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-[#c89d66]" />
                    <span className="text-xs font-bold text-[#f4eee6]">Ultra-HD 4K Print File</span>
                  </div>
                  <p className="text-[11px] text-[#9a8876] mt-0.5">300 DPI • Watermark Removed • Archival Ready</p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-[#f4eee6]">$9.99</span>
                </div>
              </div>

              <button
                onClick={() => alert('Connect your Stripe Payment Link / Razorpay checkout here.')}
                className="w-full py-3.5 bg-[#c89d66] hover:bg-[#d8ab74] text-black font-semibold rounded-full flex items-center justify-center gap-2 transition-colors mb-2"
              >
                <Lock className="w-4 h-4" />
                <span>Unlock Clean High-Res Portrait</span>
              </button>

              <button
                onClick={() => setResultUrl(null)}
                className="text-xs text-[#8c7b6a] hover:text-[#c89d66] transition-colors"
              >
                Try a different style
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#221c16] py-6 text-center text-xs text-[#7c6c5c]">
        <p>© 2026 Atelier Paws Atelier. High-resolution digital commissions.</p>
      </footer>
    </div>
  );
}
