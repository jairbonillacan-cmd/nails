// The nails theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in nails.settings.json and the generated nails.settings.ts;
// change them with `astryx experimental theme editor set nails ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {nailsSettings} from './nails.settings';

export const nailsTheme = defineTheme({
  extends: nailsSettings,
  name: 'nails',
});
