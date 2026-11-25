import { Page, PageHeader } from "@/ui/Page";
import LeaveReviewSection from "./LeaveReviewSection";

/** Aprobaciones del modo por asistencia: no hay horas para aprobar, solo licencias. */
export default function LeavesOnlyApprovals() {
  return (
    <Page>
      <PageHeader eyebrow="Revisión" title="Aprobaciones" subtitle="Licencias pendientes de tu equipo. También podés registrar una licencia o una ausencia por una persona." />
      <LeaveReviewSection />
    </Page>
  );
}
