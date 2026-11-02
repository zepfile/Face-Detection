package com.facedetection.controller;

import com.facedetection.model.StudentEnrollmentPhoto;
import com.facedetection.repository.StudentEnrollmentPhotoRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
public class AiSyncController {

    private final StudentEnrollmentPhotoRepository enrollmentPhotoRepository;

    public AiSyncController(StudentEnrollmentPhotoRepository enrollmentPhotoRepository) {
        this.enrollmentPhotoRepository = enrollmentPhotoRepository;
    }

    @GetMapping("/enrollment-photos")
    @PreAuthorize("hasAnyRole('ADMIN','AI')")
    public ResponseEntity<EnrollmentPhotosResponse> getEnrollmentPhotos() {
        List<StudentEnrollmentPhoto> rows = enrollmentPhotoRepository.findAllWithStudentOrderByStudentIdAndCapturedAtAsc();

        Map<Long, List<String>> grouped = new LinkedHashMap<>();
        for (StudentEnrollmentPhoto row : rows) {
            if (row.getStudent() == null || row.getStudent().getId() == null) {
                continue;
            }
            Long studentId = row.getStudent().getId();
            grouped.computeIfAbsent(studentId, ignored -> new ArrayList<>()).add(row.getImageData());
        }

        List<StudentEnrollmentPhotos> students = grouped.entrySet().stream()
                .map(entry -> new StudentEnrollmentPhotos(entry.getKey(), entry.getValue()))
                .toList();

        return ResponseEntity.ok(new EnrollmentPhotosResponse(students));
    }

    public record EnrollmentPhotosResponse(List<StudentEnrollmentPhotos> students) {
    }

    public record StudentEnrollmentPhotos(Long studentId, List<String> images) {
    }
}
