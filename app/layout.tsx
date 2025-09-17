export const metadata = { title: "Nika THA", description: "A location intelligence chatbot that displays different locations on map as recommendation for Nika employees." };
import "./globals.css";
import React from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
