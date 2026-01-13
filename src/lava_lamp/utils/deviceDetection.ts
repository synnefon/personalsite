/**
 * Device detection utilities
 */

export const detectMobile = (): boolean => {
  const userAgent =
    navigator.userAgent ||
    navigator.vendor ||
    (window as Window & { opera?: string }).opera ||
    "";

  // Check for mobile user agents
  const mobileRegex =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const isMobileUA = mobileRegex.test(userAgent);

  // Check for touch capability
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  // Check screen size (fallback)
  const isSmallScreen = window.innerWidth <= 500;

  // Consider it mobile if it has mobile UA OR (has touch AND small screen)
  return isMobileUA || (hasTouch && isSmallScreen);
};
