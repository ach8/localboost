import './globals.css';

export const metadata = {
  title: 'LocalBoost',
  description: 'AI-powered platform for local businesses',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
