import {
  CalendarRange,
  CheckCheck,
  Clock,
  Contact,
  FileSpreadsheet,
  FolderKanban,
  House,
  Palmtree,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { NavId } from "@/config/navigation";

export const NAV_ICONS: Record<NavId, LucideIcon> = {
  home: House,
  week: CalendarRange,
  hours: Clock,
  leave: Palmtree,
  team: Users,
  approvals: CheckCheck,
  directory: Contact,
  projects: FolderKanban,
  reports: FileSpreadsheet,
  settings: Settings,
};
