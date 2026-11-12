import { useState } from "react";
import { NobleDemo } from "./demos/noble/NobleDemo";
import { EmergenceDemo } from "./demos/emergence/EmergenceDemo";
import { type ThemeChoice, useTheme } from "./theme";

type Tab = "emergence" | "noble";

const TABS: { id: Tab; label: string }[] = [
  { id: "emergence", label: "1 · Causal emergence" },
  { id: "noble", label: "2 · Voltage clamp" },
];

export function App() {
  const { theme, choice, setChoice } = useTheme();
  const [tab, setTab] = useState<Tab>(() => (location.hash === "#noble" ? "noble" : "emergence"));

  return (
    <div className="app">
      <header className="app-header">
        <h1>Causal levels</h1>
        <nav className="tabs" role="tablist" aria-label="Demos">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? "tab active" : "tab"}
              onClick={() => {
                setTab(t.id);
                history.replaceState(null, "", `#${t.id}`);
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <label className="theme-picker">
          Theme
          <select value={choice} onChange={(e) => setChoice(e.target.value as ThemeChoice)}>
            <option value="auto">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>
      <main>
        {tab === "emergence" && <EmergenceDemo theme={theme} />}
        {tab === "noble" && <NobleDemo theme={theme} />}
      </main>
    </div>
  );
}
