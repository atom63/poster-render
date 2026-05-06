export function planSectionPages(sections, {
  availableHeight,
  getSectionHeight,
  getSectionGap = () => 0,
  getSectionImage = () => null,
} = {}) {
  if (!Array.isArray(sections)) {
    throw new TypeError("sections must be an array");
  }
  if (typeof availableHeight !== "number" || !Number.isFinite(availableHeight)) {
    throw new TypeError("availableHeight must be a finite number");
  }
  if (typeof getSectionHeight !== "function") {
    throw new TypeError("getSectionHeight must be a function");
  }

  const pages = [];
  let currentPage = [];
  let usedHeight = 0;

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    const imgData = getSectionImage(section, si);
    const secH = getSectionHeight(section, si);
    const gap = currentPage.length > 0 ? getSectionGap(section, si) : 0;
    const forceNewPage = imgData && currentPage.length > 0;

    if (forceNewPage || (currentPage.length > 0 && usedHeight + gap + secH > availableHeight)) {
      pages.push(currentPage);
      currentPage = [si];
      usedHeight = secH;
    } else {
      currentPage.push(si);
      usedHeight += gap + secH;
    }
  }

  if (currentPage.length > 0) pages.push(currentPage);
  return pages;
}
