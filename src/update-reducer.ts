import { UpdateAction } from './update-actions';
import { UpdateState } from './update-state';

export function reducer(state: UpdateState, action: UpdateAction): UpdateState {
  switch (action.type) {
    case 'start':
      return {
        state: 'checking',
        series: action.series,
        lastCheck: state.lastCheck,
      };

    case 'startdownload':
      return {
        state: 'downloading',
        series: action.series,
        downloadVersion: action.version,
        progress: 0,
        lastCheck: state.lastCheck,
      };

    case 'progress':
      console.assert(
        state.state === 'downloading' || state.state === 'updatingdb',
        'Should only get a progress action when we are downloading'
      );
      if (state.state !== 'downloading' && state.state !== 'updatingdb') {
        return state;
      }

      return {
        state: state.state,
        series: state.series,
        downloadVersion: state.downloadVersion,
        progress: action.total ? action.loaded / action.total : 0,
        lastCheck: state.lastCheck,
      };

    case 'finishdownload':
      console.assert(
        state.state === 'downloading',
        'Should only get a finishdownload action when we are downloading'
      );
      if (state.state !== 'downloading') {
        return state;
      }

      return {
        state: 'updatingdb',
        series: state.series,
        downloadVersion: state.downloadVersion,
        progress: 0,
        lastCheck: state.lastCheck,
      };

    case 'finishpatch':
      return state;

    case 'finish':
      return { state: 'idle', lastCheck: action.checkDate };

    case 'error':
      return { state: 'idle', lastCheck: action.checkDate || state.lastCheck };
  }
}
