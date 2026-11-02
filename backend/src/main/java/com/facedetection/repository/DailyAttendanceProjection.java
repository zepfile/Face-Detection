package com.facedetection.repository;

import java.time.LocalDate;

public interface DailyAttendanceProjection {
    LocalDate getDate();

    Long getEntryCount();
}
