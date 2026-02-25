// /lib/soloTournaments.ts
// Auto-generates weekly solo tournament IDs and date ranges

export function getWeekId(date: Date): string {
  const d = new Date(date);
  // Get Monday of this week
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  const year = d.getFullYear();
  // ISO week number
  const startOfYear = new Date(year, 0, 1);
  const weekNo = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}

export function getWeekDates(weekId: string): {
  weekStart: Date;
  weekEnd: Date;
  registrationDeadline: Date;
} {
  const [year, week] = weekId.split("-W").map(Number);
  // Get Monday of that ISO week
  const jan4 = new Date(year, 0, 4); // Jan 4 is always in week 1
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1);

  const weekStart = new Date(startOfWeek1);
  weekStart.setDate(startOfWeek1.getDate() + (week - 1) * 7);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const registrationDeadline = new Date(weekStart);
  registrationDeadline.setDate(weekStart.getDate() + 5); // Saturday
  registrationDeadline.setHours(23, 59, 59, 999);

  return { weekStart, weekEnd, registrationDeadline };
}

export function getThreeWeeks(): { last: string; current: string; next: string } {
  const now = new Date();
  const current = getWeekId(now);

  const lastDate = new Date(now);
  lastDate.setDate(now.getDate() - 7);
  const last = getWeekId(lastDate);

  const nextDate = new Date(now);
  nextDate.setDate(now.getDate() + 7);
  const next = getWeekId(nextDate);

  return { last, current, next };
}

export function formatWeekLabel(weekId: string): string {
  const { weekStart, weekEnd } = getWeekDates(weekId);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${weekStart.toLocaleDateString("en-IN", opts)} – ${weekEnd.toLocaleDateString("en-IN", opts)}`;
}

export function getTimeUntilDeadline(registrationDeadline: string): string {
  const now = new Date();
  const deadline = new Date(registrationDeadline);
  const diff = deadline.getTime() - now.getTime();
  if (diff <= 0) return "Registration Closed";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}