"use client";

import { useMemo, useState } from "react";
import { MEETING_TYPES, type MeetingListItem } from "@/lib/types";
import { splitMeetings } from "@/lib/meetings";
import { ListFilterBar } from "@/components/list-filter-bar";
import { MeetingList } from "@/components/meeting-list";

/**
 * Every meeting, fetched once and filtered in memory (see crm-client-list.tsx
 * for why lists here filter client-side).
 */
export function MeetingsClientList({
  meetings,
  companies,
  projects,
  today,
}: {
  meetings: MeetingListItem[];
  companies: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  /** "YYYY-MM-DD" in IST. */
  today: string;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [projectId, setProjectId] = useState("");

  const { upcoming, past } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = meetings.filter((m) => {
      if (needle && !m.title.toLowerCase().includes(needle)) return false;
      if (type && m.type !== type) return false;
      if (companyId && m.company_id !== companyId) return false;
      if (projectId && m.project_id !== projectId) return false;
      return true;
    });
    return splitMeetings(filtered, today);
  }, [meetings, q, type, companyId, projectId, today]);

  const hasFilters = !!(q || type || companyId || projectId);

  return (
    <>
      <ListFilterBar
        search={{ key: "q", placeholder: "Search meetings", value: q }}
        filters={[
          { key: "type", label: "Type", options: MEETING_TYPES },
          {
            key: "company",
            label: "Client",
            options: companies.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            key: "project",
            label: "Project",
            options: projects.map((p) => ({ value: p.id, label: p.name })),
          },
        ]}
        values={{ type, company: companyId, project: projectId }}
        onSearchChange={setQ}
        onFilterChange={(key, value) => {
          if (key === "type") setType(value);
          else if (key === "company") setCompanyId(value);
          else if (key === "project") setProjectId(value);
        }}
        onClear={() => {
          setQ("");
          setType("");
          setCompanyId("");
          setProjectId("");
        }}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Today & upcoming
        </h2>
        <MeetingList
          meetings={upcoming}
          empty={hasFilters ? "No upcoming meetings match these filters." : "Nothing scheduled."}
        />
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Earlier</h2>
        <MeetingList
          meetings={past}
          empty={hasFilters ? "No earlier meetings match these filters." : "No past meetings yet."}
        />
      </section>
    </>
  );
}
