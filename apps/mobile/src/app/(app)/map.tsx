// Project Map — the VIEWER's site map (mockup/mobile/role_viewer/03_map/01_map_viewer).
//
// A PUSHED CHILD, NOT A TAB. The drawing puts Map on the bottom bar, but the five drawings of this
// set give four different bars and VIEWER is one of the three roles §32.7's table enumerates; the
// product owner kept the enumerated bar on 2026-09-10 (Home | Projects | Procurement | Budget) and
// this screen is reached from the navigation drawer instead. `routeRegistry.ts` therefore requires
// an `href: null` declaration in MobileNav, and `Breadcrumb.tsx` registers the path — which is what
// makes it read as a child rather than a lost tab.
//
// NO APP BAR AND NO PAGE TITLE OF ITS OWN — <TopBar /> supplies the brand and the back control, and
// the breadcrumb names the screen (§32.7 "a screen is named ONCE").
//
// The document is a separate component so the map and its sheet can be rendered by a render test
// without the tab shell around them. Everything this screen does and does not claim about being a
// map is in that file's header.

import { View } from 'react-native';
import { ProjectMapDocument } from '../../components/ProjectMapDocument';
import { usePalette } from '../../theme/usePalette';

export default function ProjectMapScreen(): React.JSX.Element {
  const palette = usePalette();
  return (
    <View testID="map-screen" style={{ flex: 1, backgroundColor: palette.bg }}>
      <ProjectMapDocument />
    </View>
  );
}
