// Pick a random spot in the current viewport for a floating element,
// avoiding the navbar and the text column. Coordinates are viewport
// relative; callers anchor them to the page with the scroll offset.
export function findSafeViewportSpot({
  size,
  currentPos = { left: null, top: null },
  minDistance = 0,
  margin = 20,
}) {
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  const avoid = [];
  const navbar = document.querySelector(".navbar");
  if (navbar) avoid.push(navbar.getBoundingClientRect());
  const content = document.querySelector(".content-wrapper");
  if (content) avoid.push(content.getBoundingClientRect());

  const overlaps = (left, top, r) =>
    !(
      left + size < r.left ||
      left > r.right ||
      top + size < r.top ||
      top > r.bottom
    );

  for (let attempt = 0; attempt < 100; attempt++) {
    const left = margin + Math.random() * (windowWidth - size - 2 * margin);
    const top = margin + Math.random() * (windowHeight - size - 2 * margin);

    const distance =
      currentPos.left === null || currentPos.top === null
        ? Infinity
        : Math.hypot(left - currentPos.left, top - currentPos.top);

    if (distance >= minDistance && !avoid.some((r) => overlaps(left, top, r))) {
      return { left, top, bottom: null };
    }
  }

  // Fallback: bottom-right corner
  return { left: windowWidth - size - margin, top: null, bottom: margin };
}
