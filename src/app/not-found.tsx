import Link from 'next/link';

// Fallback for paths outside any locale (middleware normally prevents this).
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <p>Page not found. <Link href="/">Go home</Link></p>
      </body>
    </html>
  );
}
