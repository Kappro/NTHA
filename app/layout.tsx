export const metadata = { title: "MapChat", description: "A location intelligence chatbot that can find locations or recommend places and mark them on the map." };
import "./globals.css";
import React from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
