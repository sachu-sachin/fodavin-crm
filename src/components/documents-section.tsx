"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ExternalLinkIcon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  Link2Icon,
  PresentationIcon,
  Trash2Icon,
} from "lucide-react";
import { deleteDocument } from "@/lib/actions/documents";
import { DOCUMENT_KIND_MAP, type DocumentRecord } from "@/lib/types";
import { describeSource, fileGlyph, formatSize } from "@/lib/documents";
import { formatDateShortIST } from "@/lib/format";
import { DocumentAddDialog } from "@/components/document-add-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const GLYPHS = {
  text: FileTextIcon,
  image: FileImageIcon,
  video: FileVideoIcon,
  sheet: FileSpreadsheetIcon,
  slides: PresentationIcon,
  link: Link2Icon,
  generic: FileIcon,
} as const;

export function DocumentsSection({
  documents,
  companyId,
  projectId,
  uploaderNames,
  driveConnected,
  supabaseMaxBytes,
}: {
  documents: DocumentRecord[];
  companyId?: string;
  projectId?: string;
  /** profile id -> display name, for the "added by" line. */
  uploaderNames: Record<string, string>;
  driveConnected: boolean;
  supabaseMaxBytes: number;
}) {
  const [pendingDelete, setPendingDelete] = useState<DocumentRecord | null>(
    null,
  );
  const [, startTransition] = useTransition();

  // Filter chips only earn their space once the list is long enough to scan.
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const kinds = [...new Set(documents.map((d) => d.kind))];
  const showFilters = documents.length >= 5 && kinds.length > 1;
  const visible = kindFilter
    ? documents.filter((d) => d.kind === kindFilter)
    : documents;

  function onConfirmDelete(doc: DocumentRecord) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const fd = new FormData();
        fd.set("id", doc.id);
        await deleteDocument(fd);
        toast.success(
          describeSource(doc.source).ownedByApp
            ? `${doc.name} deleted`
            : `Link to ${doc.name} removed`,
        );
        resolve();
      });
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Documents
          {documents.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {documents.length}
            </span>
          )}
        </CardTitle>
        <DocumentAddDialog
          companyId={companyId}
          projectId={projectId}
          driveConnected={driveConnected}
          supabaseMaxBytes={supabaseMaxBytes}
          trigger={
            <Button size="sm" variant="outline">
              Add document
            </Button>
          }
        />
      </CardHeader>

      <CardContent>
        {documents.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center">
            <FileIcon className="mx-auto size-6 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium">No documents yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              Attach proposals, contracts and designs — upload them here or
              link what&apos;s already in Google Drive.
            </p>
          </div>
        ) : (
          <>
            {showFilters && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                <FilterChip
                  active={kindFilter === null}
                  onClick={() => setKindFilter(null)}
                >
                  All {documents.length}
                </FilterChip>
                {kinds.map((kind) => (
                  <FilterChip
                    key={kind}
                    active={kindFilter === kind}
                    onClick={() => setKindFilter(kind)}
                  >
                    {DOCUMENT_KIND_MAP[kind]}
                  </FilterChip>
                ))}
              </div>
            )}

            <ul className="divide-y rounded-lg border">
              {visible.map((doc) => {
                const source = describeSource(doc.source);
                const Glyph =
                  GLYPHS[
                    fileGlyph(doc.mime_type, doc.name, doc.source, doc.url)
                  ];
                const size = formatSize(doc.size_bytes);
                const who = doc.uploaded_by
                  ? uploaderNames[doc.uploaded_by]
                  : null;
                const external = doc.source !== "upload";

                return (
                  <li
                    key={doc.id}
                    className="group flex items-center gap-3 p-3 transition-colors hover:bg-muted/40"
                  >
                    <Glyph className="size-5 shrink-0 text-muted-foreground" />

                    <div className="min-w-0 flex-1">
                      <a
                        href={`/api/documents/${doc.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 font-medium hover:text-primary hover:underline"
                      >
                        <span className="truncate">{doc.name}</span>
                        {external && (
                          <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground" />
                        )}
                      </a>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[
                          DOCUMENT_KIND_MAP[doc.kind],
                          size,
                          who && `by ${who}`,
                          formatDateShortIST(doc.created_at),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${source.chipClass}`}
                      title={
                        source.ownedByApp
                          ? "Deleting removes the actual file"
                          : "Deleting removes the link only"
                      }
                    >
                      {source.label}
                    </span>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${doc.name}`}
                      className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
                      onClick={() => setPendingDelete(doc)}
                    >
                      <Trash2Icon />
                    </Button>
                  </li>
                );
              })}
            </ul>

            {visible.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing of that type.
              </p>
            )}
          </>
        )}
      </CardContent>

      {pendingDelete && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={
            describeSource(pendingDelete.source).ownedByApp
              ? "Delete this file?"
              : "Remove this link?"
          }
          body={`${pendingDelete.name} — ${describeSource(pendingDelete.source).deleteConsequence}`}
          confirmLabel={describeSource(pendingDelete.source).confirmLabel}
          onConfirm={() => onConfirmDelete(pendingDelete)}
        />
      )}
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
