// Fallback for paths outside any locale (middleware normally prevents this).
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <p>Page not found. <a href="/">Go home</a></p>
      </body>
    </html>
  );
}
