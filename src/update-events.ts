import { DataSeries } from './data-series';
import { DataVersion } from './data-version';

export type UpdateStartEvent = {
  type: 'updatestart';
  series: DataSeries;
};

export type UpdateEndEvent = {
  type: 'updateend';
  series: DataSeries;
};

export type FileStartEvent = {
  type: 'filestart';
  series: DataSeries;
  version: DataVersion;
};

export type FileEndEvent = {
  type: 'fileend';
  series: DataSeries;
};

export type ProgressEvent = {
  type: 'progress';
  series: DataSeries;
  fileProgress: number;
  totalProgress: number;
};

export type ParseErrorEvent = {
  type: 'parseerror';
  series: DataSeries;
  message: string;
  record: Record<string, unknown>;
};

export type UpdateEvent =
  | UpdateStartEvent
  | UpdateEndEvent
  | FileStartEvent
  | FileEndEvent
  | ProgressEvent
  | ParseErrorEvent;
