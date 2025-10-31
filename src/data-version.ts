import { PartInfo } from './part-info.js';

export interface DataVersion {
  major: number;
  minor: number;
  patch: number;
  partInfo?: PartInfo;
  databaseVersion?: string;
  dateOfCreation: string;
  lang: string;
}
