package com.facedetection.repository;

import com.facedetection.model.Attendance;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import org.springframework.data.repository.query.Param;

@Repository
public interface AttendanceRepository extends JpaRepository<Attendance, Long> {
    List<Attendance> findByStudentIdAndDateBetweenOrderByEntryTimeDesc(Long studentId, LocalDate startDate, LocalDate endDate);

    List<Attendance> findByStudentIdAndStudentTeacherIdAndDateBetweenOrderByEntryTimeDesc(
            Long studentId,
            Long teacherId,
            LocalDate startDate,
            LocalDate endDate);

    List<Attendance> findByDateOrderByEntryTimeDesc(LocalDate date);

    List<Attendance> findByDateAndStudentTeacherIdOrderByEntryTimeDesc(LocalDate date, Long teacherId);

    Optional<Attendance> findByStudentIdAndDate(Long studentId, LocalDate date);

    Optional<Attendance> findBySourceEventId(String sourceEventId);

    long countByDate(LocalDate date);

    long countByDateAndStudentTeacherId(LocalDate date, Long teacherId);

    List<Attendance> findByDateBetweenOrderByDateAscEntryTimeAsc(LocalDate startDate, LocalDate endDate);

    List<Attendance> findByDateAndEntryTimeAfterOrderByEntryTimeAsc(LocalDate date, LocalDateTime cutoff);

    List<Attendance> findByDateAndStudentTeacherIdAndEntryTimeAfterOrderByEntryTimeAsc(
            LocalDate date,
            Long teacherId,
            LocalDateTime cutoff);

    @Query("""
            SELECT a.date AS date,
                   COUNT(a) AS entryCount
            FROM Attendance a
            WHERE a.date BETWEEN :fromDate AND :toDate
            GROUP BY a.date
            ORDER BY a.date
            """)
    List<DailyAttendanceProjection> aggregateDailyAttendance(
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate);

    @Query("""
            SELECT a.date AS date,
                   COUNT(a) AS entryCount
            FROM Attendance a
            WHERE a.student.teacher.id = :teacherId
              AND a.date BETWEEN :fromDate AND :toDate
            GROUP BY a.date
            ORDER BY a.date
            """)
    List<DailyAttendanceProjection> aggregateDailyAttendanceForTeacher(
            @Param("teacherId") Long teacherId,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate);

    @Query("""
            SELECT a.date AS date,
                   COUNT(a) AS entryCount
            FROM Attendance a
            WHERE a.student.id = :studentId
              AND a.date BETWEEN :fromDate AND :toDate
            GROUP BY a.date
            ORDER BY a.date
            """)
    List<DailyAttendanceProjection> aggregateStudentTrend(
            @Param("studentId") Long studentId,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate);

    @Query("""
            SELECT a.date AS date,
                   COUNT(a) AS entryCount
            FROM Attendance a
            WHERE a.student.id = :studentId
              AND a.student.teacher.id = :teacherId
              AND a.date BETWEEN :fromDate AND :toDate
            GROUP BY a.date
            ORDER BY a.date
            """)
    List<DailyAttendanceProjection> aggregateStudentTrendForTeacher(
            @Param("studentId") Long studentId,
            @Param("teacherId") Long teacherId,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate);

    @Query("""
            SELECT s.classGroup AS classGroup,
                   COUNT(a) AS entryCount
            FROM Attendance a
            JOIN a.student s
            WHERE a.date = :date
            GROUP BY s.classGroup
            ORDER BY s.classGroup
            """)
    List<ClassAttendanceProjection> aggregateClassWiseByDate(@Param("date") LocalDate date);

    @Query("""
            SELECT s.classGroup AS classGroup,
                   COUNT(a) AS entryCount
            FROM Attendance a
            JOIN a.student s
            WHERE a.date = :date
              AND s.teacher.id = :teacherId
            GROUP BY s.classGroup
            ORDER BY s.classGroup
            """)
    List<ClassAttendanceProjection> aggregateClassWiseByDateAndTeacherId(
            @Param("date") LocalDate date,
            @Param("teacherId") Long teacherId);
}
