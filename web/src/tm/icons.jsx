import { Box } from '@mui/material';
import { AI_GRADIENT, PRIORITY_STYLE } from './theme';

/**
 * Small inline icons, drawn on a 20px grid with currentColor strokes so they
 * follow the text colour they sit in. Source tiles are plain coloured marks,
 * not vendor logos.
 */

function Svg({ size = 18, children, sx, ...rest }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      sx={{ flex: 'none', display: 'block', ...sx }}
      {...rest}
    >
      {children}
    </Box>
  );
}

export const SparkleIcon = (p) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <path d="M10 1.8l1.7 4.6a2 2 0 0 0 1.2 1.2l4.6 1.7-4.6 1.7a2 2 0 0 0-1.2 1.2L10 16.8l-1.7-4.6a2 2 0 0 0-1.2-1.2L2.5 9.3l4.6-1.7a2 2 0 0 0 1.2-1.2z" />
    <path d="M16 13.2l.6 1.6.4.4 1.6.6-1.6.6-.4.4-.6 1.6-.6-1.6-.4-.4-1.6-.6 1.6-.6.4-.4z" opacity=".8" />
  </Svg>
);

/** The AI mark: a sparkle on the gradient disc. */
export function AiBadge({ size = 36 }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: AI_GRADIENT,
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        boxShadow: '0 0 0 4px rgba(167, 139, 250, .22), 0 6px 16px -6px rgba(124, 58, 237, .55)',
        flex: 'none',
      }}
    >
      <SparkleIcon size={size * 0.55} />
    </Box>
  );
}

export const SettingsIcon = (p) => (
  <Svg {...p}>
    <path d="M3 6h8M15 6h2M3 14h2M9 14h8" />
    <circle cx="13" cy="6" r="2" />
    <circle cx="7" cy="14" r="2" />
  </Svg>
);
export const PaperclipIcon = (p) => (
  <Svg {...p}>
    <path d="M15.5 9.5l-5.8 5.8a3.5 3.5 0 0 1-5-5l6.4-6.4a2.3 2.3 0 0 1 3.3 3.3l-6.2 6.2a1.2 1.2 0 0 1-1.7-1.7l5.6-5.6" />
  </Svg>
);
export const PlusIcon = (p) => (
  <Svg {...p}>
    <path d="M10 4v12M4 10h12" />
  </Svg>
);
export const CloseIcon = (p) => (
  <Svg {...p}>
    <path d="M5 5l10 10M15 5L5 15" />
  </Svg>
);
export const ChevronRight = (p) => (
  <Svg {...p}>
    <path d="M8 5l5 5-5 5" />
  </Svg>
);
export const ChevronDown = (p) => (
  <Svg {...p}>
    <path d="M5 8l5 5 5-5" />
  </Svg>
);
export const CheckIcon = (p) => (
  <Svg {...p}>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </Svg>
);
export const InfoIcon = (p) => (
  <Svg {...p} strokeWidth={1.4}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 9v4.5M10 6.6v.2" />
  </Svg>
);
export const SearchIcon = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="M13.2 13.2L17 17" />
  </Svg>
);
export const FolderIcon = ({ open, ...p }) => (
  <Svg {...p}>
    {open ? (
      <path d="M2.8 15.5V5a1 1 0 0 1 1-1h3.7l1.6 1.8h6.6a1 1 0 0 1 1 1V8M2.8 15.5l2.1-6.3a1 1 0 0 1 1-.7h11.3l-2.2 6.4a1 1 0 0 1-.9.6z" />
    ) : (
      <path d="M2.8 5a1 1 0 0 1 1-1h3.7l1.6 1.8h7.1a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H3.8a1 1 0 0 1-1-1z" />
    )}
  </Svg>
);
export const SendIcon = (p) => (
  <Svg {...p}>
    <path d="M3.5 10L16.5 4l-4.6 12.5-2.4-5.1z" />
    <path d="M9.5 11.4l7-7.4" />
  </Svg>
);
export const TrashIcon = (p) => (
  <Svg {...p}>
    <path d="M4 6h12M8 6V4.5h4V6M5.5 6l.8 10h7.4l.8-10" />
  </Svg>
);
export const MoreIcon = (p) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <circle cx="5" cy="10" r="1.5" />
    <circle cx="10" cy="10" r="1.5" />
    <circle cx="15" cy="10" r="1.5" />
  </Svg>
);
export const ExportIcon = (p) => (
  <Svg {...p}>
    <path d="M10 12.5V3M6.5 6.5L10 3l3.5 3.5M4 11v4.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V11" />
  </Svg>
);
export const DownloadIcon = (p) => (
  <Svg {...p}>
    <path d="M10 3v9.5M6.5 9L10 12.5 13.5 9M4 13v2.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V13" />
  </Svg>
);
export const PlugIcon = (p) => (
  <Svg {...p}>
    <path d="M7 3v4M13 3v4M5 7h10v3a5 5 0 0 1-10 0zM10 15v3" />
  </Svg>
);
export const BookIcon = (p) => (
  <Svg {...p}>
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v12H5.5A1.5 1.5 0 0 0 4 16.5zM4 16.5A1.5 1.5 0 0 0 5.5 18H16M7 7h6" />
  </Svg>
);
export const SortIcon = (p) => (
  <Svg {...p}>
    <path d="M6 4v12M3.5 13.5L6 16l2.5-2.5M14 16V4M11.5 6.5L14 4l2.5 2.5" />
  </Svg>
);
export const FilterIcon = (p) => (
  <Svg {...p}>
    <path d="M3.5 4.5h13l-5 6v5l-3-1.5v-3.5z" />
  </Svg>
);
export const ColumnsIcon = (p) => (
  <Svg {...p}>
    <path d="M3 5h14M3 10h14M3 15h14M7 3.5v3M13 8.5v3M9 13.5v3" />
  </Svg>
);
export const FolderPlusIcon = (p) => (
  <Svg {...p}>
    <path d="M2.8 5a1 1 0 0 1 1-1h3.7l1.6 1.8h7.1a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H3.8a1 1 0 0 1-1-1zM10 8.5v5M7.5 11h5" />
  </Svg>
);
export const ListIcon = (p) => (
  <Svg {...p}>
    <path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9" />
    <circle cx="4" cy="5.5" r=".6" fill="currentColor" />
    <circle cx="4" cy="10" r=".6" fill="currentColor" />
    <circle cx="4" cy="14.5" r=".6" fill="currentColor" />
  </Svg>
);
/** Requirement -> scenarios -> cases, as a branching diagram. */
export const TreeIcon = (p) => (
  <Svg {...p}>
    <rect x="2.5" y="8" width="4" height="4" rx="1" />
    <rect x="13.5" y="3" width="4" height="4" rx="1" />
    <rect x="13.5" y="13" width="4" height="4" rx="1" />
    <path d="M6.5 10h3.5M10 5v10M10 5h3.5M10 15h3.5" />
  </Svg>
);
export const ThumbUpIcon = (p) => (
  <Svg {...p}>
    <path d="M6.5 9v8h-3V9zM6.5 9l3.2-5.6a1.6 1.6 0 0 1 2.9 1.2L11.8 8h4.1a1.6 1.6 0 0 1 1.6 1.9l-1.1 5.6a2 2 0 0 1-2 1.5H6.5" />
  </Svg>
);
export const ThumbDownIcon = (p) => (
  <Svg {...p}>
    <path d="M6.5 11V3h-3v8zM6.5 11l3.2 5.6a1.6 1.6 0 0 0 2.9-1.2L11.8 12h4.1a1.6 1.6 0 0 0 1.6-1.9l-1.1-5.6a2 2 0 0 0-2-1.5H6.5" />
  </Svg>
);
export const WandIcon = (p) => (
  <Svg {...p}>
    <path d="M4 16L13.5 6.5M12 5l3 3M15 2.5v2M17.5 5h-2M8 3v1.6M3.8 7.2h1.6" />
  </Svg>
);

