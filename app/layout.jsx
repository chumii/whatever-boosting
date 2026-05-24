import "./globals.css";

export const metadata = {
  title: "Whatever Guild",
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
