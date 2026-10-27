import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface RibbonItem {
  id: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  /** large: icon above label; medium: compact icon above label; small: icon beside label */
  size?: "large" | "medium" | "small";
  disabled?: boolean;
  active?: boolean;
  badge?: number | string;
  /** Tooltip. Defaults to the label. */
  title?: string;
}

export interface RibbonGroup {
  label: string;
  items: RibbonItem[];
  /** For medium and small items: how many items stack in one column. */
  rows?: number;
}

export interface RibbonTab {
  id: string;
  label: string;
  groups: RibbonGroup[];
}

function RibbonButton({ item }: { item: RibbonItem }) {
  const size = item.size ?? "large";
  return (
    <button
      type="button"
      className={`rb rb-${size}${item.active ? " active" : ""}`}
      disabled={item.disabled}
      onClick={item.onClick}
      title={item.title ?? item.label}
      aria-label={item.label}
      aria-pressed={item.active === undefined ? undefined : item.active}
    >
      <span className="rb-icon">{item.icon}</span>
      <span className="rb-label">{item.label}</span>
      {item.badge !== undefined && item.badge !== 0 && <span className="rb-badge">{item.badge}</span>}
    </button>
  );
}

export function Ribbon(props: {
  tabs: RibbonTab[];
  active: string;
  onTab: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const tab = props.tabs.find((t) => t.id === props.active) ?? props.tabs[0]!;

  return (
    <div className={`ribbon${collapsed ? " collapsed" : ""}`}>
      <div className="ribbon-tabs" role="tablist">
        {props.tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === tab.id}
            className={`ribbon-tab${t.id === tab.id ? " active" : ""}`}
            onClick={() => {
              props.onTab(t.id);
              setCollapsed(false);
            }}
            onDoubleClick={() => setCollapsed((c) => !c)}
          >
            {t.label}
          </button>
        ))}
        <span className="grow" />
        <button
          className="ribbon-collapse"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "리본 펼치기" : "리본 접기 (탭을 더블클릭해도 됩니다)"}
          aria-label={collapsed ? "리본 펼치기" : "리본 접기"}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {!collapsed && (
        <div className="ribbon-body" role="tabpanel">
          {tab.groups.map((g) => (
            <div className="rg" key={g.label}>
              <div className="rg-items" style={{ ["--rows" as string]: g.rows ?? 3 }}>
                {g.items.map((it) => (
                  <RibbonButton key={it.id} item={it} />
                ))}
              </div>
              <div className="rg-label">{g.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
