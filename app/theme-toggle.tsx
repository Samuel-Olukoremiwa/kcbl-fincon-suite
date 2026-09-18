"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const enabled = localStorage.getItem("kcbl-theme") === "dark";
    document.documentElement.classList.toggle("dark", enabled);
    setDark(enabled);
  }, []);
  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("kcbl-theme", next ? "dark" : "light");
    setDark(next);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      aria-label={dark ? "Use light mode" : "Use dark mode"}
      title={dark ? "Use light mode" : "Use dark mode"}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
