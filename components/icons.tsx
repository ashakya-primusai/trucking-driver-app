/**
 * Monochrome line icons (24px grid, 1.8 stroke) — they take the text colour of their parent,
 * so they match the tab bar instead of using colour emoji.
 */
type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className ?? "h-5 w-5"}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const DocumentIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
  </Svg>
);

export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />
  </Svg>
);

export const ClipboardIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1z" />
    <path d="M16 5h2a1 1 0 011 1v14a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1h2M9 11h6M9 15h4" />
  </Svg>
);

export const MapIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
    <path d="M9 4v14M15 6v14" />
  </Svg>
);

export const RoadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3L4 21M16 3l4 18M12 4v2M12 10v3M12 17v3" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const FuelIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 21V5a2 2 0 012-2h6a2 2 0 012 2v16M3 21h12M4 10h10" />
    <path d="M14 8h2a2 2 0 012 2v6a1.5 1.5 0 003 0V9l-3-3" />
  </Svg>
);

export const NoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5a2 2 0 012-2h12a2 2 0 012 2v10l-6 6H6a2 2 0 01-2-2V5z" />
    <path d="M14 21v-5a1 1 0 011-1h5M8 8h8M8 12h5" />
  </Svg>
);

export const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8a2 2 0 012-2h1.5l1.5-2h6l1.5 2H18a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);

export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13M9 7V4h6v3" />
  </Svg>
);

export const TruckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
    <circle cx="7.5" cy="17.5" r="1.5" />
    <circle cx="17.5" cy="17.5" r="1.5" />
  </Svg>
);

export const BoxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
  </Svg>
);

export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </Svg>
);
