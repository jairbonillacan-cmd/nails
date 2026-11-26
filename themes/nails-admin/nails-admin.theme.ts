// The nails-admin theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in nails-admin.settings.json and the generated nails-admin.settings.ts;
// change them with `astryx experimental theme editor set nails-admin ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {nailsAdminSettings} from './nails-admin.settings';

export const nailsAdminTheme = defineTheme({
  extends: nailsAdminSettings,
  name: 'nails-admin',
});
