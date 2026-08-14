(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TACTIC_SHARE = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function buildShareData(file) {
    return {
      files: [file],
      title: '羽毛球战术板',
      text: '羽毛球战术图',
    };
  }

  function canShareFiles(navigatorLike, data) {
    if (!navigatorLike || typeof navigatorLike.share !== 'function') return false;
    if (typeof navigatorLike.canShare !== 'function') return true;
    try {
      return navigatorLike.canShare({ files: data.files });
    } catch (error) {
      return false;
    }
  }

  function copyImageToClipboard(navigatorLike, blob, ClipboardItemLike) {
    const Item = ClipboardItemLike || (typeof ClipboardItem !== 'undefined' ? ClipboardItem : null);
    if (!navigatorLike || !navigatorLike.clipboard || typeof navigatorLike.clipboard.write !== 'function' || !Item) {
      return Promise.resolve(false);
    }
    try {
      return navigatorLike.clipboard.write([new Item({ 'image/png': blob })]).then(function () {
        return true;
      }, function () {
        return false;
      });
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  return { buildShareData, canShareFiles, copyImageToClipboard };
});
