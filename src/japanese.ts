export function isKanji(str: string): boolean {
  const c = str.codePointAt(0) || 0;
  return (
    (c >= 0x4e00 && c <= 0x9fea) ||
    /* Ideographs extension A */
    (c >= 0x3400 && c <= 0x4dbf) ||
    /* Ideographs extension B&C&D&E */
    (c >= 0x20000 && c <= 0x2ebef)
  );
}

export function hasHiragana(str: string): boolean {
  return [...str]
    .map((c) => c.codePointAt(0)!)
    .some((c) => c >= 0x3041 && c <= 0x309f);
}
