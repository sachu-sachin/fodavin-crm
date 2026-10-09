"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { signOut } from "@/lib/actions/auth";
import { setEmailDigest } from "@/lib/actions/account";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
  name: string;
  email: string;
  avatarUrl?: string | null;
  /** Whether they get the daily reminder email. */
  emailDigest: boolean;
}

export function UserMenu({ name, email, avatarUrl, emailDigest }: UserMenuProps) {
  const [digestOn, setDigestOn] = useState(emailDigest);
  const [, startTransition] = useTransition();

  function toggleDigest() {
    const next = !digestOn;
    setDigestOn(next);
    startTransition(async () => {
      await setEmailDigest(next);
      toast.success(next ? "Daily reminder email on" : "Daily reminder email off");
    });
  }

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="outline-none">
        <Avatar className="h-8 w-8">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
          <AvatarFallback>{initials || "U"}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Base UI's GroupLabel (what DropdownMenuLabel wraps) requires a
            Group ancestor to supply its context — unlike Radix, it has no
            standalone label primitive. This group holds only the label;
            "Sign out" below is intentionally outside it. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col">
            <span>{name}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          closeOnClick={false}
          onClick={toggleDigest}
          aria-label={`Daily reminder email: ${digestOn ? "on" : "off"}`}
        >
          <span className="flex w-full items-center justify-between gap-2">
            Daily reminder email
            <span className="text-xs text-muted-foreground">{digestOn ? "On" : "Off"}</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <button type="submit" className="w-full">
            <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive">
              Sign out
            </DropdownMenuItem>
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
