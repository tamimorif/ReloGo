/**
 * Whether an auth screen's blue hero has moved past the native status bar.
 *
 * Auth headers sit behind the iOS status bar, so the icon color must change
 * once scrolling exposes the light form background underneath it.
 */
export function shouldUseDarkAuthStatusBar(
  scrollOffsetY: number,
  headerHeight: number,
  statusBarInsetTop: number,
): boolean {
  return (
    headerHeight > 0 &&
    scrollOffsetY + statusBarInsetTop >= headerHeight
  );
}
