import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { AutocompleteItem } from '@earendil-works/pi-tui';
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

  pi.registerFlag('header-info', {
    description: 'Show diagnostic info in custom header',
    type: 'boolean',
    default: false,
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
        {
          value: 'header-info:on',
          label: 'header-info:on',
          description: 'Show diagnostic info in header',
        },
        {
          value: 'header-info:off',
          label: 'header-info:off',
          description: 'Hide diagnostic info in header',
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
        const settings = readPowerlineSettings(ctx.cwd);
        const { powerline, breadcrumb, footer, header } = settings;
        const lines = [
          `powerline: ${powerline ? 'on' : 'off'}`,
          `breadcrumb: ${breadcrumb}`,
          `footer: ${footer ? 'on' : 'off'}`,
          `header: ${header ? 'on' : 'off'}`,
          `header-info: ${settings['header-info'] ? 'on' : 'off'}`,
        ];
        ctx.ui.notify(lines.join('\n'), 'info');
        return;
      }

      // parse namespace:value
      const colonIdx = arg.indexOf(':');
      if (colonIdx === -1) {
        ctx.ui.notify(
          'Usage: /powerline <info|breadcrumb:hide|top|inner|footer:on|off|header:on|off|header-info:on|off>',
          'warning',
        );
        return;
      }

      const ns = arg.slice(0, colonIdx);
      const val = arg.slice(colonIdx + 1);

      if (ns === 'breadcrumb') {
        if (!['hide', 'top', 'inner'].includes(val)) {
          ctx.ui.notify('breadcrumb must be: hide, top, or inner', 'warning');
          return;
        }
        writePowerlineSetting(ctx.cwd, 'breadcrumb', val);
        pi.events.emit('powerline_settings_changed', ctx);
        ctx.ui.notify(`breadcrumb → ${val}`, 'info');
        return;
      }

      if (ns === 'footer' || ns === 'header' || ns === 'header-info') {
        if (val !== 'on' && val !== 'off') {
          ctx.ui.notify(`${ns} must be: on or off`, 'warning');
          return;
        }
        writePowerlineSetting(ctx.cwd, ns, val === 'on');
        pi.events.emit('powerline_settings_changed', ctx);
        ctx.ui.notify(`${ns} → ${val}`, 'info');
        return;
      }

      ctx.ui.notify(
        'Usage: /powerline <breadcrumb:hide|top|inner|footer:on|off|header:on|off|header-info:on|off>',
        'warning',
      );
    },
  });
}
