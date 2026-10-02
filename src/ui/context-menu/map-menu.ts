/**
 * Map menu — builds the MenuItem tree for a right-click anywhere on the map
 * view (UI: Helicopter view). Pure construction, like the other builders.
 * Scene commands are absent on purpose: while the map is shown their subject
 * is not on screen (docs/map-view.md §7.4).
 */

import type { MenuItem } from './menu-renderer';
import type { MenuDependencies } from './menu-context';
import { SettingsModal } from '../components/settings-modal';
import { isEditMode } from '../../storage/app-mode';
import { getSetting } from '../../config';

export function buildMapMenu(deps: MenuDependencies): MenuItem[] {
  const { mapView } = deps.features;
  const editMode = isEditMode();
  const step = getSetting('node.scaleStep');
  const scaleItems = (group: 'landmarks' | 'markers', keyName: string): MenuItem[] => [
    {
      label: `Enlarge (${keyName})`,
      enabled: editMode,
      action: () => {
        mapView.scaleGroup(group, step);
      }
    },
    {
      label: `Shrink (Shift+${keyName})`,
      enabled: editMode,
      action: () => {
        mapView.scaleGroup(group, 1 / step);
      }
    }
  ];
  return [
    {
      label: 'Previous focus ([)',
      enabled: mapView.canGoBack(),
      action: () => {
        mapView.back();
      }
    },
    {
      label: 'Next focus (])',
      enabled: mapView.canGoForward(),
      action: () => {
        mapView.forward();
      }
    },
    {
      label: 'Size of all landmarks',
      children: scaleItems('landmarks', 'W')
    },
    {
      label: 'Size of all markers',
      children: scaleItems('markers', 'M')
    },
    {
      label: 'Reset',
      children: [
        {
          label: 'Distances and sizes of this map',
          enabled: editMode,
          action: () => {
            mapView.reset({ directions: false });
          }
        },
        {
          label: 'Directions too (shared by all maps)',
          enabled: editMode,
          action: () => {
            mapView.reset({ directions: true });
          }
        },
        {
          label: 'Every map and every direction…',
          enabled: editMode,
          action: () => {
            if (window.confirm('Forget the adjustments of every map and the direction of every edge? This cannot be undone.')) {
              mapView.resetAll();
            }
          }
        }
      ]
    },
    {
      label: 'Base view (F)',
      action: () => {
        mapView.reframe();
      }
    },
    {
      label: 'Back to scene (Esc)',
      action: () => {
        mapView.hide();
      }
    },
    {
      label: 'Settings (⌘,)',
      action: () => {
        new SettingsModal().open();
      }
    }
  ];
}
