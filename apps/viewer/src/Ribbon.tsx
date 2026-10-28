import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface RibbonMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

/** A group of entries in a drop-down, with an optional small heading. */
export interface RibbonMenuSection {
  label?: string;
  items: RibbonMenuItem[];
}

export interface RibbonItem {
  id: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  /** Kept for grouping hints in the tab definitions; every button renders the same compact way. */
  size?: "large" | "medium" | "small";
  disabled?: boolean;
  active?: boolean;
  badge?: number | string;
  /** Tooltip. Defaults to the label. */
  title?: string;
  /** When set, the button opens this menu instead of running onClick. */
  menu?: RibbonMenuSection[];
}

export interface RibbonGroup {
  label: string;
  items: RibbonItem[];
}

export interface RibbonTab {
  id: string;
  label: string;
  groups: RibbonGroup[];
}

function RibbonButton({ item }: { item: RibbonItem }) {
  const size = item.size ?? "large";
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".rb-menu") && !ref.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const click = () => {
    if (!item.menu) return item.onClick?.();
    const r = ref.current!.getBoundingClientRect();
    setAt({ x: r.left, y: r.bottom + 2 });
    setOpen((o) => !o);
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`rb rb-${size}${item.active || open ? " active" : ""}`}
        disabled={item.disabled}
        onClick={click}
        title={item.title ?? item.label}
        aria-label={item.label}
        aria-pressed={item.menu || item.active === undefined ? undefined : item.active}
        aria-haspopup={item.menu ? "menu" : undefined}
        aria-expanded={item.menu ? open : undefined}
      >
        <span className="rb-icon">{item.icon}</span>
        <span className="rb-label">
          {item.label}
          {item.menu && <ChevronDown size={11} className="rb-caret" aria-hidden />}
        </span>
        {item.badge !== undefined && item.badge !== 0 && <span className="rb-badge">{item.badge}</span>}
      </button>
      {open && item.menu && (
        <div className="rb-menu" style={{ left: at.x, top: at.y }} role="menu">
          {item.menu.map((section, i) => (
            <div className="rb-menu-section" key={i}>
              {section.label && <div className="rb-menu-label">{section.label}</div>}
              {section.items.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="menuitem"
                  className="rb-menu-item"
                  disabled={m.disabled}
                  onClick={() => {
                    setOpen(false);
                    m.onClick();
                  }}
                >
                  <span className="rb-menu-icon">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
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
            // One row of buttons per group; the group name is kept for screen readers and as a tooltip.
            <div className="rg" key={g.label} role="group" aria-label={g.label} title={g.label}>
              {g.items.map((it) => (
                <RibbonButton key={it.id} item={it} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
