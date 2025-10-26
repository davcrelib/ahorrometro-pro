import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ahorrómetro",
  description: "Ahorra con propósito",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh bg-[#0b1020] text-[#e8ecff]">{children}</body>
    </html>
  );
}
