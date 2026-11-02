package com.facedetection.repository;

import com.facedetection.model.StudentEnrollmentPhoto;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

@Repository
public interface StudentEnrollmentPhotoRepository extends JpaRepository<StudentEnrollmentPhoto, Long> {
    long countByStudentId(Long studentId);

    void deleteByStudentId(Long studentId);

    List<StudentEnrollmentPhoto> findByStudentIdOrderByCapturedAtAsc(Long studentId);

    @Query("""
            SELECT photo
            FROM StudentEnrollmentPhoto photo
            JOIN FETCH photo.student student
            ORDER BY student.id ASC, photo.capturedAt ASC
            """)
    List<StudentEnrollmentPhoto> findAllWithStudentOrderByStudentIdAndCapturedAtAsc();
}
