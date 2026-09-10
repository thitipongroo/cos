// Project Insights — the VIEWER's analytics page
// (mockup/mobile/role_viewer/04_insights/01_analytics).
//
// A PUSHED CHILD, NOT A TAB, for the same reason as `/map`: the drawing puts Insights on the bottom
// bar, the five drawings of this set give four different bars, and VIEWER is one of the three roles
// §32.7's table enumerates. The product owner kept the enumerated bar on 2026-09-10 and this screen
// is reached from the navigation drawer. `routeRegistry.ts` therefore requires an `href: null`
// declaration in MobileNav, and `Breadcrumb.tsx` registers the path.
//
// NOT `/dashboard`. That route is the PROJECT_MANAGER's per-project analytics screen, driven by a
// `projectId` param; this one is the viewer's whole assigned portfolio and takes no param. Two
// screens under one name is the `dashboard` mistake recorded at the top of `routeRegistry.ts`.
//
// NO APP BAR AND NO PAGE TITLE OF ITS OWN — <TopBar /> and the breadcrumb name it (§32.7).

import { View } from 'react-native';
import { ProjectInsightsDocument } from '../../components/ProjectInsightsDocument';
import { usePalette } from '../../theme/usePalette';

export default function ProjectInsightsScreen(): React.JSX.Element {
  const palette = usePalette();
  return (
    <View testID="insights-route" style={{ flex: 1, backgroundColor: palette.bg }}>
      <ProjectInsightsDocument />
    </View>
  );
}
