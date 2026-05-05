import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { AutocompleteItem } from '@mariozechner/pi-tui';
import { registerEditor } from './editor.ts';
import { registerFooter } from './footer.ts';
import { registerHeader } from './header.ts';
import { registerWidget } from './widget.ts';
import { readPowerlineSettings, writePowerlineSetting } from './settings.ts';

export default function (pi: ExtensionAPI) {
  // flags
  pi.registerFlag('powerline', {
    description: 'Enable pi-powerline extensions',
    type: 'boolean',
    default: true,
  });

  pi.registerFlag('breadcrumb', {
    description: 'Breadcrumb display mode: hide, top, inner',
    type: 'string',
    default: 'inner',
  });

  pi.registerFlag('footer', {
    description: 'Enable custom footer with token stats',
    type: 'boolean',
    default: true,
  });

  pi.registerFlag('header', {
    description: 'Enable custom gradient-logo header',
    type: 'boolean',
    default: true,
  });

  // register all sub-extensions
  registerEditor(pi);
  registerFooter(pi);
  registerHeader(pi);
  registerWidget(pi);

  // unified /powerline command
  pi.registerCommand('powerline', {
    description: 'Configure powerline: breadcrumb, footer, header',
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const items: AutocompleteItem[] = [
        {
          value: 'info',
          label: 'info',
          description: 'Show current powerline settings',
        },
        {
          value: 'breadcrumb:hide',
          label: 'breadcrumb:hide',
          description: 'No breadcrumb display',
        },
        {
          value: 'breadcrumb:top',
          label: 'breadcrumb:top',
          description: 'Breadcrumb as a widget above the editor',
        },
        {
          value: 'breadcrumb:inner',
          label: 'breadcrumb:inner',
          description: 'Breadcrumb embedded in editor top border',
        },
        {
          value: 'footer:on',
          label: 'footer:on',
          description: 'Enable custom footer',
        },
        {
          value: 'footer:off',
          label: 'footer:off',
          description: 'Disable custom footer',
        },
        {
          value: 'header:on',
          label: 'header:on',
          description: 'Enable custom header',
        },
        {
          value: 'header:off',
          label: 'header:off',
          description: 'Disable custom header',
        },
      ];
      if (!prefix) return items;
      return items.filter((i) => i.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const arg = args?.trim().toLowerCase();

      // no args: toggle master switch
      if (!arg) {
        const { powerline } = readPowerlineSettings(ctx.cwd);
        const next = !powerline;
        writePowerlineSetting(ctx.cwd, 'powerline', next);
        pi.events.emit('powerline_settings_changed', ctx);
        ctx.ui.notify(`powerline → ${next ? 'on' : 'off'}`, 'info');
        return;
      }

      // show status
      if (arg === 'info') {
        const { powerline, breadcrumb, footer, header } = readPowerlineSettings(ctx.cwd);
        const lines = [
          `powerline: ${powerline ? 'on' : 'off'}`,
          `breadcrumb: ${breadcrumb}`,
          `footer: ${footer ? 'on' : 'off'}`,
          `header: ${header ? 'on' : 'off'}`,
        ];
        ctx.ui.notify(lines.join('\n'), 'info');
        return;
      }

      // parse namespace:value
      const colonIdx = arg.indexOf(':');
      if (colonIdx === -1) {
        ctx.ui.notify(
          'Usage: /powerline <info|breadcrumb:hide|top|inner|footer:on|off|header:on|off>',
          'warning',
        );
        return;
      }

      const ns = arg.slice(0, colonIdx);
      const val = arg.slice(colonIdx + 1);
      let msg = '';

      switch (ns) {
        case 'breadcrumb': {
          if (!['hide', 'top', 'inner'].includes(val)) {
            ctx.ui.notify('breadcrumb must be: hide, top, or inner', 'warning');
            return;
          }
          writePowerlineSetting(ctx.cwd, 'breadcrumb', val);
          pi.events.emit('powerline_settings_changed', ctx);
          msg = `breadcrumb → ${val}`;
          break;
        }
        case 'footer': {
          if (val !== 'on' && val !== 'off') {
            ctx.ui.notify('footer must be: on or off', 'warning');
            return;
          }
          writePowerlineSetting(ctx.cwd, 'footer', val === 'on');
          pi.events.emit('powerline_settings_changed', ctx);
          msg = `footer → ${val}`;
          break;
        }
        case 'header': {
          if (val !== 'on' && val !== 'off') {
            ctx.ui.notify('header must be: on or off', 'warning');
            return;
          }
          writePowerlineSetting(ctx.cwd, 'header', val === 'on');
          pi.events.emit('powerline_settings_changed', ctx);
          msg = `header → ${val}`;
          break;
        }
        default:
          ctx.ui.notify(
            'Usage: /powerline <breadcrumb:hide|top|inner|footer:on|off|header:on|off>',
            'warning',
          );
          return;
      }

      ctx.ui.notify(msg, 'info');
    },
  });
}
