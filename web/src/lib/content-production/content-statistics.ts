import dayjs from "dayjs";

export type ContentStatisticsPeriod = "day" | "week" | "month";

export function contentStatisticsRange(period: ContentStatisticsPeriod, now = new Date().toISOString()) {
    const value = dayjs(now);
    const start = period === "day"
        ? value.startOf("day")
        : period === "month"
            ? value.startOf("month")
            : value.startOf("day").subtract((value.day() + 6) % 7, "day");
    const end = period === "day" ? start.add(1, "day") : period === "week" ? start.add(7, "day") : start.add(1, "month");
    return { start: start.format(), end: end.format() };
}
