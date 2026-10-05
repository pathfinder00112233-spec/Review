import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Paws Masterpiece — Royal Oil Portraits of Your Pet',
  description: 'Turn your dog or cat into an 18th-century classical oil masterpiece in seconds.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#0e0c0a] text-[#f4eee6] antialiased min-h-screen flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
