from datetime import datetime, time, timezone


def get_current_time() -> datetime:
    # Use UTC consistently across AI service and backend.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def is_within_schedule(start: time, end: time) -> bool:
    now = get_current_time().time()

    if start <= end:
        return start <= now <= end

    # Overnight schedule, e.g. 22:00 to 06:00.
    return now >= start or now <= end


def format_time(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S UTC")
