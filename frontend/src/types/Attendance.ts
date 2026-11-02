import type { Student } from "./Student";

export interface Attendance {
  id: number;
  student?: Student;
  studentId?: number;
  date: string;
  entryTime: string;
  markedBy: string;
  sourceEventId?: string;
}
