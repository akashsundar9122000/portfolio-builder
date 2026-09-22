import { Allura, Archivo, Instrument_Sans, JetBrains_Mono } from "next/font/google";

export const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-display-face", display: "swap" });
export const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans-face", display: "swap" });
export const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap", preload: false });
export const script = Allura({ subsets: ["latin"], weight: "400", variable: "--font-script-face", display: "swap", preload: false });

export const fontVariables = [display.variable, sans.variable, mono.variable, script.variable].join(" ");
