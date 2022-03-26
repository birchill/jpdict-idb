export interface DataVersion {
  major: number;
  minor: number;
  patch: number;
  databaseVersion?: string;
  dateOfCreation: string;
  lang: string;
}
