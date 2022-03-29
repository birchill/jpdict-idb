import { DataSeries } from './data-series';
import { DataVersion } from './data-version';

export type StartAction = {
  type: 'start';
  series: DataSeries;
};

export type StartDownloadAction = {
  type: 'startdownload';
  series: DataSeries;
  version: DataVersion;
};

export type ProgressAction = {
  type: 'progress';
  loaded: number;
  total: number;
};

export type FinishDownloadAction = {
  type: 'finishdownload';
  version: DataVersion;
};

export type FinishPatchAction = {
  type: 'finishpatch';
  version: DataVersion;
};

export type FinishAction = {
  type: 'finish';
  checkDate: Date;
};

export type ErrorAction = {
  type: 'error';
  checkDate: Date | null;
};

export type UpdateAction =
  | StartAction
  | StartDownloadAction
  | ProgressAction
  | FinishDownloadAction
  | FinishPatchAction
  | FinishAction
  | ErrorAction;
