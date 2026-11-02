package com.facedetection.repository;

import com.facedetection.model.Student;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface StudentRepository extends JpaRepository<Student, Long> {
    Optional<Student> findByRollNumber(String rollNumber);

    Optional<Student> findByRollNumberAndTeacherId(String rollNumber, Long teacherId);

    Optional<Student> findByEmail(String email);

    Optional<Student> findByEmailAndTeacherId(String email, Long teacherId);

    List<Student> findByClassGroup(String classGroup);

    List<Student> findByClassGroupAndTeacherId(String classGroup, Long teacherId);

    List<Student> findByTeacherIdOrderByRollNumberAsc(Long teacherId);

    Optional<Student> findByIdAndTeacherId(Long id, Long teacherId);

    boolean existsByIdAndTeacherId(Long id, Long teacherId);

    long countByTeacherId(Long teacherId);

    @Query("""
            SELECT s.classGroup AS classGroup,
                   COUNT(s) AS studentCount
            FROM Student s
            GROUP BY s.classGroup
            ORDER BY s.classGroup
            """)
    List<ClassStudentCountProjection> countStudentsByClassGroup();

    @Query("""
            SELECT s.classGroup AS classGroup,
                   COUNT(s) AS studentCount
            FROM Student s
            WHERE s.teacher.id = :teacherId
            GROUP BY s.classGroup
            ORDER BY s.classGroup
            """)
    List<ClassStudentCountProjection> countStudentsByClassGroupAndTeacherId(@Param("teacherId") Long teacherId);
}
