"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import {
  addHoliday,
  cancelLeave,
  checkIn,
  checkOut,
  decideLeave,
  deleteHoliday,
  requestLeave,
  saveAttendance,
  saveWorkSettings,
  type AttendanceState,
} from "@/lib/actions/attendance";
import {
  ATTENDANCE_STATUSES,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
  STATUS_META,
} from "@/lib/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-sm";

/**
 * Run a server action from a form and toast its result from the submit
 * handler itself, so the message shows even when the save makes this form
 * disappear (a cancelled leave leaves the list).
 */
function useToastAction(
  fn: (prev: AttendanceState, formData: FormData) => Promise<AttendanceState>,
  onSuccess?: () => void,
) {
  const [pending, start] = useTransition();
  const action = (formData: FormData) =>
    start(async () => {
      const r = await fn({}, formData);
      if (r.error) toast.error(r.error);
      else if (r.success) {
        toast.success(r.success);
        onSuccess?.();
      }
    });
  return [action, pending] as const;
}

// -- Check in / out ----------------------------------------------------------

export function CheckInCard({
  checkInLabel,
  checkOutLabel,
  statusLabel,
}: {
  /** Already-formatted IST times, or null. */
  checkInLabel: string | null;
  checkOutLabel: string | null;
  /** A status set by a lead or leave, e.g. "Casual leave". */
  statusLabel: string | null;
}) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<AttendanceState>) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.success) toast.success(r.success);
    });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Today&apos;s attendance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div>
            Check-in: <span className="font-medium">{checkInLabel ?? "—"}</span>
          </div>
          <div>
            Check-out: <span className="font-medium">{checkOutLabel ?? "—"}</span>
          </div>
          {statusLabel && <div className="text-muted-foreground">{statusLabel}</div>}
        </div>
        {!checkInLabel ? (
          <Button disabled={pending} onClick={() => run(checkIn)}>
            Check in
          </Button>
        ) : !checkOutLabel ? (
          <Button variant="outline" disabled={pending} onClick={() => run(checkOut)}>
            Check out
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">Done for today</span>
        )}
      </CardContent>
    </Card>
  );
}

// -- Register row (lead / admin) -------------------------------------------

export function RegisterRowForm({
  profileId,
  date,
  checkIn: inValue,
  checkOut: outValue,
  status,
  remarks,
}: {
  profileId: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: string;
  remarks: string;
}) {
  const [action, pending] = useToastAction(saveAttendance);
  // A <form> can't sit between <tr> and <td>, so the form lives in the last
  // cell and the inputs in the other cells join it through `form=`.
  const fid = `att-${profileId}-${date}`;

  return (
    <>
      <td className="p-2">
        <Input form={fid} type="time" name="check_in" defaultValue={inValue} aria-label="Check-in" className="h-8 w-28" />
      </td>
      <td className="p-2">
        <Input form={fid} type="time" name="check_out" defaultValue={outValue} aria-label="Check-out" className="h-8 w-28" />
      </td>
      <td className="p-2">
        <select form={fid} name="status" defaultValue={status} aria-label="Status" className={`${SELECT} h-8 w-40`}>
          <option value="">— Auto —</option>
          {ATTENDANCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].code} · {STATUS_META[s].label}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <Input form={fid} name="remarks" defaultValue={remarks} aria-label="Remarks" className="h-8 min-w-32" />
      </td>
      <td className="p-2 text-right">
        <form id={fid} action={action}>
          <input type="hidden" name="profile_id" value={profileId} />
          <input type="hidden" name="date" value={date} />
          <Button type="submit" size="sm" disabled={pending}>
            Save
          </Button>
        </form>
      </td>
    </>
  );
}

// -- Leave -------------------------------------------------------------------

