import React from "react";

/** Local action paths translated from .scratch/ux-study/layout-prototype/app.js.
 * The network motif is the original three-node triangle in layout-prototype/connections.js.
 * Additional simple UI glyphs are authored here; no font or external asset is loaded.
 */
const paths = {
  text: <path d="M5 4h14M12 4v16M8 20h8M7 8V4M17 8V4" />,
  pin: <path d="M8 3h8l-1 7 3 4v2H6v-2l3-4-1-7Zm4 13v6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  back: <path d="m13 5-7 7 7 7M6 12h15" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  chevron: <path d="m7 10 5 5 5-5" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </>
  ),
  delete: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />,
  send: <path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15" />,
  check: <path d="m5 12 4 4L19 6" />,
  filters: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="2" />
      <circle cx="15" cy="17" r="2" />
    </>
  ),
  edit: <path d="m4 16 12-12 4 4L8 20H4v-4ZM13 7l4 4" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  device: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M10 18h4" />
    </>
  ),
  computer: (
    <>
      <rect x="3" y="3" width="18" height="13" rx="2" />
      <path d="M12 16v5M6 21h12" />
    </>
  ),
  qr: (
    <>
      <path d="M3 3h6v6H3ZM15 3h6v6h-6ZM3 15h6v6H3ZM15 15h3v3h3v3h-6ZM21 12h-3M12 3v9H3M12 15v6" />
    </>
  ),
  network: (
    <>
      <circle cx="4" cy="17" r="2.5" />
      <circle cx="20" cy="17" r="2.5" />
      <circle cx="12" cy="5" r="2.5" />
      <path d="m5.5 14.5 5-7m3 0 5 7M7 17h10" />
    </>
  ),
  relay: (
    <>
      <path d="M9 8H7a4 4 0 0 0 0 8h2m6-8h2a4 4 0 0 1 0 8h-2M8 12h2m4 0h2" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  openExternal: (
    <>
      <path d="M14 4h6v6m0-6-9 9" />
      <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </>
  ),
  moon: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5V3h6v1.5M9 10h6M9 14h6" />
    </>
  ),
  links: (
    <>
      <path d="m10 13 4-4M8.5 15.5l-1 1a4 4 0 0 1-5.5-5.8l4-4a4 4 0 0 1 5.7 0M15.5 8.5l1-1a4 4 0 0 1 5.5 5.8l-4 4a4 4 0 0 1-5.7 0" />
    </>
  ),
  requests: (
    <>
      <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
    </>
  ),
  settings: (
    <>
      <path d="M12 2.8 14 3l.8 2.2 1.7.9 2.2-.6 1.5 1.5-.6 2.2.9 1.7 2.2.8v2l-2.2.8-.9 1.7.6 2.2-1.5 1.5-2.2-.6-1.7.9-.8 2.2h-2l-.8-2.2-1.7-.9-2.2.6-1.5-1.5.6-2.2-.9-1.7-2.2-.8v-2l2.2-.8.9-1.7-.6-2.2 1.5-1.5 2.2.6 1.7-.9.8-2.2Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
} satisfies Record<string, React.ReactNode>;

export type IconName = keyof typeof paths;

/** Icons are decorative; the containing control or adjacent words own meaning. */
export function Icon({
  name,
  className = "",
  style,
}: {
  name: IconName;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={`icon ${className}`}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

export function IconButton({
  icon,
  label,
  hint = label,
  className = "",
  ...props
}: Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  icon: IconName;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`icon-button ${className}`}
      aria-label={label}
      title={hint}
      data-hint={hint}
    >
      <Icon name={icon} />
    </button>
  );
}
