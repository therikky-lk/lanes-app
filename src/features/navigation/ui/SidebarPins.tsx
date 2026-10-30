// The listener's pinned playlists / albums / artists in the side menu, under a
// divider line. Drag to reorder, right-click (long-press) to unpin.
import { useEffect, useRef, useState } from "react";
import { Reorder } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { PlaylistFill, User1Fill } from "@mingcute/react";
import CoverImage from "@/features/covers/ui/CoverImage";
import { Tooltip } from "@/shared/ui";
import DropdownMenu from "@/shared/ui/DropdownMenu";
import { useTranslation } from "@/languages";
import { pinKey, usePinsStore, type SidebarPin } from "../store/pinsStore";

function samePlace(href: string, pathname: string, search: string): boolean {
  const [path, query = ""] = href.split("?");
  if (path !== pathname) return false;
  const want = new URLSearchParams(query);
  const have = new URLSearchParams(search);
  for (const [k, v] of want) if (have.get(k) !== v) return false;
  return true;
}

function PinCover({ pin, active }: { pin: SidebarPin; active: boolean }) {
  const round = pin.kind === "artist";
  return (
    <span
      className={`relative block h-[36px] w-[36px] overflow-hidden bg-border-alpha-14 ${
        round ? "rounded-full" : "rounded-[8px]"
      } transition-opacity duration-150 ${active ? "opacity-100" : "opacity-80 group-hover:opacity-100"}`}
    >
      {pin.imageUrl ? (
        <CoverImage src={pin.imageUrl} alt={pin.title} fill className="object-cover" draggable={false} unoptimized />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-text-tertiary">
          {round ? <User1Fill size={18} /> : <PlaylistFill size={18} />}
        </span>
      )}
      {/* the "open now" ring is drawn inside the cover: the narrow, scrolling
          sidebar clipped a ring drawn around it */}
      {active && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 z-[1] shadow-[inset_0_0_0_2px_var(--accent-primary,#ff4d5e)] ${
            round ? "rounded-full" : "rounded-[8px]"
          }`}
        />
      )}
    </span>
  );
}

export default function SidebarPins() {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v && v !== key ? v : fallback;
  };
  const pins = usePinsStore((s) => s.pins);
  const setOrder = usePinsStore((s) => s.setOrder);
  const unpin = usePinsStore((s) => s.unpin);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  // the order while dragging; written to storage when the drag ends
  const [order, setLocalOrder] = useState(pins);
  const orderRef = useRef(order);
  orderRef.current = order;
  useEffect(() => setLocalOrder(pins), [pins]);
  const dragged = useRef(false);
  const [menu, setMenu] = useState<{ pin: SidebarPin; x: number; y: number } | null>(null);

  if (pins.length === 0) return null;

  return (
    <>
      <div className="mx-auto h-px w-[28px] shrink-0 bg-border-primary" role="separator" />
      <Reorder.Group
        axis="y"
        values={order}
        onReorder={setLocalOrder}
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-[10px] overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden list-none m-0 px-0 pt-[4px] pb-[4px]"
      >
        {order.map((pin) => {
          const active = samePlace(pin.href, pathname, search);
          return (
            <Reorder.Item
              key={pinKey(pin.kind, pin.id)}
              value={pin}
              className="list-none"
              whileDrag={{ scale: 1.08, zIndex: 5 }}
              onDragStart={() => {
                dragged.current = true;
              }}
              onDragEnd={() => {
                setOrder(orderRef.current);
                // the click that ends a drag must not open the pin
                setTimeout(() => {
                  dragged.current = false;
                }, 0);
              }}
            >
              <Tooltip content={pin.title} side="right" sideOffset={12}>
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  aria-label={pin.title}
                  className="group block border-0 bg-transparent p-0 cursor-pointer active:scale-[0.96] transition-transform duration-100"
                  onClick={() => {
                    if (!dragged.current) navigate(pin.href);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ pin, x: e.clientX, y: e.clientY });
                  }}
                >
                  <PinCover pin={pin} active={active} />
                </button>
              </Tooltip>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
      {menu && (
        <DropdownMenu
          trigger={<span />}
          open
          position={{ x: menu.x, y: menu.y }}
          onOpenChange={(open) => !open && setMenu(null)}
          items={[
            {
              id: "unpin",
              label: tr("common.sidebar.unpin", "Unpin from menu"),
              onClick: () => {
                unpin(menu.pin.kind, menu.pin.id);
                setMenu(null);
              },
            },
          ]}
        />
      )}
    </>
  );
}
