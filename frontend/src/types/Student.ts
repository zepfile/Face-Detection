export interface Student {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  rollNumber: string;
  classGroup: string;
  teacherId?: number | null;
  parentPhone?: string;
  parentEmail?: string;
  faceEncoding?: string;
  enrollmentPhotoCount?: number;
}