/** Priority as an arrow mark in its colour, the way trackers show it. */
export function PriorityIcon({ priority, size = 16 }) {
  const style = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.medium;
  const paths = {
    critical: <path d="M5 11l5-5 5 5M5 15.5l5-5 5 5" />,
    high: <path d="M5 13l5-5 5 5" />,
    medium: <path d="M5 8h10M5 12.5h10" />,
    low: <path d="M5 7.5l5 5 5-5" />,
  };
  return (
    <Svg size={size} strokeWidth={2.2} sx={{ color: style.color }}>
      {paths[priority] ?? paths.medium}
    </Svg>
  );
}

/** A square tile with a coloured mark, standing for an input source. */
export function SourceTile({ label, color, mark, size = 44 }) {
  return (
    <Box
      title={label}
      aria-label={label}
      sx={{
        width: size,
        height: size,
        borderRadius: '10px',
        bgcolor: '#fff',
        border: '1px solid var(--tm-rule)',
        boxShadow: 'var(--tm-shadow)',
        display: 'grid',
        placeItems: 'center',
        flex: 'none',
      }}
    >
      <Box
        sx={{
          width: size * 0.56,
          height: size * 0.56,
          borderRadius: '6px',
          bgcolor: color,
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          fontSize: size * 0.27,
          fontWeight: 700,
          letterSpacing: '-.02em',
        }}
      >
        {mark}
      </Box>
    </Box>
  );
}

export const SOURCE_TILES = [
  { key: 'jira', label: 'Jira', color: '#2684ff', mark: 'J' },
  { key: 'confluence', label: 'Confluence', color: '#1868db', mark: 'C' },
  { key: 'ado', label: 'Azure DevOps', color: '#0078d4', mark: 'A' },
  { key: 'figma', label: 'Figma', color: '#a259ff', mark: 'F' },
  { key: 'image', label: 'Images', color: '#0ea5e9', mark: '▣' },
  { key: 'pdf', label: 'PDF', color: '#e5484d', mark: 'PDF' },
  { key: 'word', label: 'Word', color: '#2b579a', mark: 'W' },
  { key: 'excel', label: 'Excel', color: '#217346', mark: 'X' },
  { key: 'powerpoint', label: 'PowerPoint', color: '#d24726', mark: 'P' },
];
