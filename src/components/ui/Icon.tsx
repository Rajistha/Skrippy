import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Ban,
  BadgeCheck,
  Bell,
  BookOpen,
  CalendarDays,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock,
  Cloud,
  Database,
  Server,
  CloudUpload,
  Copy,
  CornerDownRight,
  Download,
  Eye,
  EyeOff,
  FileCheck,
  FileText,
  Flag,
  Gauge,
  Gem,
  History,
  Hourglass,
  House,
  Info,
  KeyRound,
  Layers,
  LayoutDashboard,
  ListChecks,
  ListTree,
  LoaderCircle,
  Lock,
  LogOut,
  Mail,
  Menu,
  Minus,
  OctagonAlert,
  PartyPopper,
  Pencil,
  Play,
  Plus,
  Quote,
  RefreshCw,
  Rocket,
  Ruler,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  SpellCheck,
  Star,
  Timer,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  UserPlus,
  Users,
  Wallet,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/cn";

type IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number }
>;

/** Logo WhatsApp (glyph resmi, terisi). Lucide tidak punya ikon merek, jadi digambar sendiri. */
const WhatsAppLogo: IconComponent = ({ size = "1em", ...rest }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...rest}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

/**
 * Ikon SVG (lucide). Bentuk menjadi penanda utama, bukan warna:
 * kritis = segi delapan, sedang = segitiga, ringan = lingkaran info, berhasil = lingkaran centang.
 */
const ICONS = {
  // navigasi
  dashboard: LayoutDashboard,
  thesis: FileText,
  upload: Upload,
  history: History,
  package: Gem,
  trial: Timer,
  code: KeyRound,
  admin: ShieldCheck,
  settings: Settings,
  signOut: LogOut,
  home: House,
  menu: Menu,
  // tindakan
  share: Share2,
  copy: Copy,
  external: ArrowUpRight,
  arrow: ArrowRight,
  back: ArrowLeft,
  sub: CornerDownRight,
  plus: Plus,
  minus: Minus,
  close: X,
  done: Check,
  trash: Trash2,
  download: Download,
  refresh: RefreshCw,
  play: Play,
  pencil: Pencil,
  search: Search,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  // kategori pemeriksaan
  format: Ruler,
  structure: ListTree,
  spelling: SpellCheck,
  citation: Quote,
  // status dan keparahan
  critical: OctagonAlert,
  major: TriangleAlert,
  minor: Info,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
  neutral: Minus,
  spinner: LoaderCircle,
  // konten
  star: Star,
  user: User,
  users: Users,
  userPlus: UserPlus,
  lock: Lock,
  shield: ShieldCheck,
  zap: Zap,
  chart: ChartColumn,
  server: Server,
  database: Database,
  cloud: Cloud,
  gauge: Gauge,
  mail: Mail,
  eye: Eye,
  eyeOff: EyeOff,
  bell: Bell,
  whatsapp: WhatsAppLogo,
  clock: Clock,
  calendar: CalendarDays,
  cloudUpload: CloudUpload,
  fileCheck: FileCheck,
  book: BookOpen,
  ban: Ban,
  wallet: Wallet,
  rocket: Rocket,
  layers: Layers,
  badge: BadgeCheck,
  listChecks: ListChecks,
  help: CircleHelp,
  party: PartyPopper,
  hourglass: Hourglass,
  flag: Flag,
  sparkles: Sparkles,
  sortDesc: ArrowDownWideNarrow,
  sortAsc: ArrowUpNarrowWide,
  ai: Sparkles,
  online: Wifi,
  offline: WifiOff,
} satisfies Record<string, IconComponent>;

export type IconName = keyof typeof ICONS;

type Props = {
  name: IconName;
  /** Bila diisi, ikon dianggap bermakna dan dibacakan. Tanpa label, ikon dekoratif (aria-hidden). */
  label?: string;
  className?: string;
  spin?: boolean;
  /** Ukuran CSS; default mengikuti teks (1em). */
  size?: number | string;
  strokeWidth?: number;
};

export function Icon({ name, label, className, spin, size = "1em", strokeWidth = 2 }: Props) {
  const Cmp = ICONS[name];
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      className={cn("inline-block shrink-0 align-[-0.125em]", spin && "animate-spin", className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
    />
  );
}
