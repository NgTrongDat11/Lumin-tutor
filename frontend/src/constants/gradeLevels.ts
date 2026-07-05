export interface GradeLevelOption {
  value: string;
  label: string;
}

export interface EducationStage {
  value: string;
  label: string;
  grades: GradeLevelOption[];
}

export const EDUCATION_STAGES: EducationStage[] = [
  {
    value: 'CAP_1',
    label: 'Cấp 1 (Tiểu học)',
    grades: [
      { value: 'Lớp 1', label: 'Lớp 1' },
      { value: 'Lớp 2', label: 'Lớp 2' },
      { value: 'Lớp 3', label: 'Lớp 3' },
      { value: 'Lớp 4', label: 'Lớp 4' },
      { value: 'Lớp 5', label: 'Lớp 5' },
    ],
  },
  {
    value: 'CAP_2',
    label: 'Cấp 2 (THCS)',
    grades: [
      { value: 'Lớp 6', label: 'Lớp 6' },
      { value: 'Lớp 7', label: 'Lớp 7' },
      { value: 'Lớp 8', label: 'Lớp 8' },
      { value: 'Lớp 9', label: 'Lớp 9' },
    ],
  },
  {
    value: 'CAP_3',
    label: 'Cấp 3 (THPT)',
    grades: [
      { value: 'Lớp 10', label: 'Lớp 10' },
      { value: 'Lớp 11', label: 'Lớp 11' },
      { value: 'Lớp 12', label: 'Lớp 12' },
    ],
  },
  {
    value: 'OTHER',
    label: 'Khác',
    grades: [],
  },
];

export const ALL_GRADE_LEVELS = EDUCATION_STAGES.flatMap((stage) => stage.grades.map((g) => g.value));

export function inferStageAndGrade(academicLevel: string | null | undefined) {
  if (!academicLevel) {
    return { stage: '', grade: '', custom: '' };
  }

  for (const stage of EDUCATION_STAGES) {
    const found = stage.grades.find((g) => g.value === academicLevel);
    if (found) {
      return { stage: stage.value, grade: academicLevel, custom: '' };
    }
  }

  return { stage: 'OTHER', grade: 'CUSTOM', custom: academicLevel };
}