export function LeaveRequestForm({ today }: { today: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [action, pending] = useToastAction(requestLeave, () => ref.current?.reset());

  return (
    <form ref={ref} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="leave_type">Leave type</Label>
          <select id="leave_type" name="type" className={SELECT} defaultValue="casual">
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {LEAVE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" name="half_day" /> Half day
        </label>
        <div className="space-y-1">
          <Label htmlFor="leave_start">From</Label>
          <Input id="leave_start" name="start_date" type="date" min={today} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="leave_end">To</Label>
          <Input id="leave_end" name="end_date" type="date" min={today} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="leave_reason">Reason</Label>
        <Input id="leave_reason" name="reason" placeholder="Optional" />
      </div>
      <Button type="submit" disabled={pending}>
        Request leave
      </Button>
    </form>
  );
}

export function WithdrawLeaveButton({ id }: { id: string }) {
  return (
    <form action={cancelLeave}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost">
        Withdraw
      </Button>
    </form>
  );
}

export function LeaveDecisionForm({ id, approved }: { id: string; approved: boolean }) {
  const [action, pending] = useToastAction(decideLeave);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {approved ? (
        <Button type="submit" name="decision" value="cancel" size="sm" variant="outline" disabled={pending}>
          Cancel leave
        </Button>
      ) : (
        <>
          <Input name="note" placeholder="Note (optional)" aria-label="Decision note" className="h-8 w-40" />
          <Button type="submit" name="decision" value="approve" size="sm" disabled={pending}>
            Approve
          </Button>
          <Button type="submit" name="decision" value="reject" size="sm" variant="outline" disabled={pending}>
            Reject
          </Button>
        </>
      )}
    </form>
  );
}

// -- Settings ----------------------------------------------------------------

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WorkSettingsForm({
  shiftStart,
  shiftEnd,
  grace,
  hours,
  weeklyOffs,
  morningMeeting,
  eodMeeting,
  dailyCallTarget,
}: {
  morningMeeting: string;
  eodMeeting: string;
  dailyCallTarget: number;
  shiftStart: string;
  shiftEnd: string;
  grace: number;
  hours: number;
  weeklyOffs: number[];
}) {
  const [action, pending] = useToastAction(saveWorkSettings);

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="shift_start">Office starts</Label>
          <Input id="shift_start" name="shift_start" type="time" defaultValue={shiftStart} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="shift_end">Office ends</Label>
          <Input id="shift_end" name="shift_end" type="time" defaultValue={shiftEnd} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="morning_meeting">Morning meeting</Label>
          <Input id="morning_meeting" name="morning_meeting" type="time" defaultValue={morningMeeting} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="eod_meeting">End-of-day meeting</Label>
          <Input id="eod_meeting" name="eod_meeting" type="time" defaultValue={eodMeeting} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="daily_call_target">Daily call target (Business Executives)</Label>
          <Input id="daily_call_target" name="daily_call_target" type="number" min={0} max={500} defaultValue={dailyCallTarget} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="late_grace_minutes">Late after (minutes of grace)</Label>
          <Input id="late_grace_minutes" name="late_grace_minutes" type="number" min={0} max={180} defaultValue={grace} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="standard_hours">Standard hours a day</Label>
          <Input id="standard_hours" name="standard_hours" type="number" step="0.25" min={1} max={16} defaultValue={hours} />
        </div>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Weekly offs</legend>
        <div className="flex flex-wrap gap-3">
          {WEEKDAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="weekly_offs" value={i} defaultChecked={weeklyOffs.includes(i)} />
              {d}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={pending}>
        Save office hours
      </Button>
    </form>
  );
}

export function HolidayForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [action, pending] = useToastAction(addHoliday, () => ref.current?.reset());

  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="holiday_date">Date</Label>
        <Input id="holiday_date" name="date" type="date" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="holiday_name">Holiday</Label>
        <Input id="holiday_name" name="name" placeholder="e.g. Pongal" required />
      </div>
      <Button type="submit" disabled={pending}>
        Add holiday
      </Button>
    </form>
  );
}

export function DeleteHolidayButton({ id }: { id: string }) {
  return (
    <form action={deleteHoliday}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost" className="text-destructive">
        Remove
      </Button>
    </form>
  );
}
