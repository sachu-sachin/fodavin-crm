"use client";

import { deleteContact } from "@/lib/actions/crm";
import type { Contact } from "@/lib/types";
import { ContactFormDialog } from "@/components/contact-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ContactsSection({
  companyId,
  contacts,
}: {
  companyId: string;
  contacts: Contact[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Contacts ({contacts.length})</CardTitle>
        <ContactFormDialog
          companyId={companyId}
          trigger={
            <Button size="sm" variant="outline">
              Add contact
            </Button>
          }
        />
      </CardHeader>
      <CardContent className="space-y-2">
        {contacts.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No contacts yet.
          </p>
        ) : (
          contacts.map((contact) => (
            <div
              key={contact.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {contact.full_name}
                  {contact.role_title && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {contact.role_title}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[contact.email, contact.phone].filter(Boolean).join(" · ") ||
                    "—"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <ContactFormDialog
                  companyId={companyId}
                  contact={contact}
                  trigger={
                    <Button size="sm" variant="ghost">
                      Edit
                    </Button>
                  }
                />
                <form action={deleteContact}>
                  <input type="hidden" name="id" value={contact.id} />
                  <input type="hidden" name="company_id" value={companyId} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    type="submit"
                  >
                    Delete
                  </Button>
                </form>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
